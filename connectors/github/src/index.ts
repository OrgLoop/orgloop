/**
 * @orgloop/connector-github — GitHub source connector registration.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { GitHubSource } from './source.js';
import { GitHubCredentialValidator } from './validator.js';

export {
	normalizeCheckSuiteCompleted,
	normalizeIssueComment,
	normalizePullRequestClosed,
	normalizePullRequestOpened,
	normalizePullRequestReadyForReview,
	normalizePullRequestReview,
	normalizePullRequestReviewComment,
	normalizeWorkflowRunFailed,
} from './normalizer.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'github',
		source: GitHubSource,
		setup: {
			env_vars: [
				{
					name: 'GITHUB_TOKEN',
					description: 'GitHub personal access token with repo scope',
					help_url: 'https://github.com/settings/tokens/new?scopes=repo',
				},
			],
		},
		credential_validators: {
			GITHUB_TOKEN: new GitHubCredentialValidator(),
		},
	};
}
