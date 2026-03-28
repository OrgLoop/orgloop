import { writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBuffer, parseBufferSize } from '../event-buffer.js';
import { createTestEvent } from '../testing.js';

describe('parseBufferSize', () => {
	it('parses bytes', () => {
		expect(parseBufferSize('1024B')).toBe(1024);
	});

	it('parses kilobytes', () => {
		expect(parseBufferSize('512KB')).toBe(512 * 1024);
	});

	it('parses megabytes', () => {
		expect(parseBufferSize('50MB')).toBe(50 * 1024 * 1024);
	});

	it('parses gigabytes', () => {
		expect(parseBufferSize('1GB')).toBe(1024 * 1024 * 1024);
	});

	it('is case-insensitive', () => {
		expect(parseBufferSize('50mb')).toBe(50 * 1024 * 1024);
	});

	it('throws on invalid format', () => {
		expect(() => parseBufferSize('abc')).toThrow('Invalid buffer size');
	});
});

describe('EventBuffer', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'orgloop-test-buffer-'));
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	function createBuffer(opts?: { maxBufferBytes?: number; prefix?: string }) {
		return new EventBuffer({
			bufferDir: tempDir,
			filePrefix: opts?.prefix ?? 'test',
			sourceId: 'src1',
			maxBufferBytes: opts?.maxBufferBytes,
		});
	}

	describe('append and drain', () => {
		it('appends and drains events', async () => {
			const buf = createBuffer();
			const e1 = createTestEvent({ source: 'a' });
			const e2 = createTestEvent({ source: 'b' });

			buf.append(e1);
			buf.append(e2);

			const events = await buf.drain();
			expect(events).toHaveLength(2);
			expect(events[0].source).toBe('a');
			expect(events[1].source).toBe('b');
		});

		it('truncates the file after drain', async () => {
			const buf = createBuffer();
			buf.append(createTestEvent());

			await buf.drain();

			// Second drain should return empty
			const events = await buf.drain();
			expect(events).toHaveLength(0);
		});

		it('returns empty array when file does not exist', async () => {
			const buf = createBuffer();
			const events = await buf.drain();
			expect(events).toHaveLength(0);
		});

		it('returns empty array for empty file', async () => {
			const buf = createBuffer();
			writeFileSync(buf.path, '');
			const events = await buf.drain();
			expect(events).toHaveLength(0);
		});
	});

	describe('drainSync', () => {
		it('reads and clears events synchronously', () => {
			const buf = createBuffer();
			buf.append(createTestEvent({ source: 'x' }));
			buf.append(createTestEvent({ source: 'y' }));

			const events = buf.drainSync();
			expect(events).toHaveLength(2);
			expect(events[0].source).toBe('x');

			// Should be empty after drain
			expect(buf.drainSync()).toHaveLength(0);
		});

		it('returns empty for missing file', () => {
			const buf = createBuffer();
			expect(buf.drainSync()).toHaveLength(0);
		});
	});

	describe('streaming reads (large files)', () => {
		it('handles files with many events via async drain', async () => {
			const buf = createBuffer();
			const count = 1000;
			for (let i = 0; i < count; i++) {
				buf.append(createTestEvent({ source: `src-${i}` }));
			}

			const events = await buf.drain();
			expect(events).toHaveLength(count);
			expect(events[0].source).toBe('src-0');
			expect(events[999].source).toBe('src-999');
		});

		it('handles files with many events via sync drain', () => {
			const buf = createBuffer();
			const count = 500;
			for (let i = 0; i < count; i++) {
				buf.append(createTestEvent({ source: `src-${i}` }));
			}

			const events = buf.drainSync();
			expect(events).toHaveLength(count);
		});
	});

	describe('malformed lines', () => {
		it('skips malformed JSON lines in async drain', async () => {
			const buf = createBuffer();
			const e1 = createTestEvent({ source: 'good' });
			// Write a good line, a bad line, and another good line
			writeFileSync(buf.path, `${JSON.stringify(e1)}\nNOT VALID JSON\n${JSON.stringify(e1)}\n`);

			const events = await buf.drain();
			expect(events).toHaveLength(2);
		});

		it('skips malformed JSON lines in sync drain', () => {
			const buf = createBuffer();
			const e1 = createTestEvent({ source: 'good' });
			writeFileSync(buf.path, `${JSON.stringify(e1)}\n{broken\n${JSON.stringify(e1)}\n`);

			const events = buf.drainSync();
			expect(events).toHaveLength(2);
		});

		it('skips empty lines', async () => {
			const buf = createBuffer();
			const e1 = createTestEvent();
			writeFileSync(buf.path, `\n\n${JSON.stringify(e1)}\n\n`);

			const events = await buf.drain();
			expect(events).toHaveLength(1);
		});
	});

	describe('size cap enforcement', () => {
		it('does nothing when file is under the cap', () => {
			const buf = createBuffer({ maxBufferBytes: 10 * 1024 * 1024 });
			buf.append(createTestEvent());
			const onEvict = vi.fn();

			buf.enforceSize(onEvict);

			expect(onEvict).not.toHaveBeenCalled();
		});

		it('evicts oldest events when file exceeds cap', () => {
			// Use a very small cap to trigger eviction easily
			const buf = createBuffer({ maxBufferBytes: 500 });
			// Each event is ~300+ bytes as JSON
			for (let i = 0; i < 10; i++) {
				buf.append(createTestEvent({ source: `src-${i}` }));
			}

			const onEvict = vi.fn();
			buf.enforceSize(onEvict);

			expect(onEvict).toHaveBeenCalled();
			const dropped = onEvict.mock.calls[0][0];
			expect(dropped).toBeGreaterThan(0);

			// Remaining events should fit under cap
			expect(buf.size()).toBeLessThanOrEqual(500);
		});

		it('keeps newest events after eviction', async () => {
			const buf = createBuffer({ maxBufferBytes: 500 });
			for (let i = 0; i < 10; i++) {
				buf.append(createTestEvent({ source: `src-${i}` }));
			}

			buf.enforceSize();

			const events = await buf.drain();
			// The last event should be the newest one
			expect(events.length).toBeGreaterThan(0);
			expect(events[events.length - 1].source).toBe('src-9');
		});

		it('handles file not existing', () => {
			const buf = createBuffer();
			// Should not throw
			buf.enforceSize();
		});
	});

	describe('ensureDir', () => {
		it('creates directory if missing', () => {
			const nested = join(tempDir, 'sub', 'dir');
			const buf = new EventBuffer({
				bufferDir: nested,
				filePrefix: 'test',
				sourceId: 'src1',
			});
			buf.ensureDir();
			buf.append(createTestEvent());

			expect(buf.size()).toBeGreaterThan(0);
		});
	});

	describe('size', () => {
		it('returns 0 for missing file', () => {
			const buf = createBuffer();
			expect(buf.size()).toBe(0);
		});

		it('returns file size in bytes', () => {
			const buf = createBuffer();
			buf.append(createTestEvent());
			expect(buf.size()).toBeGreaterThan(0);
		});
	});

	describe('buffer file naming', () => {
		it('uses prefix and sourceId in filename', () => {
			const buf = new EventBuffer({
				bufferDir: tempDir,
				filePrefix: 'github-webhook',
				sourceId: 'my-github',
			});
			expect(buf.path).toBe(join(tempDir, 'github-webhook-my-github.jsonl'));
		});
	});
});
