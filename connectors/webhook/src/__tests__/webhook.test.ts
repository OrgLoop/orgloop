import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebhookSource } from '../source.js';
import { WebhookTarget } from '../target.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createMockRequest(
	body: string,
	method = 'POST',
	headers: Record<string, string> = {},
): IncomingMessage {
	const req = new EventEmitter() as unknown as IncomingMessage;
	req.method = method;
	req.headers = headers;
	setTimeout(() => {
		(req as EventEmitter).emit('data', Buffer.from(body));
		(req as EventEmitter).emit('end');
	}, 0);
	return req;
}

function createMockResponse(): ServerResponse & { statusCode: number; body: string } {
	const res = {
		statusCode: 200,
		body: '',
		writeHead(code: number, _headers?: Record<string, string>) {
			res.statusCode = code;
			return res;
		},
		end(data?: string) {
			res.body = data ?? '';
			return res;
		},
	} as unknown as ServerResponse & { statusCode: number; body: string };
	return res;
}

function signPayload(body: string, secret: string): string {
	return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

// ─── WebhookSource ────────────────────────────────────────────────────────────

describe('WebhookSource', () => {
	it('initializes and returns empty poll', async () => {
		const source = new WebhookSource();
		await source.init({
			id: 'webhook',
			connector: '@orgloop/connector-webhook',
			config: { path: '/webhook' },
		});
		const result = await source.poll(null);
		expect(result.events).toHaveLength(0);
	});

	it('receives webhook and normalizes to OrgLoop event', async () => {
		const source = new WebhookSource();
		await source.init({ id: 'webhook', connector: '@orgloop/connector-webhook', config: {} });

		const handler = source.webhook();
		const payload = { type: 'deployment', repo: 'my-app', status: 'success' };
		const req = createMockRequest(JSON.stringify(payload));
		const res = createMockResponse();
		const events = await handler(req, res);

		expect(res.statusCode).toBe(200);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('resource.changed');
		expect(events[0].source).toBe('webhook');
		expect(events[0].provenance.platform).toBe('webhook');
		expect(events[0].provenance.platform_event).toBe('deployment');
		expect(events[0].payload).toEqual(payload);

		// Drain via poll
		const result = await source.poll(null);
		expect(result.events).toHaveLength(1);
	});

	it('rejects non-POST', async () => {
		const source = new WebhookSource();
		await source.init({ id: 'webhook', connector: '@orgloop/connector-webhook', config: {} });

		const handler = source.webhook();
		const req = createMockRequest('', 'GET');
		const res = createMockResponse();
		const events = await handler(req, res);

		expect(res.statusCode).toBe(405);
		expect(events).toHaveLength(0);
	});

	it('rejects invalid JSON', async () => {
		const source = new WebhookSource();
		await source.init({ id: 'webhook', connector: '@orgloop/connector-webhook', config: {} });

		const handler = source.webhook();
		const req = createMockRequest('{invalid');
		const res = createMockResponse();
		const events = await handler(req, res);

		expect(res.statusCode).toBe(400);
		expect(events).toHaveLength(0);
	});

	it('clears pending events on shutdown', async () => {
		const source = new WebhookSource();
		await source.init({ id: 'webhook', connector: '@orgloop/connector-webhook', config: {} });

		const handler = source.webhook();
		const req = createMockRequest(JSON.stringify({ test: true }));
		const res = createMockResponse();
		await handler(req, res);

		await source.shutdown();
		const result = await source.poll(null);
		expect(result.events).toHaveLength(0);
	});

	// ─── HMAC Validation ────────────────────────────────────────────────────

	describe('HMAC validation', () => {
		const SECRET = 'test-webhook-secret';

		it('accepts valid HMAC-SHA256 signature via x-hub-signature-256', async () => {
			const source = new WebhookSource();
			await source.init({
				id: 'webhook',
				connector: '@orgloop/connector-webhook',
				config: { secret: SECRET },
			});

			const handler = source.webhook();
			const body = JSON.stringify({ type: 'push', ref: 'refs/heads/main' });
			const signature = signPayload(body, SECRET);
			const req = createMockRequest(body, 'POST', { 'x-hub-signature-256': signature });
			const res = createMockResponse();
			const events = await handler(req, res);

			expect(res.statusCode).toBe(200);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('push');
		});

		it('accepts valid HMAC-SHA256 signature via x-signature header', async () => {
			const source = new WebhookSource();
			await source.init({
				id: 'webhook',
				connector: '@orgloop/connector-webhook',
				config: { secret: SECRET },
			});

			const handler = source.webhook();
			const body = JSON.stringify({ type: 'deploy', env: 'prod' });
			const signature = signPayload(body, SECRET);
			const req = createMockRequest(body, 'POST', { 'x-signature': signature });
			const res = createMockResponse();
			const events = await handler(req, res);

			expect(res.statusCode).toBe(200);
			expect(events).toHaveLength(1);
		});

		it('rejects invalid signature with 401', async () => {
			const source = new WebhookSource();
			await source.init({
				id: 'webhook',
				connector: '@orgloop/connector-webhook',
				config: { secret: SECRET },
			});

			const handler = source.webhook();
			const body = JSON.stringify({ type: 'push' });
			const req = createMockRequest(body, 'POST', {
				'x-hub-signature-256': 'sha256=invalid_signature_value',
			});
			const res = createMockResponse();
			const events = await handler(req, res);

			expect(res.statusCode).toBe(401);
			expect(events).toHaveLength(0);
			expect(JSON.parse(res.body).error).toBe('Invalid signature');
		});

		it('rejects missing signature when secret is configured with 401', async () => {
			const source = new WebhookSource();
			await source.init({
				id: 'webhook',
				connector: '@orgloop/connector-webhook',
				config: { secret: SECRET },
			});

			const handler = source.webhook();
			const body = JSON.stringify({ type: 'push' });
			const req = createMockRequest(body, 'POST');
			const res = createMockResponse();
			const events = await handler(req, res);

			expect(res.statusCode).toBe(401);
			expect(events).toHaveLength(0);
			expect(JSON.parse(res.body).error).toBe('Missing signature');
		});

		it('accepts all requests when no secret is configured', async () => {
			const source = new WebhookSource();
			await source.init({
				id: 'webhook',
				connector: '@orgloop/connector-webhook',
				config: {},
			});

			const handler = source.webhook();
			const body = JSON.stringify({ type: 'anything' });
			const req = createMockRequest(body, 'POST');
			const res = createMockResponse();
			const events = await handler(req, res);

			expect(res.statusCode).toBe(200);
			expect(events).toHaveLength(1);
		});

		it('prefers x-hub-signature-256 over x-signature', async () => {
			const source = new WebhookSource();
			await source.init({
				id: 'webhook',
				connector: '@orgloop/connector-webhook',
				config: { secret: SECRET },
			});

			const handler = source.webhook();
			const body = JSON.stringify({ type: 'push' });
			const validSig = signPayload(body, SECRET);
			const req = createMockRequest(body, 'POST', {
				'x-hub-signature-256': validSig,
				'x-signature': 'sha256=wrong',
			});
			const res = createMockResponse();
			const events = await handler(req, res);

			// Should succeed because x-hub-signature-256 is valid (checked first)
			expect(res.statusCode).toBe(200);
			expect(events).toHaveLength(1);
		});
	});

	// ─── Buffer Persistence ─────────────────────────────────────────────────

	describe('buffer persistence', () => {
		const bufferDir = join(tmpdir(), `webhook-test-${Date.now()}`);

		afterEach(() => {
			if (existsSync(bufferDir)) {
				rmSync(bufferDir, { recursive: true });
			}
		});

		it('persists events to JSONL file', async () => {
			const source = new WebhookSource();
			await source.init({
				id: 'test-src',
				connector: '@orgloop/connector-webhook',
				config: { buffer_dir: bufferDir },
			});

			const handler = source.webhook();
			const body = JSON.stringify({ type: 'deploy' });
			const req = createMockRequest(body);
			const res = createMockResponse();
			await handler(req, res);

			expect(res.statusCode).toBe(200);

			// Verify the file exists with content
			const bufferPath = join(bufferDir, 'webhook-test-src.jsonl');
			expect(existsSync(bufferPath)).toBe(true);
			const content = readFileSync(bufferPath, 'utf-8').trim();
			const lines = content.split('\n');
			expect(lines).toHaveLength(1);
			const event = JSON.parse(lines[0]);
			expect(event.type).toBe('resource.changed');
		});

		it('drains buffer on poll and truncates file', async () => {
			const source = new WebhookSource();
			await source.init({
				id: 'test-src',
				connector: '@orgloop/connector-webhook',
				config: { buffer_dir: bufferDir },
			});

			const handler = source.webhook();
			// Send two webhooks
			for (let i = 0; i < 2; i++) {
				const body = JSON.stringify({ type: 'event', index: i });
				const req = createMockRequest(body);
				const res = createMockResponse();
				await handler(req, res);
			}

			// Poll should return both events
			const result = await source.poll(null);
			expect(result.events).toHaveLength(2);

			// Buffer file should be empty after poll
			const bufferPath = join(bufferDir, 'webhook-test-src.jsonl');
			const content = readFileSync(bufferPath, 'utf-8');
			expect(content).toBe('');

			// Next poll should return zero events
			const result2 = await source.poll(null);
			expect(result2.events).toHaveLength(0);
		});

		it('creates buffer directory if it does not exist', async () => {
			const nestedDir = join(bufferDir, 'nested', 'dir');
			const source = new WebhookSource();
			await source.init({
				id: 'test-src',
				connector: '@orgloop/connector-webhook',
				config: { buffer_dir: nestedDir },
			});

			expect(existsSync(nestedDir)).toBe(true);
		});

		it('survives simulated restart by reading existing buffer', async () => {
			// Create buffer directory and write events directly
			mkdirSync(bufferDir, { recursive: true });
			const bufferPath = join(bufferDir, 'webhook-persist.jsonl');
			const fakeEvent = {
				id: 'evt_test123',
				timestamp: new Date().toISOString(),
				source: 'webhook',
				type: 'resource.changed',
				provenance: { platform: 'webhook' },
				payload: { survived: true },
			};
			writeFileSync(bufferPath, `${JSON.stringify(fakeEvent)}\n`);

			// Init source — should pick up the pre-existing buffer
			const source = new WebhookSource();
			await source.init({
				id: 'persist',
				connector: '@orgloop/connector-webhook',
				config: { buffer_dir: bufferDir },
			});

			const result = await source.poll(null);
			expect(result.events).toHaveLength(1);
			expect(result.events[0].payload).toEqual({ survived: true });
		});
	});
});

// ─── WebhookTarget ────────────────────────────────────────────────────────────

describe('WebhookTarget', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('delivers event to configured URL', async () => {
		const target = new WebhookTarget();
		await target.init({
			id: 'webhook-target',
			connector: '@orgloop/connector-webhook',
			config: { url: 'https://example.com/hook' },
		});

		const { createTestEvent } = await import('@orgloop/sdk');
		const event = createTestEvent();
		const result = await target.deliver(event, {});

		expect(result.status).toBe('delivered');
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url] = fetchMock.mock.calls[0];
		expect(url).toBe('https://example.com/hook');
	});

	it('sends event and launch_prompt in body', async () => {
		const target = new WebhookTarget();
		await target.init({
			id: 'webhook-target',
			connector: '@orgloop/connector-webhook',
			config: { url: 'https://example.com/hook' },
		});

		const { createTestEvent } = await import('@orgloop/sdk');
		const event = createTestEvent();
		await target.deliver(event, { launch_prompt: 'Do the thing' });

		const body = JSON.parse(fetchMock.mock.calls[0][1].body);
		expect(body.event.id).toBe(event.id);
		expect(body.launch_prompt).toBe('Do the thing');
	});

	it('handles 429 rate limit', async () => {
		fetchMock.mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' });

		const target = new WebhookTarget();
		await target.init({
			id: 'webhook-target',
			connector: '@orgloop/connector-webhook',
			config: { url: 'https://example.com/hook' },
		});

		const { createTestEvent } = await import('@orgloop/sdk');
		const result = await target.deliver(createTestEvent(), {});
		expect(result.status).toBe('error');
		expect(result.error?.message).toContain('429');
	});

	it('handles 4xx rejection', async () => {
		fetchMock.mockResolvedValueOnce({ ok: false, status: 422, statusText: 'Unprocessable Entity' });

		const target = new WebhookTarget();
		await target.init({
			id: 'webhook-target',
			connector: '@orgloop/connector-webhook',
			config: { url: 'https://example.com/hook' },
		});

		const { createTestEvent } = await import('@orgloop/sdk');
		const result = await target.deliver(createTestEvent(), {});
		expect(result.status).toBe('rejected');
	});

	it('handles network error', async () => {
		fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

		const target = new WebhookTarget();
		await target.init({
			id: 'webhook-target',
			connector: '@orgloop/connector-webhook',
			config: { url: 'https://example.com/hook' },
		});

		const { createTestEvent } = await import('@orgloop/sdk');
		const result = await target.deliver(createTestEvent(), {});
		expect(result.status).toBe('error');
		expect(result.error?.message).toContain('ECONNREFUSED');
	});

	// ─── Auth Tests ─────────────────────────────────────────────────────────

	describe('authentication', () => {
		it('sends Bearer token in Authorization header', async () => {
			const target = new WebhookTarget();
			await target.init({
				id: 'webhook-target',
				connector: '@orgloop/connector-webhook',
				config: {
					url: 'https://example.com/hook',
					auth: { type: 'bearer', token: 'my-secret-token' },
				},
			});

			const { createTestEvent } = await import('@orgloop/sdk');
			await target.deliver(createTestEvent(), {});

			const opts = fetchMock.mock.calls[0][1];
			expect(opts.headers.Authorization).toBe('Bearer my-secret-token');
		});

		it('sends Basic auth with base64-encoded credentials', async () => {
			const target = new WebhookTarget();
			await target.init({
				id: 'webhook-target',
				connector: '@orgloop/connector-webhook',
				config: {
					url: 'https://example.com/hook',
					auth: { type: 'basic', username: 'alice', password: 'secret123' },
				},
			});

			const { createTestEvent } = await import('@orgloop/sdk');
			await target.deliver(createTestEvent(), {});

			const opts = fetchMock.mock.calls[0][1];
			const expected = `Basic ${Buffer.from('alice:secret123').toString('base64')}`;
			expect(opts.headers.Authorization).toBe(expected);
		});

		it('sends no Authorization header when no auth configured', async () => {
			const target = new WebhookTarget();
			await target.init({
				id: 'webhook-target',
				connector: '@orgloop/connector-webhook',
				config: { url: 'https://example.com/hook' },
			});

			const { createTestEvent } = await import('@orgloop/sdk');
			await target.deliver(createTestEvent(), {});

			const opts = fetchMock.mock.calls[0][1];
			expect(opts.headers.Authorization).toBeUndefined();
		});

		it('passes custom headers through', async () => {
			const target = new WebhookTarget();
			await target.init({
				id: 'webhook-target',
				connector: '@orgloop/connector-webhook',
				config: {
					url: 'https://example.com/hook',
					headers: { 'X-Custom-Header': 'custom-value', 'X-Request-Id': 'req-123' },
				},
			});

			const { createTestEvent } = await import('@orgloop/sdk');
			await target.deliver(createTestEvent(), {});

			const opts = fetchMock.mock.calls[0][1];
			expect(opts.headers['X-Custom-Header']).toBe('custom-value');
			expect(opts.headers['X-Request-Id']).toBe('req-123');
			expect(opts.headers['Content-Type']).toBe('application/json');
		});
	});

	// ─── Body Template Tests ────────────────────────────────────────────────

	describe('body template', () => {
		it('falls back to default body when no template configured', async () => {
			const target = new WebhookTarget();
			await target.init({
				id: 'webhook-target',
				connector: '@orgloop/connector-webhook',
				config: { url: 'https://example.com/hook' },
			});

			const { createTestEvent } = await import('@orgloop/sdk');
			const event = createTestEvent();
			await target.deliver(event, { launch_prompt: 'Do something' });

			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(body.event.id).toBe(event.id);
			expect(body.launch_prompt).toBe('Do something');
		});

		it('expands simple template with event fields', async () => {
			const target = new WebhookTarget();
			await target.init({
				id: 'webhook-target',
				connector: '@orgloop/connector-webhook',
				config: {
					url: 'https://hooks.slack.com/test',
					body_template: {
						text: '{{ event.provenance.platform_event }} by {{ event.provenance.author }}',
						channel: '#engineering',
					},
				},
			});

			const { createTestEvent } = await import('@orgloop/sdk');
			const event = createTestEvent({
				provenance: {
					platform: 'github',
					platform_event: 'pull_request.opened',
					author: 'alice',
				},
			});
			await target.deliver(event, {});

			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(body.text).toBe('pull_request.opened by alice');
			expect(body.channel).toBe('#engineering');
		});

		it('expands launch_prompt in template', async () => {
			const target = new WebhookTarget();
			await target.init({
				id: 'webhook-target',
				connector: '@orgloop/connector-webhook',
				config: {
					url: 'https://example.com/hook',
					body_template: {
						prompt: '{{ launch_prompt }}',
						source: '{{ event.source }}',
					},
				},
			});

			const { createTestEvent } = await import('@orgloop/sdk');
			const event = createTestEvent({ source: 'my-source' });
			await target.deliver(event, { launch_prompt: 'Review this PR' });

			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(body.prompt).toBe('Review this PR');
			expect(body.source).toBe('my-source');
		});

		it('handles missing template paths gracefully (empty string)', async () => {
			const target = new WebhookTarget();
			await target.init({
				id: 'webhook-target',
				connector: '@orgloop/connector-webhook',
				config: {
					url: 'https://example.com/hook',
					body_template: {
						text: '{{ event.nonexistent.field }}',
					},
				},
			});

			const { createTestEvent } = await import('@orgloop/sdk');
			await target.deliver(createTestEvent(), {});

			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(body.text).toBe('');
		});

		it('expands nested template objects', async () => {
			const target = new WebhookTarget();
			await target.init({
				id: 'webhook-target',
				connector: '@orgloop/connector-webhook',
				config: {
					url: 'https://example.com/hook',
					body_template: {
						message: {
							text: '{{ event.provenance.platform }}',
							metadata: {
								event_id: '{{ event.id }}',
							},
						},
					},
				},
			});

			const { createTestEvent } = await import('@orgloop/sdk');
			const event = createTestEvent({
				provenance: { platform: 'github' },
			});
			await target.deliver(event, {});

			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(body.message.text).toBe('github');
			expect(body.message.metadata.event_id).toBe(event.id);
		});

		it('preserves literal values (non-template strings, numbers, booleans)', async () => {
			const target = new WebhookTarget();
			await target.init({
				id: 'webhook-target',
				connector: '@orgloop/connector-webhook',
				config: {
					url: 'https://example.com/hook',
					body_template: {
						text: '{{ event.source }}',
						count: 42,
						active: true,
						static_text: 'hello world',
					},
				},
			});

			const { createTestEvent } = await import('@orgloop/sdk');
			await target.deliver(createTestEvent(), {});

			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(body.count).toBe(42);
			expect(body.active).toBe(true);
			expect(body.static_text).toBe('hello world');
		});
	});
});
