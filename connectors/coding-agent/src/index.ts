/**
 * @orgloop/connector-coding-agent — Harness-agnostic coding agent source connector registration.
 *
 * Works with any coding agent harness (Claude Code, Codex, OpenCode, Pi, Pi-rust, etc.)
 * that sends lifecycle events via webhook. The `platform` config field controls provenance
 * metadata; it defaults to the source ID if not specified.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { CodingAgentSource } from './source.js';

export type { CodingAgentSessionPayload, CodingAgentSourceConfig } from './source.js';
export { CodingAgentSource } from './source.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'coding-agent',
		source: CodingAgentSource,
		setup: {
			env_vars: [
				{
					name: 'WEBHOOK_SECRET',
					description:
						'HMAC-SHA256 secret for validating webhook signatures (optional, env var name varies per harness)',
					required: false,
				},
			],
		},
	};
}
