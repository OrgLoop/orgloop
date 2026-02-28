import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertLifecycleConformance } from '@orgloop/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodexSource } from '../source.js';

const TEST_SECRET = 'test-codex-webhook-secret';

function createMockRequest(
	body: string,
	method = 'POST',
	headers: Record<string, string> = {},
): IncomingMessage {
	const req = new EventEmitter() as unknown as IncomingMessage;
	req.method = method;
	req.headers = { ...headers };
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

const samplePayload = {
	session_id: 'codex-sess-123',
	cwd: '/tmp/test-project',
	duration_seconds: 90,
	exit_status: 0,
	summary: 'Implemented feature X',
	model: 'codex-mini',
};

describe('CodexSource', () => {
	it('initializes without error', async () => {
		const source = new CodexSource();
		await source.init({
			id: 'codex',
			connector: '@orgloop/connector-codex',
			config: {},
		});
		expect(source.id).toBe('codex');
	});

	it('returns empty events on initial poll', async () => {
		const source = new CodexSource();
		await source.init({
			id: 'codex',
			connector: '@orgloop/connector-codex',
			config: {},
		});
		const result = await source.poll(null);
		expect(result.events).toHaveLength(0);
		expect(result.checkpoint).toBeDefined();
	});

	it('receives webhook events and returns them on poll', async () => {
		const source = new CodexSource();
		await source.init({
			id: 'codex',
			connector: '@orgloop/connector-codex',
			config: {},
		});

		const handler = source.webhook();
		const req = createMockRequest(JSON.stringify(samplePayload));
		const res = createMockResponse();
		const events = await handler(req, res);

		expect(res.statusCode).toBe(200);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('actor.stopped');
		expect(events[0].source).toBe('codex');
		expect(events[0].provenance.platform).toBe('codex');
		expect(events[0].payload.session_id).toBe('codex-sess-123');

		const result = await source.poll(null);
		expect(result.events).toHaveLength(1);
		expect(result.events[0].id).toBe(events[0].id);

		const result2 = await source.poll(result.checkpoint);
		expect(result2.events).toHaveLength(0);
	});

	it('rejects non-POST requests', async () => {
		const source = new CodexSource();
		await source.init({
			id: 'codex',
			connector: '@orgloop/connector-codex',
			config: {},
		});

		const handler = source.webhook();
		const req = createMockRequest('', 'GET');
		const res = createMockResponse();
		const events = await handler(req, res);

		expect(res.statusCode).toBe(405);
		expect(events).toHaveLength(0);
	});

	it('rejects invalid JSON', async () => {
		const source = new CodexSource();
		await source.init({
			id: 'codex',
			connector: '@orgloop/connector-codex',
			config: {},
		});

		const handler = source.webhook();
		const req = createMockRequest('not-json');
		const res = createMockResponse();
		const events = await handler(req, res);

		expect(res.statusCode).toBe(400);
		expect(events).toHaveLength(0);
	});

	it('cleans up on shutdown', async () => {
		const source = new CodexSource();
		await source.init({
			id: 'codex',
			connector: '@orgloop/connector-codex',
			config: {},
		});

		const handler = source.webhook();
		const req = createMockRequest(
			JSON.stringify({ session_id: 'codex-sess-456', cwd: '/tmp', exit_status: 0 }),
		);
		const res = createMockResponse();
		await handler(req, res);

		await source.shutdown();

		const result = await source.poll(null);
		expect(result.events).toHaveLength(0);
	});
});

describe('CodexSource HMAC validation', () => {
	it('accepts webhook with valid HMAC signature', async () => {
		const source = new CodexSource();
		await source.init({
			id: 'codex',
			connector: '@orgloop/connector-codex',
			config: { secret: TEST_SECRET },
		});

		const handler = source.webhook();
		const body = JSON.stringify(samplePayload);
		const signature = signPayload(body, TEST_SECRET);

		const req = createMockRequest(body, 'POST', { 'x-hub-signature-256': signature });
		const res = createMockResponse();
		const events = await handler(req, res);

		expect(res.statusCode).toBe(200);
		expect(events).toHaveLength(1);
	});

	it('rejects webhook with invalid signature', async () => {
		const source = new CodexSource();
		await source.init({
			id: 'codex',
			connector: '@orgloop/connector-codex',
			config: { secret: TEST_SECRET },
		});

		const handler = source.webhook();
		const body = JSON.stringify(samplePayload);
		const badSignature = signPayload(body, 'wrong-secret');

		const req = createMockRequest(body, 'POST', { 'x-hub-signature-256': badSignature });
		const res = createMockResponse();
		const events = await handler(req, res);

		expect(res.statusCode).toBe(401);
		expect(events).toHaveLength(0);
	});

	it('rejects webhook with missing signature when secret configured', async () => {
		const source = new CodexSource();
		await source.init({
			id: 'codex',
			connector: '@orgloop/connector-codex',
			config: { secret: TEST_SECRET },
		});

		const handler = source.webhook();
		const req = createMockRequest(JSON.stringify(samplePayload), 'POST');
		const res = createMockResponse();
		const events = await handler(req, res);

		expect(res.statusCode).toBe(401);
		expect(events).toHaveLength(0);
	});

	it('accepts all requests when no secret is configured', async () => {
		const source = new CodexSource();
		await source.init({
			id: 'codex',
			connector: '@orgloop/connector-codex',
			config: {},
		});

		const handler = source.webhook();
		const req = createMockRequest(JSON.stringify(samplePayload), 'POST');
		const res = createMockResponse();
		const events = await handler(req, res);

		expect(res.statusCode).toBe(200);
		expect(events).toHaveLength(1);
	});
});

describe('CodexSource buffer persistence', () => {
	let bufferDir: string;

	beforeEach(() => {
		bufferDir = join(
			tmpdir(),
			`orgloop-codex-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		mkdirSync(bufferDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(bufferDir)) {
			rmSync(bufferDir, { recursive: true, force: true });
		}
	});

	it('persists events to JSONL file on disk', async () => {
		const source = new CodexSource();
		await source.init({
			id: 'test-src',
			connector: '@orgloop/connector-codex',
			config: { buffer_dir: bufferDir },
		});

		const handler = source.webhook();
		const req = createMockRequest(JSON.stringify(samplePayload));
		const res = createMockResponse();
		await handler(req, res);

		expect(res.statusCode).toBe(200);

		const bufferPath = join(bufferDir, 'codex-test-src.jsonl');
		expect(existsSync(bufferPath)).toBe(true);

		const content = readFileSync(bufferPath, 'utf-8').trim();
		const persisted = JSON.parse(content);
		expect(persisted.type).toBe('actor.stopped');
		expect(persisted.payload.session_id).toBe('codex-sess-123');
	});

	it('survives crash — new instance reads buffered events', async () => {
		const source1 = new CodexSource();
		await source1.init({
			id: 'test-src',
			connector: '@orgloop/connector-codex',
			config: { buffer_dir: bufferDir },
		});

		const handler = source1.webhook();
		const req = createMockRequest(JSON.stringify(samplePayload));
		const res = createMockResponse();
		await handler(req, res);

		// Simulate crash — new instance picks up buffered events
		const source2 = new CodexSource();
		await source2.init({
			id: 'test-src',
			connector: '@orgloop/connector-codex',
			config: { buffer_dir: bufferDir },
		});

		const result = await source2.poll(null);
		expect(result.events).toHaveLength(1);
		expect(result.events[0].payload.session_id).toBe('codex-sess-123');
	});

	it('creates buffer directory if it does not exist', async () => {
		const nestedDir = join(bufferDir, 'nested', 'deep');
		expect(existsSync(nestedDir)).toBe(false);

		const source = new CodexSource();
		await source.init({
			id: 'test-src',
			connector: '@orgloop/connector-codex',
			config: { buffer_dir: nestedDir },
		});

		expect(existsSync(nestedDir)).toBe(true);
	});

	it('handles empty buffer file gracefully', async () => {
		const bufferPath = join(bufferDir, 'codex-test-src.jsonl');
		writeFileSync(bufferPath, '');

		const source = new CodexSource();
		await source.init({
			id: 'test-src',
			connector: '@orgloop/connector-codex',
			config: { buffer_dir: bufferDir },
		});

		const result = await source.poll(null);
		expect(result.events).toHaveLength(0);
	});
});

// ─── Lifecycle Contract Conformance ───────────────────────────────────────────

describe('CodexSource lifecycle contract', () => {
	let source: CodexSource;

	beforeEach(async () => {
		source = new CodexSource();
		await source.init({
			id: 'codex',
			connector: '@orgloop/connector-codex',
			config: {},
		});
	});

	it('stop hook (exit 0) emits completed/success lifecycle event', async () => {
		const handler = source.webhook();
		const req = createMockRequest(
			JSON.stringify({ session_id: 'sess-ok', exit_status: 0, duration_seconds: 60 }),
		);
		const res = createMockResponse();
		const [event] = await handler(req, res);

		assertLifecycleConformance(event);
		expect(event.type).toBe('actor.stopped');
		expect(event.provenance.platform_event).toBe('session.completed');

		const lc = event.payload.lifecycle as Record<string, unknown>;
		expect(lc.phase).toBe('completed');
		expect(lc.terminal).toBe(true);
		expect(lc.outcome).toBe('success');
		expect(lc.reason).toBe('exit_code_0');
		expect(lc.dedupe_key).toBe('codex:sess-ok:completed');
	});

	it('stop hook (exit 1) emits failed/failure lifecycle event', async () => {
		const handler = source.webhook();
		const req = createMockRequest(
			JSON.stringify({ session_id: 'sess-fail', exit_status: 1, duration_seconds: 10 }),
		);
		const res = createMockResponse();
		const [event] = await handler(req, res);

		assertLifecycleConformance(event);
		expect(event.type).toBe('actor.stopped');
		expect(event.provenance.platform_event).toBe('session.failed');

		const lc = event.payload.lifecycle as Record<string, unknown>;
		expect(lc.phase).toBe('failed');
		expect(lc.terminal).toBe(true);
		expect(lc.outcome).toBe('failure');
		expect(lc.reason).toBe('exit_code_1');
	});

	it('stop hook (SIGINT/130) emits stopped/cancelled lifecycle event', async () => {
		const handler = source.webhook();
		const req = createMockRequest(
			JSON.stringify({ session_id: 'sess-int', exit_status: 130, duration_seconds: 5 }),
		);
		const res = createMockResponse();
		const [event] = await handler(req, res);

		assertLifecycleConformance(event);
		expect(event.type).toBe('actor.stopped');

		const lc = event.payload.lifecycle as Record<string, unknown>;
		expect(lc.phase).toBe('stopped');
		expect(lc.terminal).toBe(true);
		expect(lc.outcome).toBe('cancelled');
		expect(lc.reason).toBe('sigint');
	});

	it('stop hook (SIGTERM/143) emits stopped/cancelled lifecycle event', async () => {
		const handler = source.webhook();
		const req = createMockRequest(
			JSON.stringify({ session_id: 'sess-term', exit_status: 143, duration_seconds: 5 }),
		);
		const res = createMockResponse();
		const [event] = await handler(req, res);

		assertLifecycleConformance(event);
		const lc = event.payload.lifecycle as Record<string, unknown>;
		expect(lc.phase).toBe('stopped');
		expect(lc.outcome).toBe('cancelled');
		expect(lc.reason).toBe('sigterm');
	});

	it('stop hook (SIGKILL/137) emits stopped/cancelled lifecycle event', async () => {
		const handler = source.webhook();
		const req = createMockRequest(
			JSON.stringify({ session_id: 'sess-kill', exit_status: 137, duration_seconds: 5 }),
		);
		const res = createMockResponse();
		const [event] = await handler(req, res);

		assertLifecycleConformance(event);
		const lc = event.payload.lifecycle as Record<string, unknown>;
		expect(lc.phase).toBe('stopped');
		expect(lc.outcome).toBe('cancelled');
		expect(lc.reason).toBe('sigkill');
	});

	it('start hook emits started lifecycle event (resource.changed)', async () => {
		const handler = source.webhook();
		const req = createMockRequest(
			JSON.stringify({
				session_id: 'sess-new',
				cwd: '/home/user/project',
				hook_type: 'start',
			}),
		);
		const res = createMockResponse();
		const [event] = await handler(req, res);

		assertLifecycleConformance(event);
		expect(event.type).toBe('resource.changed');
		expect(event.provenance.platform_event).toBe('session.started');

		const lc = event.payload.lifecycle as Record<string, unknown>;
		expect(lc.phase).toBe('started');
		expect(lc.terminal).toBe(false);
		expect(lc.outcome).toBeUndefined();
		expect(lc.dedupe_key).toBe('codex:sess-new:started');

		const sess = event.payload.session as Record<string, unknown>;
		expect(sess.id).toBe('sess-new');
		expect(sess.adapter).toBe('codex');
		expect(sess.harness).toBe('codex');
		expect(sess.cwd).toBe('/home/user/project');
		expect(sess.started_at).toBeDefined();
		expect(sess.ended_at).toBeUndefined();
	});

	it('defaults hook_type to stop for backward compatibility', async () => {
		const handler = source.webhook();
		const req = createMockRequest(
			JSON.stringify({ session_id: 'sess-legacy', exit_status: 0, duration_seconds: 30 }),
		);
		const res = createMockResponse();
		const [event] = await handler(req, res);

		assertLifecycleConformance(event);
		expect(event.type).toBe('actor.stopped');
		const lc = event.payload.lifecycle as Record<string, unknown>;
		expect(lc.phase).toBe('completed');
		expect(lc.terminal).toBe(true);
	});

	it('preserves backward-compatible payload fields alongside lifecycle', async () => {
		const handler = source.webhook();
		const req = createMockRequest(JSON.stringify(samplePayload));
		const res = createMockResponse();
		const [event] = await handler(req, res);

		expect(event.payload.lifecycle).toBeDefined();
		expect(event.payload.session).toBeDefined();

		expect(event.payload.session_id).toBe('codex-sess-123');
		expect(event.payload.cwd).toBe('/tmp/test-project');
		expect(event.payload.duration_seconds).toBe(90);
		expect(event.payload.exit_status).toBe(0);
		expect(event.payload.summary).toBe('Implemented feature X');
		expect(event.payload.model).toBe('codex-mini');
	});

	it('session.harness is always codex', async () => {
		const handler = source.webhook();
		const req = createMockRequest(JSON.stringify(samplePayload));
		const res = createMockResponse();
		const [event] = await handler(req, res);

		const sess = event.payload.session as Record<string, unknown>;
		expect(sess.harness).toBe('codex');
	});

	it('dedupe_key is unique per session + phase', async () => {
		const handler = source.webhook();

		const req1 = createMockRequest(JSON.stringify({ session_id: 'sess-x', hook_type: 'start' }));
		const res1 = createMockResponse();
		const [startEvent] = await handler(req1, res1);

		const req2 = createMockRequest(
			JSON.stringify({ session_id: 'sess-x', exit_status: 0, duration_seconds: 10 }),
		);
		const res2 = createMockResponse();
		const [stopEvent] = await handler(req2, res2);

		const startKey = (startEvent.payload.lifecycle as Record<string, unknown>).dedupe_key;
		const stopKey = (stopEvent.payload.lifecycle as Record<string, unknown>).dedupe_key;

		expect(startKey).toBe('codex:sess-x:started');
		expect(stopKey).toBe('codex:sess-x:completed');
		expect(startKey).not.toBe(stopKey);
	});

	it('terminal events include session.ended_at and exit_status', async () => {
		const handler = source.webhook();
		const req = createMockRequest(
			JSON.stringify({ session_id: 'sess-t', exit_status: 42, duration_seconds: 5 }),
		);
		const res = createMockResponse();
		const [event] = await handler(req, res);

		const sess = event.payload.session as Record<string, unknown>;
		expect(sess.ended_at).toBeDefined();
		expect(sess.exit_status).toBe(42);
	});

	it('non-terminal events include session.started_at but not ended_at', async () => {
		const handler = source.webhook();
		const req = createMockRequest(JSON.stringify({ session_id: 'sess-s', hook_type: 'start' }));
		const res = createMockResponse();
		const [event] = await handler(req, res);

		const sess = event.payload.session as Record<string, unknown>;
		expect(sess.started_at).toBeDefined();
		expect(sess.ended_at).toBeUndefined();
		expect(sess.exit_status).toBeUndefined();
	});
});
