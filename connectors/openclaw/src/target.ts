/**
 * OpenClaw actor (target) connector — delivers events to OpenClaw agent via HTTP webhook.
 */

import type {
	ActorConfig,
	ActorConnector,
	DeliveryResult,
	OrgLoopEvent,
	RouteDeliveryConfig,
} from '@orgloop/sdk';

/** Resolve env var references like ${OPENCLAW_AUTH_TOKEN} */
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

interface OpenClawConfig {
	base_url?: string;
	auth_token_env?: string;
	agent_id?: string;
	default_channel?: string;
	default_to?: string;
}

export class OpenClawTarget implements ActorConnector {
	readonly id = 'openclaw';
	private baseUrl = 'http://127.0.0.1:18789';
	private authToken?: string;
	private agentId?: string;
	private defaultChannel?: string;
	private defaultTo?: string;

	async init(config: ActorConfig): Promise<void> {
		const cfg = config.config as unknown as OpenClawConfig;
		this.baseUrl = cfg.base_url ?? 'http://127.0.0.1:18789';
		this.agentId = cfg.agent_id;
		this.defaultChannel = cfg.default_channel;
		this.defaultTo = cfg.default_to;

		if (cfg.auth_token_env) {
			this.authToken = resolveEnvVar(cfg.auth_token_env);
		}
	}

	async deliver(event: OrgLoopEvent, routeConfig: RouteDeliveryConfig): Promise<DeliveryResult> {
		const url = `${this.baseUrl}/hooks/agent`;

		const body = {
			message: this.buildMessage(event, routeConfig),
			sessionKey: (routeConfig.session_key as string) ?? `orgloop:${event.source}:${event.type}`,
			agentId: this.agentId,
			wakeMode: (routeConfig.wake_mode as string) ?? 'now',
			deliver: routeConfig.deliver ?? false,
			channel: this.defaultChannel,
			to: this.defaultTo,
		};

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};
		if (this.authToken) {
			headers.Authorization = `Bearer ${this.authToken}`;
		}

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
			});

			if (response.ok) {
				return { status: 'delivered' };
			}

			if (response.status === 429) {
				// Rate limited — treat as error for retry
				return {
					status: 'error',
					error: new Error('OpenClaw rate limited (429)'),
				};
			}

			if (response.status >= 400 && response.status < 500) {
				return {
					status: 'rejected',
					error: new Error(`OpenClaw rejected: ${response.status} ${response.statusText}`),
				};
			}

			return {
				status: 'error',
				error: new Error(`OpenClaw error: ${response.status} ${response.statusText}`),
			};
		} catch (err) {
			return {
				status: 'error',
				error: err instanceof Error ? err : new Error(String(err)),
			};
		}
	}

	async shutdown(): Promise<void> {
		// Nothing to clean up
	}

	/**
	 * Build the message string for OpenClaw from an OrgLoop event.
	 *
	 * Structure:
	 *   1. Header line: [source] type (platform_event) by author
	 *   2. Event context: provenance fields (url, issue_id, etc.)
	 *   3. Event payload: the actual data (comment body, ticket title, etc.)
	 *   4. Instructions: launch_prompt from route config (SOP)
	 */
	private buildMessage(event: OrgLoopEvent, routeConfig: RouteDeliveryConfig): string {
		const sections: string[] = [];

		// 1. Header line
		const header: string[] = [`[${event.source}] ${event.type}`];
		if (event.provenance.platform_event) {
			header.push(`(${event.provenance.platform_event})`);
		}
		if (event.provenance.author) {
			header.push(`by ${event.provenance.author}`);
		}
		sections.push(header.join(' '));

		// 2. Event context from provenance (skip standard fields already in header)
		const skipProvenance = new Set(['platform', 'platform_event', 'author', 'author_type']);
		const contextEntries = Object.entries(event.provenance).filter(
			([k, v]) => !skipProvenance.has(k) && v !== undefined,
		);
		if (contextEntries.length > 0) {
			const lines = contextEntries.map(([k, v]) => `  ${k}: ${v}`);
			sections.push(`Context:\n${lines.join('\n')}`);
		}

		// 3. Event payload — the actual data the LLM needs to act on
		const payloadEntries = Object.entries(event.payload);
		if (payloadEntries.length > 0) {
			const lines = payloadEntries.map(([k, v]) => {
				const val = typeof v === 'string' ? v : JSON.stringify(v);
				return `  ${k}: ${val}`;
			});
			sections.push(`Payload:\n${lines.join('\n')}`);
		}

		// 4. Instructions from route config
		if (routeConfig.launch_prompt) {
			sections.push(`Instructions:\n${routeConfig.launch_prompt}`);
		}

		return sections.join('\n\n');
	}
}
