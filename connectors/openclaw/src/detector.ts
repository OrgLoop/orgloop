/**
 * OpenClaw service detector — checks if OpenClaw is running and reachable.
 *
 * Stage 2 connector maturity: used by `orgloop doctor` to report
 * whether the OpenClaw service is available at the expected endpoint.
 */

import type { ServiceDetector } from '@orgloop/sdk';

const DEFAULT_BASE_URL = 'http://127.0.0.1:18789';

export class OpenClawServiceDetector implements ServiceDetector {
	private baseUrl: string;

	constructor(baseUrl?: string) {
		this.baseUrl = baseUrl ?? DEFAULT_BASE_URL;
	}

	async detect(): Promise<{
		running: boolean;
		version?: string;
		endpoint?: string;
		details?: Record<string, unknown>;
	}> {
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 3000);

			const response = await fetch(this.baseUrl, {
				method: 'GET',
				headers: {
					'User-Agent': 'orgloop-doctor',
				},
				signal: controller.signal,
			});

			clearTimeout(timeout);

			// Any response (even 404) means the service is running
			const details: Record<string, unknown> = {
				status: response.status,
			};

			// Try to extract version from response headers or body
			const serverHeader = response.headers.get('server');
			if (serverHeader) {
				details.server = serverHeader;
			}

			return {
				running: true,
				endpoint: this.baseUrl,
				details,
			};
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				return {
					running: false,
					endpoint: this.baseUrl,
					details: { error: 'Connection timed out' },
				};
			}
			return {
				running: false,
				endpoint: this.baseUrl,
				details: {
					error: err instanceof Error ? err.message : String(err),
				},
			};
		}
	}
}
