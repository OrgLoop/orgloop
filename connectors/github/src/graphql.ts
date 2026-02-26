/**
 * Batched GraphQL queries for the GitHub connector.
 *
 * Replaces the N+1 REST pattern (one pulls.listReviews call per PR) with a
 * single GraphQL query that fetches PRs with reviews inline. Also combines
 * the separate PR-state queries (closed, opened, ready-for-review) into the
 * same batch.
 *
 * The response is mapped to REST-compatible shapes so the existing normalizers
 * work unchanged.
 */

import type { Octokit } from '@octokit/rest';

// ─── GraphQL Response Types ─────────────────────────────────────────────────

interface GqlAuthor {
	login: string;
	__typename: string;
}

interface GqlReviewNode {
	databaseId: number;
	state: string;
	body: string | null;
	submittedAt: string | null;
	url: string;
	author: GqlAuthor | null;
}

interface GqlPullRequestNode {
	databaseId: number;
	number: number;
	title: string;
	updatedAt: string;
	closedAt: string | null;
	createdAt: string;
	merged: boolean;
	isDraft: boolean;
	state: 'OPEN' | 'CLOSED' | 'MERGED';
	url: string;
	headRefName: string;
	baseRefName: string;
	author: GqlAuthor | null;
	mergedBy: GqlAuthor | null;
	reviews: {
		nodes: GqlReviewNode[];
	};
}

interface GqlPageInfo {
	hasNextPage: boolean;
	endCursor: string | null;
}

interface GqlBatchResponse {
	repository: {
		pullRequests: {
			nodes: GqlPullRequestNode[];
			pageInfo: GqlPageInfo;
		};
	};
	rateLimit: {
		remaining: number;
		resetAt: string;
	};
}

// ─── REST-Compatible Types ──────────────────────────────────────────────────

export type RestPull = Record<string, unknown>;
export type RestReview = Record<string, unknown>;

/** Result of the batch GraphQL query, mapped to REST-compatible shapes */
export interface BatchPRResult {
	/** All recently-updated PRs (REST format), for sharing with other poll methods */
	pulls: RestPull[];
	/** PR review events, already filtered by `since` */
	reviews: Array<{ review: RestReview; pr: RestPull }>;
	/** PRs closed/merged after `since` */
	closedPRs: RestPull[];
	/** PRs opened after `since` */
	openedPRs: RestPull[];
	/** Non-draft PRs updated after `since` (ready for review) */
	readyForReviewPRs: RestPull[];
	/** Rate limit state from the GraphQL response */
	rateLimit: { remaining: number; resetAt: Date };
}

// ─── Query ──────────────────────────────────────────────────────────────────

const BATCH_PR_QUERY = `
  query BatchPollPRs($owner: String!, $name: String!, $first: Int!, $after: String) {
    repository(owner: $owner, name: $name) {
      pullRequests(
        first: $first
        after: $after
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        nodes {
          databaseId
          number
          title
          updatedAt
          closedAt
          createdAt
          merged
          isDraft
          state
          url
          headRefName
          baseRefName
          author { login __typename }
          mergedBy { login }
          reviews(last: 100) {
            nodes {
              databaseId
              state
              body
              submittedAt
              url
              author { login __typename }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
    rateLimit { remaining resetAt }
  }
`;

// ─── GraphQL → REST Mapping ─────────────────────────────────────────────────

/** Map a GraphQL Author to REST user shape */
function mapAuthor(author: GqlAuthor | null): Record<string, unknown> | undefined {
	if (!author) return undefined;
	return {
		login: author.login,
		type: author.__typename === 'Bot' ? 'Bot' : 'User',
	};
}

/** Map a GraphQL PR node to the REST PR shape expected by normalizers */
function mapPullToRest(pr: GqlPullRequestNode): RestPull {
	return {
		number: pr.number,
		title: pr.title,
		updated_at: pr.updatedAt,
		closed_at: pr.closedAt,
		created_at: pr.createdAt,
		merged: pr.merged,
		draft: pr.isDraft,
		state: pr.state.toLowerCase(),
		html_url: pr.url,
		user: mapAuthor(pr.author),
		merged_by: pr.mergedBy ? { login: pr.mergedBy.login } : undefined,
		head: { ref: pr.headRefName },
		base: { ref: pr.baseRefName },
	};
}

/** Map a GraphQL review node to the REST review shape expected by normalizers */
function mapReviewToRest(review: GqlReviewNode): RestReview {
	return {
		id: review.databaseId,
		state: review.state,
		body: review.body,
		submitted_at: review.submittedAt,
		html_url: review.url,
		user: mapAuthor(review.author),
	};
}

// ─── Execution ──────────────────────────────────────────────────────────────

export interface BatchQueryOptions {
	octokit: Octokit;
	owner: string;
	repo: string;
	since: string;
	pageSize?: number;
}

/**
 * Execute the batch GraphQL query. Paginates through all recently-updated PRs,
 * stopping when all PRs on a page are older than `since` (early termination).
 *
 * Returns PRs with reviews in REST-compatible format, plus categorized PR
 * events (closed, opened, ready-for-review).
 */
export async function executeBatchPRQuery(opts: BatchQueryOptions): Promise<BatchPRResult> {
	const { octokit, owner, repo, since } = opts;
	const pageSize = opts.pageSize ?? 50;

	const allPulls: RestPull[] = [];
	const allReviews: Array<{ review: RestReview; pr: RestPull }> = [];
	const closedPRs: RestPull[] = [];
	const openedPRs: RestPull[] = [];
	const readyForReviewPRs: RestPull[] = [];
	let lastRateLimit = { remaining: 5000, resetAt: new Date() };

	let hasNextPage = true;
	let cursor: string | undefined;

	while (hasNextPage) {
		const variables: Record<string, unknown> = {
			owner,
			name: repo,
			first: pageSize,
		};
		if (cursor) {
			variables.after = cursor;
		}

		const data = await octokit.graphql<GqlBatchResponse>(BATCH_PR_QUERY, variables);

		// Update rate limit from response
		lastRateLimit = {
			remaining: data.rateLimit.remaining,
			resetAt: new Date(data.rateLimit.resetAt),
		};

		const { nodes, pageInfo } = data.repository.pullRequests;
		let allOlderThanSince = true;

		for (const gqlPR of nodes) {
			if (gqlPR.updatedAt >= since) {
				allOlderThanSince = false;
				const restPR = mapPullToRest(gqlPR);
				allPulls.push(restPR);

				// Extract reviews newer than `since`
				for (const gqlReview of gqlPR.reviews.nodes) {
					if (gqlReview.submittedAt && gqlReview.submittedAt > since) {
						allReviews.push({
							review: mapReviewToRest(gqlReview),
							pr: restPR,
						});
					}
				}

				// Categorize PR events
				if (gqlPR.closedAt && gqlPR.closedAt > since) {
					closedPRs.push(restPR);
				}
				if (gqlPR.createdAt > since && gqlPR.state === 'OPEN') {
					openedPRs.push(restPR);
				}
				if (!gqlPR.isDraft && gqlPR.updatedAt > since && gqlPR.state === 'OPEN') {
					readyForReviewPRs.push(restPR);
				}
			}
		}

		// Early termination: if all PRs on this page are older than since, stop
		if ((allOlderThanSince && nodes.length > 0) || !pageInfo.hasNextPage) {
			hasNextPage = false;
		} else {
			cursor = pageInfo.endCursor ?? undefined;
		}
	}

	return {
		pulls: allPulls,
		reviews: allReviews,
		closedPRs,
		openedPRs,
		readyForReviewPRs,
		rateLimit: lastRateLimit,
	};
}
