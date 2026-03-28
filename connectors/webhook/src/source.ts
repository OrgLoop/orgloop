/**
 * Generic webhook source connector — receives inbound webhooks and normalizes to OrgLoop events.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
	OrgLoopEvent,
	PollResult,
	SourceConfig,
	SourceConnector,
	WebhookHandler,
} from '@orgloop/sdk';
import { buildEvent, EventBuffer, parseBufferSize } from '@orgloop/sdk';

/** Resolve env var references like ${WEBHOOK_SECRET} */
function resolveEnvVar(value: string): string {
	const match = value.match(/^\$\{(.+)\}$/);
	if (match) {
		const envValue = process.env[match[1]];
		if (!envValue) {
			throw new Error(`Environment variable ${match[1]} is not set`);
		}
		return envValue;
	}
	return value;
}

interface WebhookSourceConfig {
	path?: string;
	secret?: string;
	event_type_field?: string;
	buffer_dir?: string;
	/** Maximum buffer file size (e.g. "50MB", "1GB"). Default: 50MB. */
	max_buffer_size?: string;
}

export class WebhookSource implements SourceConnector {
	readonly id = 'webhook';
	private secret?: string;
	private eventTypeField = 'type';
	private pendingEvents: OrgLoopEvent[] = [];
	private sourceId = 'webhook';
	private buffer?: EventBuffer;

	async init(config: SourceConfig): Promise<void> {
		this.sourceId = config.id;
		const cfg = config.config as unknown as WebhookSourceConfig;
		this.eventTypeField = cfg.event_type_field ?? 'type';
		if (cfg.secret) {
			this.secret = resolveEnvVar(cfg.secret);
		}
		if (cfg.buffer_dir) {
			const dir = resolveEnvVar(cfg.buffer_dir);
			this.buffer = new EventBuffer({
				bufferDir: dir,
				filePrefix: 'webhook',
				sourceId: this.sourceId,
				maxBufferBytes: cfg.max_buffer_size ? parseBufferSize(cfg.max_buffer_size) : undefined,
			});
			this.buffer.ensureDir();
		}
	}

	async poll(_checkpoint: string | null): Promise<PollResult> {
		let events: OrgLoopEvent[];
		if (this.buffer) {
			events = this.buffer.drainSync();
		} else {
			events = [...this.pendingEvents];
			this.pendingEvents = [];
		}
		const checkpoint =
			events.length > 0 ? events[events.length - 1].timestamp : new Date().toISOString();
		return { events, checkpoint };
	}

	webhook(): WebhookHandler {
		return async (req: IncomingMessage, res: ServerResponse): Promise<OrgLoopEvent[]> => {
			if (req.method !== 'POST') {
				res.writeHead(405, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Method not allowed' }));
				return [];
			}

			const bodyStr = await readBody(req);

			// HMAC validation if secret is configured
			if (this.secret) {
				const signature =
					(req.headers['x-hub-signature-256'] as string) ?? (req.headers['x-signature'] as string);
				if (!signature) {
					res.writeHead(401, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Missing signature' }));
					return [];
				}

				const expected = `sha256=${createHmac('sha256', this.secret).update(bodyStr).digest('hex')}`;
				const sigBuffer = Buffer.from(signature);
				const expectedBuffer = Buffer.from(expected);
				if (
					sigBuffer.length !== expectedBuffer.length ||
					!timingSafeEqual(sigBuffer, expectedBuffer)
				) {
					res.writeHead(401, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Invalid signature' }));
					return [];
				}
			}

			try {
				const payload = JSON.parse(bodyStr) as Record<string, unknown>;
				const eventType = getNestedValue(payload, this.eventTypeField);

				const event = buildEvent({
					source: this.sourceId,
					type: 'resource.changed',
					provenance: {
						platform: 'webhook',
						platform_event: typeof eventType === 'string' ? eventType : 'unknown',
					},
					payload,
				});

				this.persistEvent(event);

				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ ok: true, event_id: event.id }));
				return [event];
			} catch {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
				return [];
			}
		};
	}

	async shutdown(): Promise<void> {
		this.pendingEvents = [];
	}

	private persistEvent(event: OrgLoopEvent): void {
		if (this.buffer) {
			this.buffer.append(event);
			this.buffer.enforceSize();
		} else {
			this.pendingEvents.push(event);
		}
	}
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', (chunk: Buffer) => chunks.push(chunk));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
		req.on('error', reject);
	});
}

/** Get a nested value from an object using dot-notation path */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split('.');
	let current: unknown = obj;
	for (const part of parts) {
		if (current == null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}
