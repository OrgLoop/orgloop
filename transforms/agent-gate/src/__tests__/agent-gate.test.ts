import { createTestContext, createTestEvent } from '@orgloop/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentGateTransform } from '../agent-gate.js';

function mockExecFn(sessions: Array<{ status: string; adapter: string }>) {
	return async (_binary: string, _timeout: number) => sessions;
}

function mockExecFnError() {
	return async (_binary: string, _timeout: number): Promise<never> => {
		throw new Error('agent-ctl not found');
	};
}

describe('AgentGateTransform', () => {
	let gate: AgentGateTransform;
	const ctx = createTestContext();

	beforeEach(() => {
		gate = new AgentGateTransform();
	});

	afterEach(async () => {
		await gate.shutdown();
	});

	it('passes event when no sessions are running', async () => {
		await gate.init({});
		gate._execFn = mockExecFn([]);

		const event = createTestEvent({ source: 'agent-ctl', type: 'actor.stopped' });
		const result = await gate.execute(event, ctx);
		expect(result).toEqual(event);
	});

	it('drops event when sessions are running', async () => {
		await gate.init({});
		gate._execFn = mockExecFn([{ status: 'running', adapter: 'claude-code' }]);

		const event = createTestEvent({ source: 'agent-ctl', type: 'actor.stopped' });
		const result = await gate.execute(event, ctx);
		expect(result).toBeNull();
	});

	it('ignores sessions with non-active statuses', async () => {
		await gate.init({});
		gate._execFn = mockExecFn([
			{ status: 'stopped', adapter: 'claude-code' },
			{ status: 'errored', adapter: 'claude-code' },
		]);

		const event = createTestEvent({ source: 'agent-ctl', type: 'actor.stopped' });
		const result = await gate.execute(event, ctx);
		expect(result).toEqual(event);
	});

	it('filters sessions by adapter when adapter_filter is set', async () => {
		await gate.init({ adapter_filter: 'claude-code' });
		gate._execFn = mockExecFn([{ status: 'running', adapter: 'other-agent' }]);

		const event = createTestEvent({ source: 'agent-ctl', type: 'actor.stopped' });
		const result = await gate.execute(event, ctx);
		// "other-agent" doesn't match the filter, so gate is open
		expect(result).toEqual(event);
	});

	it('drops event when adapter_filter matches a running session', async () => {
		await gate.init({ adapter_filter: 'claude-code' });
		gate._execFn = mockExecFn([
			{ status: 'running', adapter: 'other-agent' },
			{ status: 'running', adapter: 'claude-code' },
		]);

		const event = createTestEvent({ source: 'agent-ctl', type: 'actor.stopped' });
		const result = await gate.execute(event, ctx);
		expect(result).toBeNull();
	});

	it('respects custom active_statuses', async () => {
		await gate.init({ active_statuses: ['running', 'paused'] });
		gate._execFn = mockExecFn([{ status: 'paused', adapter: 'claude-code' }]);

		const event = createTestEvent({ source: 'agent-ctl', type: 'actor.stopped' });
		const result = await gate.execute(event, ctx);
		// "paused" is in active_statuses, so gate is closed
		expect(result).toBeNull();
	});

	it('passes event through on CLI error (fail open)', async () => {
		await gate.init({});
		gate._execFn = mockExecFnError();

		const event = createTestEvent({ source: 'agent-ctl', type: 'actor.stopped' });
		const result = await gate.execute(event, ctx);
		expect(result).toEqual(event);
	});

	it('uses custom binary_path from config', async () => {
		let capturedBinary = '';
		await gate.init({ binary_path: '/usr/local/bin/agent-ctl' });
		gate._execFn = async (binary: string, _timeout: number) => {
			capturedBinary = binary;
			return [];
		};

		const event = createTestEvent({ source: 'agent-ctl', type: 'actor.stopped' });
		await gate.execute(event, ctx);
		expect(capturedBinary).toBe('/usr/local/bin/agent-ctl');
	});

	it('uses custom timeout from config', async () => {
		let capturedTimeout = 0;
		await gate.init({ timeout: 10000 });
		gate._execFn = async (_binary: string, timeout: number) => {
			capturedTimeout = timeout;
			return [];
		};

		const event = createTestEvent({ source: 'agent-ctl', type: 'actor.stopped' });
		await gate.execute(event, ctx);
		expect(capturedTimeout).toBe(10000);
	});

	it('rejects unknown config keys', async () => {
		await expect(gate.init({ unknown_key: 'value' })).rejects.toThrow(
			/unknown config keys: unknown_key/,
		);
	});

	it('works with empty session list from CLI', async () => {
		await gate.init({ adapter_filter: 'claude-code' });
		gate._execFn = mockExecFn([]);

		const event = createTestEvent({ source: 'agent-ctl', type: 'actor.stopped' });
		const result = await gate.execute(event, ctx);
		expect(result).toEqual(event);
	});

	it('handles multiple running sessions — still gates', async () => {
		await gate.init({});
		gate._execFn = mockExecFn([
			{ status: 'running', adapter: 'claude-code' },
			{ status: 'running', adapter: 'claude-code' },
			{ status: 'running', adapter: 'other-agent' },
		]);

		const event = createTestEvent({ source: 'agent-ctl', type: 'actor.stopped' });
		const result = await gate.execute(event, ctx);
		expect(result).toBeNull();
	});
});
