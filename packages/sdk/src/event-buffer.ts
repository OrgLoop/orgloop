/**
 * EventBuffer — streaming, size-capped JSONL buffer for webhook connectors.
 *
 * Replaces the previous pattern of readFileSync() on the entire buffer file,
 * which crashed with V8 string length errors on large files (~560MB / 37k events).
 *
 * Features:
 * - Streaming line-by-line reads (no full-file load)
 * - Configurable size cap (default 50MB) with oldest-first eviction
 * - Auto-prune: clears buffer after successful poll
 * - Graceful startup: handles arbitrarily large legacy buffer files
 */

import {
	appendFileSync,
	closeSync,
	createReadStream,
	existsSync,
	mkdirSync,
	openSync,
	readSync,
	renameSync,
	statSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { OrgLoopEvent } from './types.js';

const DEFAULT_MAX_BUFFER_BYTES = 50 * 1024 * 1024; // 50 MB
const CHUNK_SIZE = 16 * 1024 * 1024; // 16 MB read chunks

export interface EventBufferConfig {
	/** Directory to store buffer files */
	bufferDir: string;
	/** Prefix for the buffer filename (e.g. "webhook", "github-webhook") */
	filePrefix: string;
	/** Source ID, used in the filename */
	sourceId: string;
	/** Maximum buffer file size in bytes. Default: 50MB. When exceeded, oldest events are dropped. */
	maxBufferBytes?: number;
}

/**
 * Parse a human-readable size string to bytes.
 * Supports: "50MB", "1GB", "500KB", "1024B"
 */
export function parseBufferSize(size: string): number {
	const match = size.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
	if (!match) {
		throw new Error(
			`Invalid buffer size: "${size}". Expected format: <number><unit> (e.g., 50MB, 1GB)`,
		);
	}
	const value = Number.parseFloat(match[1]);
	const unit = match[2].toUpperCase();
	switch (unit) {
		case 'B':
			return value;
		case 'KB':
			return value * 1024;
		case 'MB':
			return value * 1024 * 1024;
		case 'GB':
			return value * 1024 * 1024 * 1024;
		default:
			throw new Error(`Unknown size unit: ${unit}`);
	}
}

/**
 * Read JSONL lines from a file using chunked reads to avoid V8 string length limits.
 * Returns raw JSON strings (one per line).
 */
function readLinesChunked(filePath: string): string[] {
	const lines: string[] = [];
	const fd = openSync(filePath, 'r');
	try {
		let remainder = '';
		const buf = Buffer.alloc(CHUNK_SIZE);
		let position = 0;
		let bytesRead: number;

		do {
			bytesRead = readSync(fd, buf, 0, CHUNK_SIZE, position);
			if (bytesRead === 0) break;
			position += bytesRead;

			const chunk = remainder + buf.toString('utf-8', 0, bytesRead);
			const parts = chunk.split('\n');
			remainder = parts.pop() ?? '';

			for (const part of parts) {
				const trimmed = part.trim();
				if (trimmed) lines.push(trimmed);
			}
		} while (bytesRead === CHUNK_SIZE);

		if (remainder.trim()) {
			lines.push(remainder.trim());
		}
	} finally {
		closeSync(fd);
	}
	return lines;
}

export class EventBuffer {
	readonly path: string;
	private readonly maxBytes: number;
	private readonly dir: string;

	constructor(config: EventBufferConfig) {
		this.dir = config.bufferDir;
		this.path = join(config.bufferDir, `${config.filePrefix}-${config.sourceId}.jsonl`);
		this.maxBytes = config.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;
	}

	/** Ensure buffer directory exists. Call during connector init(). */
	ensureDir(): void {
		if (!existsSync(this.dir)) {
			mkdirSync(this.dir, { recursive: true });
		}
	}

	/** Append a single event to the buffer file (sync, called from webhook handler). */
	append(event: OrgLoopEvent): void {
		appendFileSync(this.path, `${JSON.stringify(event)}\n`);
	}

	/**
	 * Load all buffered events using streaming line-by-line reads.
	 * Handles arbitrarily large files without hitting V8 string limits.
	 */
	async loadEvents(): Promise<OrgLoopEvent[]> {
		if (!existsSync(this.path)) return [];
		try {
			if (statSync(this.path).size === 0) return [];
		} catch {
			return [];
		}

		const events: OrgLoopEvent[] = [];
		const rl = createInterface({
			input: createReadStream(this.path, { encoding: 'utf-8' }),
			crlfDelay: Number.POSITIVE_INFINITY,
		});

		for await (const line of rl) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				events.push(JSON.parse(trimmed) as OrgLoopEvent);
			} catch {
				// Skip malformed lines
			}
		}

		return events;
	}

	/**
	 * Load all events and clear the buffer file (atomic drain for poll()).
	 * This is the primary method connectors call during poll().
	 */
	async drain(): Promise<OrgLoopEvent[]> {
		const events = await this.loadEvents();
		this.truncate();
		return events;
	}

	/**
	 * Load events using chunked sync reads (avoids V8 string limit).
	 * Returns parsed events and truncates the file.
	 */
	drainSync(): OrgLoopEvent[] {
		if (!existsSync(this.path)) return [];
		try {
			if (statSync(this.path).size === 0) return [];
		} catch {
			return [];
		}

		const lines = readLinesChunked(this.path);
		const events: OrgLoopEvent[] = [];
		for (const line of lines) {
			try {
				events.push(JSON.parse(line) as OrgLoopEvent);
			} catch {
				// Skip malformed lines
			}
		}

		this.truncate();
		return events;
	}

	/** Truncate the buffer file. */
	truncate(): void {
		try {
			writeFileSync(this.path, '');
		} catch {
			// Best effort
		}
	}

	/**
	 * Enforce the size cap. If the buffer file exceeds maxBytes,
	 * rewrite it keeping only the newest events that fit.
	 * Call after append() to prevent unbounded growth.
	 */
	enforceSize(onEvict?: (droppedCount: number) => void): void {
		if (!existsSync(this.path)) return;

		let fileSize: number;
		try {
			fileSize = statSync(this.path).size;
		} catch {
			return;
		}
		if (fileSize <= this.maxBytes) return;

		const allLines = readLinesChunked(this.path);

		// Walk backward, keeping newest lines that fit under the cap
		let totalBytes = 0;
		let keepFrom = allLines.length;
		for (let i = allLines.length - 1; i >= 0; i--) {
			const lineBytes = Buffer.byteLength(allLines[i], 'utf-8') + 1; // +1 for newline
			if (totalBytes + lineBytes > this.maxBytes) break;
			totalBytes += lineBytes;
			keepFrom = i;
		}

		const dropped = keepFrom;
		if (dropped > 0 && onEvict) {
			onEvict(dropped);
		}

		// Atomic rewrite: write to temp file, then rename
		const tmpPath = `${this.path}.tmp`;
		const kept = allLines.slice(keepFrom);
		writeFileSync(tmpPath, kept.length > 0 ? `${kept.join('\n')}\n` : '');
		try {
			renameSync(tmpPath, this.path);
		} catch {
			// Fallback: direct overwrite if rename fails (cross-device, etc.)
			writeFileSync(this.path, kept.length > 0 ? `${kept.join('\n')}\n` : '');
			try {
				unlinkSync(tmpPath);
			} catch {
				// ignore
			}
		}
	}

	/** Get current buffer file size in bytes, or 0 if not found. */
	size(): number {
		try {
			return statSync(this.path).size;
		} catch {
			return 0;
		}
	}
}
