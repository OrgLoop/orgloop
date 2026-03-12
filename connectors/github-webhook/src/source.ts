/**
 * GitHub webhook source connector — receives GitHub webhook POST deliveries
 * and normalizes them into OrgLoop events using the same normalizers as the
 * polling connector.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import {
	normalizeCheckSuiteCompleted,
	normalizeIssueComment,
	normalizePullRequestClosed,
	normalizePullRequestOpened,
	normalizePullRequestReadyForReview,
	normalizePullRequestReview,
	normalizePullRequestReviewComment,
	normalizeWorkflowRunFailed,
} from '@orgloop/connector-github';
import type {
	OrgLoopEvent,
	PollResult,
	SourceConfig,
	SourceConnector,
	WebhookHandler,
} from '@orgloop/sdk';
import { buildEvent } from '@orgloop/sdk';

export interface GitHubWebhookConfig {
	/** HMAC-SHA256 secret for validating webhook signatures */
	secret?: string;
	/** URL path to mount the webhook handler on */
	path?: string;
	/** Event types to accept (e.g., ["pull_request", "issue_comment"]) */
	events?: string[];
	/** Directory for persisting buffered events across restarts */
	buffer_dir?: string;
}

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

export class GitHubWebhookSource implements SourceConnector {
	readonly id = 'github-webhook';
	private secret?: string;
	private sourceId = 'github-webhook';
	private allowedEvents?: Set<string>;
	private pendingEvents: OrgLoopEvent[] = [];
	private bufferPath?: string;

	async init(config: SourceConfig): Promise<void> {
		this.sourceId = config.id;
		const cfg = config.config as unknown as GitHubWebhookConfig;

		if (cfg.secret) {
			this.secret = resolveEnvVar(cfg.secret);
		}

		if (cfg.events && cfg.events.length > 0) {
			this.allowedEvents = new Set(cfg.events);
		}

		if (cfg.buffer_dir) {
			const dir = resolveEnvVar(cfg.buffer_dir);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			this.bufferPath = join(dir, `github-webhook-${this.sourceId}.jsonl`);
			this.loadBufferedEvents();
		}
	}

	async poll(_checkpoint: string | null): Promise<PollResult> {
		let events: OrgLoopEvent[];
		if (this.bufferPath) {
			events = this.loadBufferedEvents();
			writeFileSync(this.bufferPath, '');
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

			// HMAC-SHA256 signature validation
			if (this.secret) {
				const signature = req.headers['x-hub-signature-256'] as string | undefined;
				if (!signature) {
					res.writeHead(401, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ error: 'Missing X-Hub-Signature-256 header' }));
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

			// Parse the webhook event type from GitHub headers
			const githubEvent = req.headers['x-github-event'] as string | undefined;
			if (!githubEvent) {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Missing X-GitHub-Event header' }));
				return [];
			}

			let payload: Record<string, unknown>;
			try {
				payload = JSON.parse(bodyStr) as Record<string, unknown>;
			} catch {
				res.writeHead(400, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
				return [];
			}

			const events = this.normalizeWebhookPayload(githubEvent, payload);

			for (const event of events) {
				this.persistEvent(event);
			}

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(
				JSON.stringify({
					ok: true,
					events_created: events.length,
					event_ids: events.map((e) => e.id),
				}),
			);
			return events;
		};
	}

	async shutdown(): Promise<void> {
		this.pendingEvents = [];
	}

	/**
	 * Normalize a GitHub webhook payload into OrgLoop events.
	 * Uses the same normalizer functions as the polling connector.
	 */
	normalizeWebhookPayload(githubEvent: string, payload: Record<string, unknown>): OrgLoopEvent[] {
		const action = payload.action as string | undefined;
		const repo = (payload.repository as Record<string, unknown>) ?? {};

		switch (githubEvent) {
			case 'pull_request_review': {
				if (!this.isEventAllowed('pull_request.review_submitted')) return [];
				const review = payload.review as Record<string, unknown>;
				const pr = payload.pull_request as Record<string, unknown>;
				if (!review || !pr) return [];
				return [normalizePullRequestReview(this.sourceId, review, pr, repo)];
			}

			case 'pull_request_review_comment': {
				if (!this.isEventAllowed('pull_request_review_comment')) return [];
				const comment = payload.comment as Record<string, unknown>;
				const pr = payload.pull_request as Record<string, unknown>;
				if (!comment || !pr) return [];
				return [normalizePullRequestReviewComment(this.sourceId, comment, pr, repo)];
			}

			case 'issue_comment': {
				if (!this.isEventAllowed('issue_comment')) return [];
				const comment = payload.comment as Record<string, unknown>;
				const issue = payload.issue as Record<string, unknown>;
				if (!comment || !issue) return [];
				return [normalizeIssueComment(this.sourceId, comment, issue, repo)];
			}

			case 'pull_request': {
				const pr = payload.pull_request as Record<string, unknown>;
				if (!pr) return [];

				if (action === 'closed') {
					if (
						!this.isEventAllowed('pull_request.closed') &&
						!this.isEventAllowed('pull_request.merged')
					)
						return [];
					return [normalizePullRequestClosed(this.sourceId, pr, repo)];
				}
				if (action === 'opened') {
					if (!this.isEventAllowed('pull_request.opened')) return [];
					return [normalizePullRequestOpened(this.sourceId, pr, repo)];
				}
				if (action === 'ready_for_review') {
					if (!this.isEventAllowed('pull_request.ready_for_review')) return [];
					return [normalizePullRequestReadyForReview(this.sourceId, pr, repo)];
				}
				// Unhandled pull_request action — emit raw event
				return this.buildRawEvent(githubEvent, action, payload);
			}

			case 'workflow_run': {
				if (!this.isEventAllowed('workflow_run.completed')) return [];
				if (action !== 'completed') return [];
				const run = payload.workflow_run as Record<string, unknown>;
				if (!run) return [];
				const conclusion = run.conclusion as string;
				if (conclusion === 'failure') {
					return [normalizeWorkflowRunFailed(this.sourceId, run, repo)];
				}
				// Non-failure workflow runs — emit raw event
				return this.buildRawEvent(githubEvent, action, payload);
			}

			case 'check_suite': {
				if (!this.isEventAllowed('check_suite.completed')) return [];
				if (action !== 'completed') return [];
				const suite = payload.check_suite as Record<string, unknown>;
				if (!suite) return [];
				return [normalizeCheckSuiteCompleted(this.sourceId, suite, repo)];
			}

			default:
				// Unknown event type — emit raw event for extensibility
				return this.buildRawEvent(githubEvent, action, payload);
		}
	}

	private isEventAllowed(eventType: string): boolean {
		if (!this.allowedEvents) return true;
		return this.allowedEvents.has(eventType);
	}

	private buildRawEvent(
		githubEvent: string,
		action: string | undefined,
		payload: Record<string, unknown>,
	): OrgLoopEvent[] {
		const platformEvent = action ? `${githubEvent}.${action}` : githubEvent;
		return [
			buildEvent({
				source: this.sourceId,
				type: 'resource.changed',
				provenance: {
					platform: 'github',
					platform_event: platformEvent,
				},
				payload,
			}),
		];
	}

	private persistEvent(event: OrgLoopEvent): void {
		if (this.bufferPath) {
			appendFileSync(this.bufferPath, `${JSON.stringify(event)}\n`);
		} else {
			this.pendingEvents.push(event);
		}
	}

	private loadBufferedEvents(): OrgLoopEvent[] {
		if (!this.bufferPath || !existsSync(this.bufferPath)) {
			return [];
		}
		const content = readFileSync(this.bufferPath, 'utf-8').trim();
		if (!content) {
			return [];
		}
		return content.split('\n').map((line) => JSON.parse(line) as OrgLoopEvent);
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
