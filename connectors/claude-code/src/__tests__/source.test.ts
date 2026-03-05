import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { assertLifecycleConformance } from '@orgloop/sdk';
import { describe, expect, it } from 'vitest';
import { ClaudeCodeSource } from '../source.js';

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

const samplePayload = {
	session_id: 'sess-123',
	working_directory: '/tmp/test',
	duration_seconds: 120,
	exit_status: 0,
	summary: 'Task completed',
};

describe('ClaudeCodeSource backward compatibility', () => {
	it('ClaudeCodeSource is re-exported from CodingAgentSource', async () => {
		const source = new ClaudeCodeSource();
		expect(source).toBeDefined();
		expect(source.id).toBe('coding-agent');
	});

	it('initializes and produces events with claude-code as source id', async () => {
		const source = new ClaudeCodeSource();
		await source.init({
			id: 'claude-code',
			connector: '@orgloop/connector-claude-code',
			config: {},
		});

		const handler = source.webhook();
		const req = createMockRequest(JSON.stringify(samplePayload));
		const res = createMockResponse();
		const events = await handler(req, res);

		expect(res.statusCode).toBe(200);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('actor.stopped');
		expect(events[0].source).toBe('claude-code');
		// Platform defaults to source id
		expect(events[0].provenance.platform).toBe('claude-code');
		expect(events[0].payload.session_id).toBe('sess-123');
	});

	it('lifecycle contract still holds via backward-compat alias', async () => {
		const source = new ClaudeCodeSource();
		await source.init({
			id: 'claude-code',
			connector: '@orgloop/connector-claude-code',
			config: {},
		});

		const handler = source.webhook();
		const req = createMockRequest(
			JSON.stringify({ session_id: 'sess-ok', exit_status: 0, duration_seconds: 60 }),
		);
		const res = createMockResponse();
		const [event] = await handler(req, res);

		assertLifecycleConformance(event);
		expect(event.type).toBe('actor.stopped');

		const lc = event.payload.lifecycle as Record<string, unknown>;
		expect(lc.phase).toBe('completed');
		expect(lc.terminal).toBe(true);
		expect(lc.outcome).toBe('success');
		expect(lc.dedupe_key).toBe('claude-code:sess-ok:completed');

		const sess = event.payload.session as Record<string, unknown>;
		expect(sess.adapter).toBe('claude-code');
		expect(sess.harness).toBe('claude-code');
	});

	it('start hook lifecycle works through alias', async () => {
		const source = new ClaudeCodeSource();
		await source.init({
			id: 'claude-code',
			connector: '@orgloop/connector-claude-code',
			config: {},
		});

		const handler = source.webhook();
		const req = createMockRequest(
			JSON.stringify({ session_id: 'sess-new', cwd: '/home/user/project', hook_type: 'start' }),
		);
		const res = createMockResponse();
		const [event] = await handler(req, res);

		assertLifecycleConformance(event);
		expect(event.type).toBe('resource.changed');
		expect(event.provenance.platform_event).toBe('session.started');
	});
});
