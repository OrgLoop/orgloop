/**
 * Generic webhook target connector — POSTs events to a configured URL.
 */

import type {
	ActorConfig,
	ActorConnector,
	DeliveryResult,
	OrgLoopEvent,
	RouteDeliveryConfig,
} from '@orgloop/sdk';

/** Resolve env var references */
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

/** Get a nested value from an object using dot-notation path */
function getNestedValue(obj: unknown, path: string): unknown {
	const parts = path.split('.');
	let current: unknown = obj;
	for (const part of parts) {
		if (current == null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

/** Expand template strings: replaces {{ path }} with values from context */
function expandTemplate(template: unknown, context: Record<string, unknown>): unknown {
	if (typeof template === 'string') {
		// Full-string replacement for single {{ path }} (preserves non-string types)
		const fullMatch = template.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
		if (fullMatch) {
			const value = getNestedValue(context, fullMatch[1]);
			return value ?? '';
		}
		// Inline replacement for strings with embedded {{ path }}
		return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, path: string) => {
			const value = getNestedValue(context, path);
			return value == null ? '' : String(value);
		});
	}
	if (Array.isArray(template)) {
		return template.map((item) => expandTemplate(item, context));
	}
	if (template != null && typeof template === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
			result[key] = expandTemplate(value, context);
		}
		return result;
	}
	return template;
}

interface WebhookTargetConfig {
	url: string;
	method?: 'POST' | 'PUT';
	headers?: Record<string, string>;
	auth?: {
		type: 'basic' | 'bearer';
		token?: string;
		username?: string;
		password?: string;
	};
	body_template?: Record<string, unknown>;
}

export class WebhookTarget implements ActorConnector {
	readonly id = 'webhook';
	private url = '';
	private method: 'POST' | 'PUT' = 'POST';
	private customHeaders: Record<string, string> = {};
	private authHeader?: string;
	private bodyTemplate?: Record<string, unknown>;

	async init(config: ActorConfig): Promise<void> {
		const cfg = config.config as unknown as WebhookTargetConfig;
		this.url = cfg.url;
		this.method = cfg.method ?? 'POST';
		this.customHeaders = cfg.headers ?? {};
		this.bodyTemplate = cfg.body_template;

		if (cfg.auth) {
			if (cfg.auth.type === 'bearer' && cfg.auth.token) {
				this.authHeader = `Bearer ${resolveEnvVar(cfg.auth.token)}`;
			} else if (cfg.auth.type === 'basic' && cfg.auth.username && cfg.auth.password) {
				const credentials = Buffer.from(
					`${resolveEnvVar(cfg.auth.username)}:${resolveEnvVar(cfg.auth.password)}`,
				).toString('base64');
				this.authHeader = `Basic ${credentials}`;
			}
		}
	}

	async deliver(event: OrgLoopEvent, routeConfig: RouteDeliveryConfig): Promise<DeliveryResult> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...this.customHeaders,
		};

		if (this.authHeader) {
			headers.Authorization = this.authHeader;
		}

		let body: unknown;
		if (this.bodyTemplate) {
			const context: Record<string, unknown> = {
				event,
				launch_prompt: routeConfig.launch_prompt ?? '',
			};
			body = expandTemplate(this.bodyTemplate, context);
		} else {
			body = {
				event,
				launch_prompt: routeConfig.launch_prompt,
			};
		}

		try {
			const response = await fetch(this.url, {
				method: this.method,
				headers,
				body: JSON.stringify(body),
			});

			if (response.ok) {
				return { status: 'delivered' };
			}

			if (response.status === 429) {
				return {
					status: 'error',
					error: new Error('Webhook rate limited (429)'),
				};
			}

			if (response.status >= 400 && response.status < 500) {
				return {
					status: 'rejected',
					error: new Error(`Webhook rejected: ${response.status} ${response.statusText}`),
				};
			}

			return {
				status: 'error',
				error: new Error(`Webhook error: ${response.status} ${response.statusText}`),
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
}
