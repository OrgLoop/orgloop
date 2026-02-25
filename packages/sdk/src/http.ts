/**
 * HTTP connection management for OrgLoop connectors.
 *
 * Provides keep-alive connection pooling via undici Agent.
 * Each connector should create its own agent during init() and
 * close it during shutdown() for proper lifecycle management.
 */

import { Agent, type Dispatcher } from 'undici';

/**
 * Opaque handle for an HTTP connection pool agent.
 * Connectors store this and pass it to closeHttpAgent() on shutdown.
 */
export type HttpAgent = Dispatcher;

/** Options for creating an HTTP agent with connection pooling */
export interface HttpAgentOptions {
	/** Max connections per origin (default: 10) */
	connections?: number;
	/** Keep-alive timeout in milliseconds (default: 30000) */
	keepAliveTimeout?: number;
	/** Max keep-alive timeout in milliseconds (default: 60000) */
	keepAliveMaxTimeout?: number;
	/** Number of pipelined requests per connection (default: 1, i.e. no pipelining) */
	pipelining?: number;
}

/** Default keep-alive agent options */
const DEFAULTS: Required<HttpAgentOptions> = {
	connections: 10,
	keepAliveTimeout: 30_000,
	keepAliveMaxTimeout: 60_000,
	pipelining: 1,
};

/**
 * Create an undici Agent with keep-alive connection pooling.
 *
 * Usage:
 * ```ts
 * const agent = createHttpAgent({ connections: 5 });
 * const response = await fetch(url, { dispatcher: agent });
 * // On shutdown:
 * await closeHttpAgent(agent);
 * ```
 */
export function createHttpAgent(options?: HttpAgentOptions): HttpAgent {
	const opts = { ...DEFAULTS, ...options };
	return new Agent({
		keepAliveTimeout: opts.keepAliveTimeout,
		keepAliveMaxTimeout: opts.keepAliveMaxTimeout,
		pipelining: opts.pipelining,
		connections: opts.connections,
	});
}

/**
 * Create a fetch function that uses the given agent as its dispatcher.
 *
 * Useful for passing to SDK clients that accept a custom fetch (e.g. Octokit).
 *
 * ```ts
 * const agent = createHttpAgent();
 * const fetchWithKeepAlive = createFetchWithKeepAlive(agent);
 * const octokit = new Octokit({ request: { fetch: fetchWithKeepAlive } });
 * ```
 */
export function createFetchWithKeepAlive(agent: HttpAgent): typeof globalThis.fetch {
	return ((input: string | URL | Request, init?: RequestInit) => {
		return globalThis.fetch(input, {
			...init,
			dispatcher: agent,
		} as unknown as RequestInit);
	}) as typeof globalThis.fetch;
}

/**
 * Gracefully close an HTTP agent, draining active connections.
 */
export async function closeHttpAgent(agent: HttpAgent): Promise<void> {
	await agent.close();
}
