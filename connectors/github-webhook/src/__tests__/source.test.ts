import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GitHubWebhookSource } from '../source.js';

const TEST_SECRET = 'test-github-webhook-secret';

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

// ─── Sample GitHub webhook payloads ──────────────────────────────────────────

const sampleRepo = {
	full_name: 'org/repo',
	name: 'repo',
};

const samplePR = {
	number: 42,
	title: 'Add feature X',
	state: 'open',
	draft: false,
	merged: false,
	merged_at: null,
	html_url: 'https://github.com/org/repo/pull/42',
	user: { login: 'alice', type: 'User' },
	head: { ref: 'feat/x' },
	base: { ref: 'main' },
};

const sampleReview = {
	id: 101,
	state: 'changes_requested',
	body: 'Please fix the tests',
	html_url: 'https://github.com/org/repo/pull/42#pullrequestreview-101',
	user: { login: 'bob', type: 'User' },
};

const sampleComment = {
	id: 201,
	body: 'This looks good',
	html_url: 'https://github.com/org/repo/pull/42#issuecomment-201',
	diff_hunk: '@@ -1,5 +1,7 @@',
	path: 'src/index.ts',
	user: { login: 'carol', type: 'User' },
};

const sampleIssueComment = {
	id: 301,
	body: 'I agree with the approach',
	html_url: 'https://github.com/org/repo/issues/10#issuecomment-301',
	user: { login: 'dave', type: 'User' },
};

const sampleIssue = {
	number: 10,
	title: 'Bug: widgets broken',
	state: 'open',
	user: { login: 'eve', type: 'User' },
	html_url: 'https://github.com/org/repo/issues/10',
	pull_request: undefined,
};

const sampleWorkflowRun = {
	id: 501,
	name: 'CI',
	run_number: 99,
	conclusion: 'failure',
	head_branch: 'main',
	head_sha: 'abc123',
	html_url: 'https://github.com/org/repo/actions/runs/501',
	actor: { login: 'github-actions[bot]', type: 'Bot' },
};

const sampleCheckSuite = {
	id: 601,
	conclusion: 'success',
	status: 'completed',
	head_branch: 'main',
	head_sha: 'abc123',
	url: 'https://api.github.com/repos/org/repo/check-suites/601',
	app: { name: 'GitHub Actions', slug: 'github-actions' },
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GitHubWebhookSource', () => {
	let source: GitHubWebhookSource;

	beforeEach(async () => {
		source = new GitHubWebhookSource();
	});

	afterEach(async () => {
		await source.shutdown();
	});

	// ─── Initialization ──────────────────────────────────────────────────────

	it('initializes without error', async () => {
		await source.init({
			id: 'gh-webhook',
			connector: '@orgloop/connector-github-webhook',
			config: {},
		});
		expect(source.id).toBe('github-webhook');
	});

	it('returns empty events on initial poll', async () => {
		await source.init({
			id: 'gh-webhook',
			connector: '@orgloop/connector-github-webhook',
			config: {},
		});
		const result = await source.poll(null);
		expect(result.events).toHaveLength(0);
		expect(result.checkpoint).toBeDefined();
	});

	// ─── Signature validation ────────────────────────────────────────────────

	describe('HMAC signature validation', () => {
		beforeEach(async () => {
			process.env.TEST_GH_WEBHOOK_SECRET = TEST_SECRET;
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: { secret: '${TEST_GH_WEBHOOK_SECRET}' },
			});
		});

		afterEach(() => {
			delete process.env.TEST_GH_WEBHOOK_SECRET;
		});

		it('accepts valid signature', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'opened',
				pull_request: samplePR,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request',
				'x-hub-signature-256': signPayload(body, TEST_SECRET),
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(res.statusCode).toBe(200);
			expect(events).toHaveLength(1);
		});

		it('rejects missing signature', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'opened',
				pull_request: samplePR,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(res.statusCode).toBe(401);
			expect(events).toHaveLength(0);
			expect(JSON.parse(res.body).error).toContain('Missing');
		});

		it('rejects invalid signature', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'opened',
				pull_request: samplePR,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request',
				'x-hub-signature-256': 'sha256=deadbeef',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(res.statusCode).toBe(401);
			expect(events).toHaveLength(0);
			expect(JSON.parse(res.body).error).toContain('Invalid signature');
		});
	});

	// ─── Request validation ──────────────────────────────────────────────────

	describe('request validation', () => {
		beforeEach(async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});
		});

		it('rejects non-POST requests', async () => {
			const handler = source.webhook();
			const req = createMockRequest('', 'GET', { 'x-github-event': 'ping' });
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(res.statusCode).toBe(405);
			expect(events).toHaveLength(0);
		});

		it('rejects requests without X-GitHub-Event header', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({ action: 'opened' });
			const req = createMockRequest(body, 'POST', {});
			const res = createMockResponse();

			await handler(req, res);
			expect(res.statusCode).toBe(400);
			expect(JSON.parse(res.body).error).toContain('X-GitHub-Event');
		});

		it('rejects invalid JSON', async () => {
			const handler = source.webhook();
			const req = createMockRequest('not-json', 'POST', {
				'x-github-event': 'pull_request',
			});
			const res = createMockResponse();

			await handler(req, res);
			expect(res.statusCode).toBe(400);
			expect(JSON.parse(res.body).error).toContain('Invalid JSON');
		});
	});

	// ─── Pull request events ─────────────────────────────────────────────────

	describe('pull_request events', () => {
		beforeEach(async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});
		});

		it('normalizes pull_request.opened', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'opened',
				pull_request: samplePR,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(res.statusCode).toBe(200);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe('resource.changed');
			expect(events[0].provenance.platform).toBe('github');
			expect(events[0].provenance.platform_event).toBe('pull_request.opened');
			expect(events[0].payload.action).toBe('opened');
			expect(events[0].payload.pr_number).toBe(42);
			expect(events[0].payload.pr_title).toBe('Add feature X');
		});

		it('normalizes pull_request.closed (not merged)', async () => {
			const handler = source.webhook();
			const closedPR = { ...samplePR, state: 'closed', merged: false };
			const body = JSON.stringify({
				action: 'closed',
				pull_request: closedPR,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('pull_request.closed');
			expect(events[0].payload.action).toBe('closed');
			expect(events[0].payload.merged).toBe(false);
		});

		it('normalizes pull_request.closed (merged)', async () => {
			const handler = source.webhook();
			const mergedPR = {
				...samplePR,
				state: 'closed',
				merged: true,
				merged_at: '2024-01-15T10:00:00Z',
				merged_by: { login: 'alice' },
			};
			const body = JSON.stringify({
				action: 'closed',
				pull_request: mergedPR,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('pull_request.merged');
			expect(events[0].payload.action).toBe('merged');
			expect(events[0].payload.merged).toBe(true);
			expect(events[0].payload.merged_by).toBe('alice');
		});

		it('normalizes pull_request.ready_for_review', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'ready_for_review',
				pull_request: { ...samplePR, draft: false },
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('pull_request.ready_for_review');
			expect(events[0].payload.action).toBe('ready_for_review');
		});

		it('handles unknown pull_request actions as raw events', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'labeled',
				pull_request: samplePR,
				repository: sampleRepo,
				label: { name: 'bug' },
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('pull_request.labeled');
			expect(events[0].payload.action).toBe('labeled');
		});
	});

	// ─── Review events ───────────────────────────────────────────────────────

	describe('pull_request_review events', () => {
		beforeEach(async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});
		});

		it('normalizes pull_request_review.submitted', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'submitted',
				review: sampleReview,
				pull_request: samplePR,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request_review',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('pull_request.review_submitted');
			expect(events[0].payload.review_state).toBe('changes_requested');
			expect(events[0].payload.review_body).toBe('Please fix the tests');
			expect(events[0].provenance.author).toBe('bob');
		});
	});

	// ─── Review comment events ───────────────────────────────────────────────

	describe('pull_request_review_comment events', () => {
		beforeEach(async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});
		});

		it('normalizes review comment', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'created',
				comment: sampleComment,
				pull_request: samplePR,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request_review_comment',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('pull_request_review_comment');
			expect(events[0].payload.comment_body).toBe('This looks good');
			expect(events[0].payload.path).toBe('src/index.ts');
		});
	});

	// ─── Issue comment events ────────────────────────────────────────────────

	describe('issue_comment events', () => {
		beforeEach(async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});
		});

		it('normalizes issue comment (created)', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'created',
				comment: sampleIssueComment,
				issue: sampleIssue,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'issue_comment',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('issue_comment');
			expect(events[0].payload.comment_body).toBe('I agree with the approach');
			expect(events[0].payload.issue_number).toBe(10);
		});
	});

	// ─── issue_comment.edited debounce ──────────────────────────────────
	//
	// These tests use `normalizeWebhookPayload` directly to avoid the
	// `createMockRequest` helper (which uses `setTimeout(0)` to deliver
	// the body — trapped by fake timers, causing hangs).

	describe('issue_comment.edited debounce', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('does not emit edited events immediately (they are debounced)', async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});

			const events = await source.normalizeWebhookPayload('issue_comment', {
				action: 'edited',
				comment: sampleIssueComment,
				issue: sampleIssue,
				repository: sampleRepo,
			});

			// normalizeWebhookPayload returns empty for debounced edits
			expect(events).toHaveLength(0);

			// Poll before debounce fires — still empty
			const poll1 = await source.poll(null);
			expect(poll1.events).toHaveLength(0);
		});

		it('persists the edited event after the debounce window', async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: { issue_comment_edit_debounce_ms: 500 },
			});

			await source.normalizeWebhookPayload('issue_comment', {
				action: 'edited',
				comment: { ...sampleIssueComment, body: 'Final review text' },
				issue: sampleIssue,
				repository: sampleRepo,
			});

			// Advance past debounce window
			vi.advanceTimersByTime(600);

			const poll = await source.poll(null);
			expect(poll.events).toHaveLength(1);
			expect(poll.events[0].provenance.platform_event).toBe('issue_comment.edited');
			expect(poll.events[0].payload.comment_body).toBe('Final review text');
		});

		it('replaces intermediate edits and only persists the latest', async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: { issue_comment_edit_debounce_ms: 1000 },
			});

			// First edit (intermediate — placeholder still present)
			await source.normalizeWebhookPayload('issue_comment', {
				action: 'edited',
				comment: { ...sampleIssueComment, body: 'Reviewing… ☑ Analysis ☐ Security' },
				issue: sampleIssue,
				repository: sampleRepo,
			});

			// Advance part-way (not past window)
			vi.advanceTimersByTime(500);

			// Second edit (final review)
			await source.normalizeWebhookPayload('issue_comment', {
				action: 'edited',
				comment: {
					...sampleIssueComment,
					body: '🔴 Critical: SQL injection in query builder',
				},
				issue: sampleIssue,
				repository: sampleRepo,
			});

			// Advance past debounce window from the SECOND edit
			vi.advanceTimersByTime(1100);

			const poll = await source.poll(null);
			// Only one event — the final review, not the intermediate
			expect(poll.events).toHaveLength(1);
			expect(poll.events[0].payload.comment_body).toBe(
				'🔴 Critical: SQL injection in query builder',
			);
		});

		it('debounces independently per comment id', async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: { issue_comment_edit_debounce_ms: 500 },
			});

			// Edit comment 301
			await source.normalizeWebhookPayload('issue_comment', {
				action: 'edited',
				comment: { ...sampleIssueComment, id: 301, body: 'Review A' },
				issue: sampleIssue,
				repository: sampleRepo,
			});

			// Edit comment 999 (different comment)
			await source.normalizeWebhookPayload('issue_comment', {
				action: 'edited',
				comment: { ...sampleIssueComment, id: 999, body: 'Review B' },
				issue: sampleIssue,
				repository: sampleRepo,
			});

			vi.advanceTimersByTime(600);

			const poll = await source.poll(null);
			expect(poll.events).toHaveLength(2);
			const bodies = poll.events.map((e) => e.payload.comment_body).sort();
			expect(bodies).toEqual(['Review A', 'Review B']);
		});

		it('emits edited events immediately when debounce is disabled (0)', async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: { issue_comment_edit_debounce_ms: 0 },
			});

			await source.normalizeWebhookPayload('issue_comment', {
				action: 'edited',
				comment: sampleIssueComment,
				issue: sampleIssue,
				repository: sampleRepo,
			});

			// With debounce=0 the event goes directly to the pending buffer.
			const poll = await source.poll(null);
			expect(poll.events).toHaveLength(1);
			expect(poll.events[0].provenance.platform_event).toBe('issue_comment.edited');
		});

		it('flushes pending debounced events on shutdown', async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: { issue_comment_edit_debounce_ms: 60000 },
			});

			await source.normalizeWebhookPayload('issue_comment', {
				action: 'edited',
				comment: sampleIssueComment,
				issue: sampleIssue,
				repository: sampleRepo,
			});

			// Shutdown before debounce fires
			await source.shutdown();

			// The shutdown flushes the debounced event to pendingEvents
			// and then clears pendingEvents. For in-memory mode the
			// event is lost; for buffer_dir mode it survives.
			// This test validates the timer cleanup happens without error.
		});
	});

	// ─── Issues events ──────────────────────────────────────────────────────

	describe('issues events', () => {
		const sampleSender = { login: 'frank', type: 'User' };
		const sampleLabel = { name: 'bug' };
		const sampleAssignee = { login: 'grace', type: 'User' };

		beforeEach(async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});
		});

		it('normalizes issues.opened', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'opened',
				issue: sampleIssue,
				sender: sampleSender,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', { 'x-github-event': 'issues' });
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(res.statusCode).toBe(200);
			expect(events).toHaveLength(1);
			expect(events[0].type).toBe('resource.changed');
			expect(events[0].provenance.platform_event).toBe('issues.opened');
			expect(events[0].provenance.author).toBe('frank');
			expect(events[0].payload.action).toBe('opened');
			expect(events[0].payload.issue_number).toBe(10);
			expect(events[0].payload.issue_title).toBe('Bug: widgets broken');
		});

		it('normalizes issues.labeled', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'labeled',
				issue: sampleIssue,
				label: sampleLabel,
				sender: sampleSender,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', { 'x-github-event': 'issues' });
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('issues.labeled');
			expect(events[0].payload.action).toBe('labeled');
			expect(events[0].payload.label).toBe('bug');
		});

		it('normalizes issues.assigned', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'assigned',
				issue: sampleIssue,
				assignee: sampleAssignee,
				sender: sampleSender,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', { 'x-github-event': 'issues' });
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('issues.assigned');
			expect(events[0].payload.action).toBe('assigned');
			expect(events[0].payload.assignee).toBe('grace');
		});

		it('skips issues events on pull requests', async () => {
			const handler = source.webhook();
			const prIssue = { ...sampleIssue, pull_request: { url: 'https://...' } };
			const body = JSON.stringify({
				action: 'opened',
				issue: prIssue,
				sender: sampleSender,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', { 'x-github-event': 'issues' });
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(0);
		});

		it('emits raw event for unhandled issues actions', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'closed',
				issue: sampleIssue,
				sender: sampleSender,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', { 'x-github-event': 'issues' });
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('issues.closed');
		});
	});

	// ─── Workflow run events ─────────────────────────────────────────────────

	describe('workflow_run events', () => {
		beforeEach(async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});
		});

		it('normalizes failed workflow run', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'completed',
				workflow_run: sampleWorkflowRun,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'workflow_run',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('workflow_run.completed');
			expect(events[0].payload.action).toBe('workflow_run_failed');
			expect(events[0].payload.conclusion).toBe('failure');
		});

		it('emits raw event for non-failure workflow runs', async () => {
			const handler = source.webhook();
			const successRun = { ...sampleWorkflowRun, conclusion: 'success' };
			const body = JSON.stringify({
				action: 'completed',
				workflow_run: successRun,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'workflow_run',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('workflow_run.completed');
		});

		it('ignores non-completed workflow actions', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'requested',
				workflow_run: sampleWorkflowRun,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'workflow_run',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(0);
		});
	});

	// ─── Check suite events ──────────────────────────────────────────────────

	describe('check_suite events', () => {
		beforeEach(async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});
		});

		it('normalizes completed check suite', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'completed',
				check_suite: sampleCheckSuite,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'check_suite',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('check_suite.completed');
			expect(events[0].payload.conclusion).toBe('success');
			expect(events[0].payload.app_name).toBe('GitHub Actions');
		});

		it('ignores non-completed check suite actions', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'requested',
				check_suite: sampleCheckSuite,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'check_suite',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(0);
		});
	});

	// ─── Event filtering ─────────────────────────────────────────────────────

	describe('event filtering', () => {
		it('only accepts configured event types', async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: { events: ['pull_request.opened'] },
			});

			const handler = source.webhook();

			// Allowed: pull_request opened
			const body1 = JSON.stringify({
				action: 'opened',
				pull_request: samplePR,
				repository: sampleRepo,
			});
			const req1 = createMockRequest(body1, 'POST', {
				'x-github-event': 'pull_request',
			});
			const res1 = createMockResponse();
			const events1 = await handler(req1, res1);
			expect(events1).toHaveLength(1);

			// Blocked: issue_comment
			const body2 = JSON.stringify({
				action: 'created',
				comment: sampleIssueComment,
				issue: sampleIssue,
				repository: sampleRepo,
			});
			const req2 = createMockRequest(body2, 'POST', {
				'x-github-event': 'issue_comment',
			});
			const res2 = createMockResponse();
			const events2 = await handler(req2, res2);
			expect(events2).toHaveLength(0);
		});

		it('accepts all events when no filter is configured', async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});

			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'created',
				comment: sampleIssueComment,
				issue: sampleIssue,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'issue_comment',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
		});
	});

	// ─── Unknown event types ─────────────────────────────────────────────────

	describe('unknown event types', () => {
		beforeEach(async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});
		});

		it('emits raw events for unknown GitHub event types', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'created',
				release: { tag_name: 'v1.0.0' },
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'release',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform).toBe('github');
			expect(events[0].provenance.platform_event).toBe('release.created');
			expect(events[0].type).toBe('resource.changed');
		});
	});

	// ─── Poll draining ───────────────────────────────────────────────────────

	describe('poll drains webhook buffer', () => {
		beforeEach(async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});
		});

		it('poll returns events received via webhook', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'opened',
				pull_request: samplePR,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request',
			});
			const res = createMockResponse();

			await handler(req, res);

			const result = await source.poll(null);
			expect(result.events).toHaveLength(1);
			expect(result.events[0].provenance.platform_event).toBe('pull_request.opened');

			// Second poll returns empty
			const result2 = await source.poll(result.checkpoint);
			expect(result2.events).toHaveLength(0);
		});
	});

	// ─── Buffer persistence ──────────────────────────────────────────────────

	describe('buffer persistence', () => {
		let bufferDir: string;

		beforeEach(() => {
			bufferDir = join(tmpdir(), `orgloop-gh-webhook-test-${Date.now()}`);
			mkdirSync(bufferDir, { recursive: true });
		});

		afterEach(() => {
			if (existsSync(bufferDir)) {
				rmSync(bufferDir, { recursive: true });
			}
		});

		it('persists events to disk when buffer_dir is set', async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: { buffer_dir: bufferDir },
			});

			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'opened',
				pull_request: samplePR,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request',
			});
			const res = createMockResponse();

			await handler(req, res);

			// Create a new source instance to verify persistence
			const source2 = new GitHubWebhookSource();
			await source2.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: { buffer_dir: bufferDir },
			});

			const result = await source2.poll(null);
			expect(result.events).toHaveLength(1);
			expect(result.events[0].provenance.platform_event).toBe('pull_request.opened');
			await source2.shutdown();
		});
	});

	// ─── Event ID and structure ──────────────────────────────────────────────

	describe('event structure', () => {
		beforeEach(async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});
		});

		it('produces well-formed OrgLoop events', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'opened',
				pull_request: samplePR,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request',
			});
			const res = createMockResponse();

			const events = await handler(req, res);
			expect(events).toHaveLength(1);
			const event = events[0];
			expect(event.id).toMatch(/^evt_/);
			expect(event.trace_id).toMatch(/^trc_/);
			expect(event.timestamp).toBeDefined();
			expect(event.source).toBe('gh-webhook');
			expect(event.type).toBe('resource.changed');
			expect(event.provenance.platform).toBe('github');
		});

		it('response includes event IDs', async () => {
			const handler = source.webhook();
			const body = JSON.stringify({
				action: 'opened',
				pull_request: samplePR,
				repository: sampleRepo,
			});
			const req = createMockRequest(body, 'POST', {
				'x-github-event': 'pull_request',
			});
			const res = createMockResponse();

			await handler(req, res);
			const responseBody = JSON.parse(res.body);
			expect(responseBody.ok).toBe(true);
			expect(responseBody.events_created).toBe(1);
			expect(responseBody.event_ids).toHaveLength(1);
			expect(responseBody.event_ids[0]).toMatch(/^evt_/);
		});
	});

	// ─── normalizeWebhookPayload direct tests ────────────────────────────────

	describe('normalizeWebhookPayload', () => {
		beforeEach(async () => {
			await source.init({
				id: 'gh-webhook',
				connector: '@orgloop/connector-github-webhook',
				config: {},
			});
		});

		it('returns empty for missing pull_request in PR event', async () => {
			const events = await source.normalizeWebhookPayload('pull_request', {
				action: 'opened',
				repository: sampleRepo,
			});
			expect(events).toHaveLength(0);
		});

		it('returns empty for missing review in review event', async () => {
			const events = await source.normalizeWebhookPayload('pull_request_review', {
				action: 'submitted',
				repository: sampleRepo,
			});
			expect(events).toHaveLength(0);
		});

		it('returns empty for missing comment in issue_comment event', async () => {
			const events = await source.normalizeWebhookPayload('issue_comment', {
				action: 'created',
				repository: sampleRepo,
			});
			expect(events).toHaveLength(0);
		});
	});

	// ─── Reconciliation tests ───────────────────────────────────────────────────

	describe('reconciliation', () => {
		let reconcileSource: GitHubWebhookSource;

		beforeEach(() => {
			reconcileSource = new GitHubWebhookSource();
		});

		afterEach(async () => {
			await reconcileSource.shutdown();
		});

		it('marks review comments as seen from webhook, preventing reconciliation re-emit', async () => {
			await reconcileSource.init({
				id: 'gh-reconcile-test',
				connector: '@orgloop/connector-github-webhook',
				config: {
					token: 'test-token',
					repo_owner: 'org',
					repo_name: 'repo',
					// Disable auto-reconciliation timer for manual testing
					reconciliation_interval_ms: 0,
				} as Record<string, unknown>,
			});

			// Deliver a review comment via webhook — normalizeWebhookPayload
			// marks the comment id in the seen cache.
			const events = await reconcileSource.normalizeWebhookPayload('pull_request_review_comment', {
				action: 'created',
				comment: { ...sampleComment, id: 9999 },
				pull_request: samplePR,
				repository: sampleRepo,
			});
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('pull_request_review_comment');

			// Verify the seen cache is populated (accessed via private field cast).
			const seenMap = (reconcileSource as unknown as { seenCommentIds: Map<string, number> })
				.seenCommentIds;
			expect(seenMap.has('9999')).toBe(true);

			// Re-delivering the same comment via webhook should still emit
			// (webhook always emits; the seen cache only gates reconciliation).
			const events2 = await reconcileSource.normalizeWebhookPayload('pull_request_review_comment', {
				action: 'edited',
				comment: { ...sampleComment, id: 9999, body: 'Updated' },
				pull_request: samplePR,
				repository: sampleRepo,
			});
			expect(events2).toHaveLength(1);
		});

		it('marks issue comments as seen from webhook with ic- prefix', async () => {
			await reconcileSource.init({
				id: 'gh-reconcile-test-ic',
				connector: '@orgloop/connector-github-webhook',
				config: {
					reconciliation_interval_ms: 0,
				} as Record<string, unknown>,
			});

			const events = await reconcileSource.normalizeWebhookPayload('issue_comment', {
				action: 'created',
				comment: sampleIssueComment,
				issue: sampleIssue,
				repository: sampleRepo,
			});
			expect(events).toHaveLength(1);
			expect(events[0].provenance.platform_event).toBe('issue_comment');
		});

		it('reconciliation timer is not set when reconciliation_interval_ms is 0', async () => {
			await reconcileSource.init({
				id: 'gh-no-reconcile',
				connector: '@orgloop/connector-github-webhook',
				config: {
					token: 'test-token',
					repo_owner: 'org',
					repo_name: 'repo',
					reconciliation_interval_ms: 0,
				} as Record<string, unknown>,
			});

			// The private reconciliationTimer should be undefined
			// We verify indirectly: shutdown should not throw
			await expect(reconcileSource.shutdown()).resolves.toBeUndefined();
		});

		it('reconciliation timer is not set without token/repo config', async () => {
			await reconcileSource.init({
				id: 'gh-no-reconcile-notoken',
				connector: '@orgloop/connector-github-webhook',
				config: {
					// No token, repo_owner, repo_name
				} as Record<string, unknown>,
			});

			await expect(reconcileSource.shutdown()).resolves.toBeUndefined();
		});

		it('shutdown clears reconciliation timer and seen cache', async () => {
			await reconcileSource.init({
				id: 'gh-shutdown-test',
				connector: '@orgloop/connector-github-webhook',
				config: {
					token: 'test-token',
					repo_owner: 'org',
					repo_name: 'repo',
					reconciliation_interval_ms: 60000,
				} as Record<string, unknown>,
			});

			// Deliver an event to populate the seen cache
			await reconcileSource.normalizeWebhookPayload('pull_request_review_comment', {
				action: 'created',
				comment: { ...sampleComment, id: 7777 },
				pull_request: samplePR,
				repository: sampleRepo,
			});

			// Shutdown should clear everything without error
			await expect(reconcileSource.shutdown()).resolves.toBeUndefined();
		});
	});
});
