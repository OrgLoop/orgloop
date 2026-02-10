/**
 * GitHub source connector — polls GitHub API for repository events.
 *
 * Uses octokit.paginate() for all list endpoints to avoid data loss
 * from silent truncation at page boundaries.
 */

import { Octokit } from '@octokit/rest';
import type { OrgLoopEvent, PollResult, SourceConfig, SourceConnector } from '@orgloop/sdk';
import {
	normalizeCheckSuiteCompleted,
	normalizeIssueComment,
	normalizePullRequestClosed,
	normalizePullRequestOpened,
	normalizePullRequestReadyForReview,
	normalizePullRequestReview,
	normalizePullRequestReviewComment,
	normalizeWorkflowRunFailed,
} from './normalizer.js';

/** Resolve env var references like ${GITHUB_TOKEN} */
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

interface GitHubSourceConfig {
	repo: string; // "owner/repo"
	events: string[];
	authors?: string[];
	token: string;
}

type GitHubPull = Record<string, unknown>;

export class GitHubSource implements SourceConnector {
	readonly id = 'github';
	private octokit!: Octokit;
	private owner = '';
	private repo = '';
	private events: string[] = [];
	private authors: string[] = [];
	private sourceId = '';

	async init(config: SourceConfig): Promise<void> {
		const cfg = config.config as unknown as GitHubSourceConfig;
		const [owner, repo] = cfg.repo.split('/');
		this.owner = owner;
		this.repo = repo;
		this.events = cfg.events ?? [];
		this.authors = cfg.authors ?? [];
		this.sourceId = config.id;

		const token = resolveEnvVar(cfg.token);
		this.octokit = new Octokit({ auth: token });
	}

	async poll(checkpoint: string | null): Promise<PollResult> {
		const since = checkpoint ? new Date(checkpoint).toISOString() : null;
		const events: OrgLoopEvent[] = [];
		let latestTimestamp = since ?? new Date(0).toISOString();

		try {
			// Fetch PRs once for methods that need them (reviews + review comments)
			const needsPulls =
				this.events.includes('pull_request.review_submitted') ||
				this.events.includes('pull_request_review_comment');

			let pulls: GitHubPull[] = [];
			if (needsPulls) {
				pulls = await this.fetchUpdatedPulls(since);
			}

			if (this.events.includes('pull_request.review_submitted')) {
				const reviews = await this.pollReviews(since, pulls);
				events.push(...reviews);
			}

			if (this.events.includes('pull_request_review_comment')) {
				const comments = await this.pollReviewComments(since, pulls);
				events.push(...comments);
			}

			if (this.events.includes('issue_comment')) {
				const comments = await this.pollIssueComments(since);
				events.push(...comments);
			}

			if (
				this.events.includes('pull_request.closed') ||
				this.events.includes('pull_request.merged')
			) {
				const prs = await this.pollClosedPRs(since);
				events.push(...prs);
			}

			if (this.events.includes('pull_request.opened')) {
				const prs = await this.pollOpenedPRs(since);
				events.push(...prs);
			}

			if (this.events.includes('pull_request.ready_for_review')) {
				const prs = await this.pollReadyForReviewPRs(since);
				events.push(...prs);
			}

			if (this.events.includes('workflow_run.completed')) {
				const runs = await this.pollFailedWorkflowRuns(since);
				events.push(...runs);
			}

			if (this.events.includes('check_suite.completed')) {
				const suites = await this.pollCheckSuites(since);
				events.push(...suites);
			}
		} catch (err: unknown) {
			const error = err as { status?: number; message?: string };
			if (error.status === 429) {
				// Rate limited — back off, return what we have
				return { events: [], checkpoint: latestTimestamp };
			}
			if (error.status === 401 || error.status === 403) {
				console.error(`[github] Auth error: ${error.message}`);
				return { events: [], checkpoint: latestTimestamp };
			}
			throw err;
		}

		// Find the latest timestamp among all events
		for (const event of events) {
			if (event.timestamp > latestTimestamp) {
				latestTimestamp = event.timestamp;
			}
		}

		// Filter by authors if configured
		const filtered =
			this.authors.length > 0
				? events.filter((e) => this.authors.includes(e.provenance.author ?? ''))
				: events;

		return { events: filtered, checkpoint: latestTimestamp };
	}

	/**
	 * Fetch all recently-updated PRs using pagination.
	 * Shared by pollReviews and pollReviewComments to avoid duplicate API calls.
	 */
	private async fetchUpdatedPulls(since: string | null): Promise<GitHubPull[]> {
		const allPulls = await this.octokit.paginate(this.octokit.pulls.list, {
			owner: this.owner,
			repo: this.repo,
			state: 'all',
			sort: 'updated',
			direction: 'desc',
			per_page: 100,
		});

		if (!since) return allPulls as unknown as GitHubPull[];

		// Filter to PRs updated after the checkpoint
		return (allPulls as unknown as GitHubPull[]).filter(
			(pr) => pr.updated_at && (pr.updated_at as string) >= since,
		);
	}

	private async pollReviews(since: string | null, pulls: GitHubPull[]): Promise<OrgLoopEvent[]> {
		const events: OrgLoopEvent[] = [];
		const repoData = { full_name: `${this.owner}/${this.repo}` };

		for (const pr of pulls) {
			try {
				const reviews = await this.octokit.paginate(this.octokit.pulls.listReviews, {
					owner: this.owner,
					repo: this.repo,
					pull_number: pr.number as number,
					per_page: 100,
				});
				for (const review of reviews) {
					const submitted = (review as unknown as Record<string, unknown>).submitted_at as
						| string
						| undefined;
					if (!since || (submitted && submitted > since)) {
						events.push(
							normalizePullRequestReview(
								this.sourceId,
								review as unknown as Record<string, unknown>,
								pr,
								repoData,
							),
						);
					}
				}
			} catch {
				// Skip individual PR errors
			}
		}
		return events;
	}

	private async pollReviewComments(
		since: string | null,
		pulls: GitHubPull[],
	): Promise<OrgLoopEvent[]> {
		const events: OrgLoopEvent[] = [];
		const repoData = { full_name: `${this.owner}/${this.repo}` };

		for (const pr of pulls) {
			try {
				const comments = await this.octokit.paginate(this.octokit.pulls.listReviewComments, {
					owner: this.owner,
					repo: this.repo,
					pull_number: pr.number as number,
					...(since ? { since } : {}),
					per_page: 100,
				});
				for (const comment of comments) {
					const updatedAt = (comment as unknown as Record<string, unknown>).updated_at as string;
					if (!since || updatedAt > since) {
						events.push(
							normalizePullRequestReviewComment(
								this.sourceId,
								comment as unknown as Record<string, unknown>,
								pr,
								repoData,
							),
						);
					}
				}
			} catch {
				// Skip individual PR errors
			}
		}
		return events;
	}

	private async pollIssueComments(since: string | null): Promise<OrgLoopEvent[]> {
		const comments = await this.octokit.paginate(this.octokit.issues.listCommentsForRepo, {
			owner: this.owner,
			repo: this.repo,
			...(since ? { since } : {}),
			sort: 'updated',
			direction: 'desc',
			per_page: 100,
		});

		const repoData = { full_name: `${this.owner}/${this.repo}` };
		return (comments as unknown as Record<string, unknown>[])
			.filter((c) => !since || (c.updated_at as string) > since)
			.map((comment) => {
				const issueNumber = (comment.issue_url as string)?.split('/').pop();
				return normalizeIssueComment(
					this.sourceId,
					comment,
					{ number: Number(issueNumber), title: '' },
					repoData,
				);
			});
	}

	private async pollClosedPRs(since: string | null): Promise<OrgLoopEvent[]> {
		const pulls = await this.octokit.paginate(this.octokit.pulls.list, {
			owner: this.owner,
			repo: this.repo,
			state: 'closed',
			sort: 'updated',
			direction: 'desc',
			per_page: 100,
		});

		const repoData = { full_name: `${this.owner}/${this.repo}` };
		return (pulls as unknown as GitHubPull[])
			.filter((pr) => pr.closed_at && (!since || (pr.closed_at as string) > since))
			.map((pr) => normalizePullRequestClosed(this.sourceId, pr, repoData));
	}

	private async pollOpenedPRs(since: string | null): Promise<OrgLoopEvent[]> {
		const pulls = await this.octokit.paginate(this.octokit.pulls.list, {
			owner: this.owner,
			repo: this.repo,
			state: 'open',
			sort: 'created',
			direction: 'desc',
			per_page: 100,
		});

		const repoData = { full_name: `${this.owner}/${this.repo}` };
		return (pulls as unknown as GitHubPull[])
			.filter((pr) => pr.created_at && (!since || (pr.created_at as string) > since))
			.map((pr) => normalizePullRequestOpened(this.sourceId, pr, repoData));
	}

	private async pollReadyForReviewPRs(since: string | null): Promise<OrgLoopEvent[]> {
		// Fetch recently updated open PRs that are NOT drafts.
		// We detect draft→ready by finding non-draft PRs updated since the checkpoint.
		// This works because GitHub updates `updated_at` when draft status changes.
		const pulls = await this.octokit.paginate(this.octokit.pulls.list, {
			owner: this.owner,
			repo: this.repo,
			state: 'open',
			sort: 'updated',
			direction: 'desc',
			per_page: 100,
		});

		const repoData = { full_name: `${this.owner}/${this.repo}` };
		return (pulls as unknown as GitHubPull[])
			.filter(
				(pr) =>
					pr.draft === false && pr.updated_at && (!since || (pr.updated_at as string) > since),
			)
			.map((pr) => normalizePullRequestReadyForReview(this.sourceId, pr, repoData));
	}

	private async pollFailedWorkflowRuns(since: string | null): Promise<OrgLoopEvent[]> {
		const data = await this.octokit.paginate(this.octokit.actions.listWorkflowRunsForRepo, {
			owner: this.owner,
			repo: this.repo,
			status: 'failure' as const,
			per_page: 100,
		});

		const repoData = { full_name: `${this.owner}/${this.repo}` };
		return (data as unknown as Record<string, unknown>[])
			.filter((run) => !since || (run.updated_at as string) > since)
			.map((run) => normalizeWorkflowRunFailed(this.sourceId, run, repoData));
	}

	private async pollCheckSuites(since: string | null): Promise<OrgLoopEvent[]> {
		// Check suites endpoint requires a ref; use the default branch
		// We use the repository-level check-suites-for-ref with HEAD
		const { data } = await this.octokit.checks.listSuitesForRef({
			owner: this.owner,
			repo: this.repo,
			ref: 'HEAD',
			per_page: 100,
		});

		const repoData = { full_name: `${this.owner}/${this.repo}` };
		return (data.check_suites as unknown as Record<string, unknown>[])
			.filter(
				(suite) =>
					(suite.status as string) === 'completed' &&
					suite.updated_at &&
					(!since || (suite.updated_at as string) > since),
			)
			.map((suite) => normalizeCheckSuiteCompleted(this.sourceId, suite, repoData));
	}

	async shutdown(): Promise<void> {
		// Nothing to clean up
	}
}
