import { afterEach, describe, expect, it, vi } from 'vitest';
import { closeHttpAgent, createFetchWithKeepAlive, createHttpAgent } from '../http.js';

describe('createHttpAgent', () => {
	const agents: ReturnType<typeof createHttpAgent>[] = [];

	afterEach(async () => {
		for (const agent of agents) {
			await agent.close();
		}
		agents.length = 0;
	});

	it('creates an agent with default options', () => {
		const agent = createHttpAgent();
		agents.push(agent);
		expect(agent).toBeDefined();
		expect(typeof agent.close).toBe('function');
		expect(typeof agent.dispatch).toBe('function');
	});

	it('accepts custom options', () => {
		const agent = createHttpAgent({
			connections: 5,
			keepAliveTimeout: 10_000,
			keepAliveMaxTimeout: 20_000,
			pipelining: 2,
		});
		agents.push(agent);
		expect(agent).toBeDefined();
	});

	it('accepts partial options', () => {
		const agent = createHttpAgent({ connections: 3 });
		agents.push(agent);
		expect(agent).toBeDefined();
	});
});

describe('createFetchWithKeepAlive', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns a function with the same signature as fetch', () => {
		const agent = createHttpAgent();
		const keepAliveFetch = createFetchWithKeepAlive(agent);
		expect(typeof keepAliveFetch).toBe('function');
		// Clean up
		agent.close();
	});

	it('passes the dispatcher to fetch calls', async () => {
		const agent = createHttpAgent();
		const keepAliveFetch = createFetchWithKeepAlive(agent);

		// Spy on globalThis.fetch to verify dispatcher is passed
		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('ok', { status: 200 }));

		await keepAliveFetch('https://example.com');

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [url, init] = fetchSpy.mock.calls[0];
		expect(url).toBe('https://example.com');
		expect((init as Record<string, unknown>).dispatcher).toBe(agent);

		await agent.close();
	});

	it('merges caller init options with dispatcher', async () => {
		const agent = createHttpAgent();
		const keepAliveFetch = createFetchWithKeepAlive(agent);

		const fetchSpy = vi
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue(new Response('ok', { status: 200 }));

		await keepAliveFetch('https://example.com', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
		});

		expect(fetchSpy).toHaveBeenCalledOnce();
		const [, init] = fetchSpy.mock.calls[0];
		const opts = init as Record<string, unknown>;
		expect(opts.method).toBe('POST');
		expect(opts.dispatcher).toBe(agent);

		await agent.close();
	});
});

describe('closeHttpAgent', () => {
	it('closes the agent without error', async () => {
		const agent = createHttpAgent();
		await expect(closeHttpAgent(agent)).resolves.toBeUndefined();
	});

	it('throws on double-close (undici Agent is not idempotent)', async () => {
		const agent = createHttpAgent();
		await closeHttpAgent(agent);
		await expect(closeHttpAgent(agent)).rejects.toThrow();
	});
});
