/**
 * WebhookServer — lightweight HTTP server for webhook-based sources.
 *
 * Listens on localhost only. Routes POST /webhook/:sourceId to registered handlers.
 * No auth, no CORS — just local event ingestion.
 */

import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import type { OrgLoopEvent, WebhookHandler } from '@orgloop/sdk';

export const DEFAULT_HTTP_PORT = 4800;

export class WebhookServer {
	private readonly handlers: Map<string, WebhookHandler>;
	private readonly onEvent: (event: OrgLoopEvent) => Promise<void>;
	private server: ReturnType<typeof createServer> | null = null;

	constructor(
		handlers: Map<string, WebhookHandler>,
		onEvent: (event: OrgLoopEvent) => Promise<void>,
	) {
		this.handlers = handlers;
		this.onEvent = onEvent;
	}

	async start(port: number): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server = createServer((req, res) => {
				void this.handleRequest(req, res);
			});

			this.server.on('error', reject);
			this.server.listen(port, '127.0.0.1', () => {
				resolve();
			});
		});
	}

	async stop(): Promise<void> {
		const srv = this.server;
		if (!srv) return;
		return new Promise((resolve) => {
			srv.close(() => {
				this.server = null;
				resolve();
			});
		});
	}

	private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
		const parts = url.pathname.split('/').filter(Boolean);

		// Route: POST /webhook/:sourceId
		if (parts.length !== 2 || parts[0] !== 'webhook') {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
			return;
		}

		const sourceId = parts[1];

		if (req.method !== 'POST') {
			res.writeHead(405, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Method not allowed' }));
			return;
		}

		const handler = this.handlers.get(sourceId);
		if (!handler) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: `Unknown source: ${sourceId}` }));
			return;
		}

		try {
			const events = await handler(req, res);
			for (const event of events) {
				await this.onEvent(event);
			}
		} catch (err) {
			// If the handler hasn't written a response yet, send 500
			if (!res.headersSent) {
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
			}
		}
	}
}
