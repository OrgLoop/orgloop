/**
 * @orgloop/connector-opencode — OpenCode hook-based source connector registration.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { OpenCodeSource } from './source.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'opencode',
		source: OpenCodeSource,
		setup: {
			env_vars: [
				{
					name: 'OPENCODE_WEBHOOK_SECRET',
					description: 'HMAC-SHA256 secret for validating webhook signatures (optional)',
					required: false,
				},
			],
			integrations: [
				{
					id: 'opencode-stop-hook',
					description: 'Install a Stop hook so OpenCode session exits notify OrgLoop',
					platform: 'opencode',
					command: 'orgloop hook opencode-stop',
				},
				{
					id: 'opencode-start-hook',
					description:
						'Install a Start hook so OpenCode session launches notify OrgLoop (optional)',
					platform: 'opencode',
					command: 'orgloop hook opencode-start',
				},
			],
		},
	};
}
