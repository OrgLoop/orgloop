/**
 * @orgloop/connector-claude-code — Backward-compatible alias.
 *
 * This package now delegates to @orgloop/connector-coding-agent.
 * The connector ID remains 'claude-code' for existing configs.
 */

import { CodingAgentSource } from '@orgloop/connector-coding-agent';
import type { ConnectorRegistration } from '@orgloop/sdk';

export { CodingAgentSource as ClaudeCodeSource } from '@orgloop/connector-coding-agent';

export default function register(): ConnectorRegistration {
	return {
		id: 'claude-code',
		source: CodingAgentSource,
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
