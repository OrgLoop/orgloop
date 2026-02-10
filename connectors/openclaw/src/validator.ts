/**
 * OpenClaw credential validator — probes the OpenClaw endpoint to verify a token works.
 *
 * Stage 2 connector maturity: validates that OPENCLAW_WEBHOOK_TOKEN can
 * authenticate against the OpenClaw webhook endpoint.
 */

import type { CredentialValidator } from '@orgloop/sdk';

const DEFAULT_BASE_URL = 'http://127.0.0.1:18789';

export class OpenClawCredentialValidator implements CredentialValidator {
	private baseUrl: string;

	constructor(baseUrl?: string) {
		this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
	}

	async validate(
		value: string,
	): Promise<{ valid: boolean; identity?: string; scopes?: string[]; error?: string }> {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 3000);

			const response = await fetch(`${this.baseUrl}/hooks/agent`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${value}`,
					'Content-Type': 'application/json',
					'User-Agent': 'orgloop-doctor',
				},
				body: JSON.stringify({ message: 'orgloop-doctor-probe', sessionKey: 'doctor-probe' }),
				signal: controller.signal,
			});

			clearTimeout(timeout);

			if (response.status === 401 || response.status === 403) {
				return { valid: false, error: `Invalid token (${response.status})` };
			}

			// Any other response means the token was accepted (or not required)
			return { valid: true };
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				return {
					valid: true,
					error: 'Validation timed out (OpenClaw may not be running)',
				};
			}
			// Fail-open: network errors (e.g., connection refused) mean OpenClaw isn't running,
			// but we can't say the token is invalid
			return {
				valid: true,
				error: `Could not reach OpenClaw: ${err instanceof Error ? err.message : String(err)}`,
			};
		}
	}
}
