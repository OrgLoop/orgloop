/**
 * @orgloop/connector-codex — Codex hook-based source connector registration.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { CodexSource } from './source.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'codex',
		source: CodexSource,
		setup: {
			env_vars: [
				{
					name: 'CODEX_WEBHOOK_SECRET',
					description: 'HMAC-SHA256 secret for validating webhook signatures (optional)',
					required: false,
				},
			],
			integrations: [
				{
					id: 'codex-stop-hook',
					description: 'Install a Stop hook so Codex session exits notify OrgLoop',
					platform: 'codex',
					command: 'orgloop hook codex-stop',
				},
				{
					id: 'codex-start-hook',
					description: 'Install a Start hook so Codex session launches notify OrgLoop (optional)',
					platform: 'codex',
					command: 'orgloop hook codex-start',
				},
			],
		},
	};
}
