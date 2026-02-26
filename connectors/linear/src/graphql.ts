/**
 * Batched GraphQL queries for the Linear connector.
 *
 * Replaces the N+1 pattern of the @linear/sdk (separate requests for each
 * issue relation) with a single query that fetches issues, their state,
 * assignee, creator, labels, and comments inline.
 */

// ─── Response Types ──────────────────────────────────────────────────────────

export interface BatchIssueNode {
	id: string;
	identifier: string;
	title: string;
	description: string | null;
	url: string;
	priority: number;
	createdAt: string;
	updatedAt: string;
	state: { name: string } | null;
	assignee: { name: string } | null;
	creator: { name: string } | null;
	labels: { nodes: Array<{ name: string }> };
	comments: { nodes: Array<BatchCommentNode> };
}

export interface BatchCommentNode {
	id: string;
	body: string;
	url: string;
	createdAt: string;
	user: { name: string } | null;
}

export interface BatchIssuesResponse {
	team: {
		issues: {
			nodes: BatchIssueNode[];
			pageInfo: {
				hasNextPage: boolean;
				endCursor: string | null;
			};
		};
	};
}

// ─── Query ───────────────────────────────────────────────────────────────────

/**
 * Build the batched GraphQL query for fetching issues with all relations.
 * Includes an optional project filter and comment-since filter.
 */
function buildBatchQuery(opts: { hasProject: boolean; hasCommentsSince: boolean }): string {
	const projectFilter = opts.hasProject ? ', project: { name: { eq: $projectName } }' : '';
	const commentsFilter = opts.hasCommentsSince
		? '(filter: { createdAt: { gte: $commentsSince } }, first: 50)'
		: '(first: 50)';

	return `
    query BatchPollIssues(
      $teamId: String!
      $since: DateTime!
      ${opts.hasProject ? '$projectName: String!' : ''}
      ${opts.hasCommentsSince ? '$commentsSince: DateTime!' : ''}
      $first: Int!
      $after: String
    ) {
      team(id: $teamId) {
        issues(
          filter: { updatedAt: { gte: $since }${projectFilter} }
          first: $first
          after: $after
        ) {
          nodes {
            id
            identifier
            title
            description
            url
            priority
            createdAt
            updatedAt
            state { name }
            assignee { name }
            creator { name }
            labels { nodes { name } }
            comments${commentsFilter} {
              nodes {
                id
                body
                url
                createdAt
                user { name }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  `;
}

// ─── Execution ──────────────────────────────────────────────────────────────

export interface BatchQueryOptions {
	apiKey: string;
	teamKey: string;
	since: string;
	projectName?: string;
	first?: number;
	cursor?: string;
	/** Custom fetch function (e.g. with HTTP keep-alive). Falls back to global fetch. */
	fetch?: typeof globalThis.fetch;
}

/**
 * Execute the batch GraphQL query against Linear's API.
 * Returns issues with all relations inline (state, assignee, creator, labels, comments).
 */
export async function executeBatchQuery(opts: BatchQueryOptions): Promise<BatchIssuesResponse> {
	const hasProject = !!opts.projectName;
	const query = buildBatchQuery({ hasProject, hasCommentsSince: true });

	const variables: Record<string, unknown> = {
		teamId: opts.teamKey,
		since: opts.since,
		first: opts.first ?? 50,
	};

	if (opts.cursor) {
		variables.after = opts.cursor;
	}

	if (hasProject) {
		variables.projectName = opts.projectName;
	}

	variables.commentsSince = opts.since;

	const fetchFn = opts.fetch ?? globalThis.fetch;
	const response = await fetchFn('https://api.linear.app/graphql', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: opts.apiKey,
		},
		body: JSON.stringify({ query, variables }),
	});

	if (response.status === 429) {
		throw Object.assign(new Error('Rate limited'), { status: 429 });
	}

	if (response.status === 401 || response.status === 403) {
		throw Object.assign(new Error(`Auth error: ${response.statusText}`), {
			status: response.status,
		});
	}

	if (!response.ok) {
		throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
	}

	const json = (await response.json()) as {
		data?: BatchIssuesResponse;
		errors?: Array<{ message: string; extensions?: { code?: string } }>;
	};

	// Check for GraphQL-level errors (e.g. RATE_LIMITED extension)
	if (json.errors?.length) {
		const rateLimited = json.errors.some((e) => e.extensions?.code === 'RATE_LIMITED');
		if (rateLimited) {
			throw Object.assign(new Error('Rate limited'), {
				extensions: { code: 'RATE_LIMITED' },
			});
		}
		throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
	}

	if (!json.data) {
		throw new Error('Linear API returned no data');
	}

	return json.data;
}
