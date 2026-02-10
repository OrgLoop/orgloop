/**
 * Linear credential validator — probes the Linear GraphQL API to verify an API key works.
 *
 * Stage 2 connector maturity: validates that LINEAR_API_KEY actually authenticates
 * and reports the associated user identity.
 */

import type { CredentialValidator } from '@orgloop/sdk';

export class LinearCredentialValidator implements CredentialValidator {
	async validate(
		value: string,
	): Promise<{ valid: boolean; identity?: string; scopes?: string[]; error?: string }> {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 5000);

			const response = await fetch('https://api.linear.app/graphql', {
				method: 'POST',
				headers: {
					Authorization: value,
					'Content-Type': 'application/json',
					'User-Agent': 'orgloop-doctor',
				},
				body: JSON.stringify({ query: '{ viewer { id name } }' }),
				signal: controller.signal,
			});

			clearTimeout(timeout);

			if (response.status === 401 || response.status === 403) {
				return { valid: false, error: `Invalid API key (${response.status})` };
			}

			if (!response.ok) {
				return {
					valid: false,
					error: `Linear API returned ${response.status} ${response.statusText}`,
				};
			}

			const data = (await response.json()) as {
				data?: { viewer?: { name?: string } };
				errors?: Array<{ message: string }>;
			};

			if (data.errors && data.errors.length > 0) {
				return { valid: false, error: data.errors[0].message };
			}

			const viewerName = data.data?.viewer?.name;
			return {
				valid: true,
				identity: viewerName ? `user: ${viewerName}` : undefined,
			};
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				return { valid: true, error: 'Validation timed out (Linear may be unreachable)' };
			}
			// Fail-open: network errors treated as "ok with a note"
			return {
				valid: true,
				error: `Could not reach Linear API: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}
}
