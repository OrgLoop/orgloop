/**
 * @orgloop/connector-claude-code — Claude Code hook-based source connector registration.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { ClaudeCodeSource } from './source.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'claude-code',
		source: ClaudeCodeSource,
		setup: {
			env_vars: [
				{
					name: 'CLAUDE_CODE_WEBHOOK_SECRET',
					description: 'HMAC-SHA256 secret for validating webhook signatures (optional)',
					required: false,
				},
			],
			integrations: [
				{
					id: 'claude-code-stop-hook',
					description:
						'Install a Stop hook in Claude Code settings so session exits notify OrgLoop',
					platform: 'claude-code',
					command: 'orgloop hook claude-code-stop',
				},
				{
					id: 'claude-code-start-hook',
					description:
						'Install a Start hook in Claude Code settings so session launches notify OrgLoop (optional)',
					platform: 'claude-code',
					command: 'orgloop hook claude-code-start',
				},
			],
		},
	};
}
