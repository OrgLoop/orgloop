import type { ConnectorRegistration } from '@orgloop/sdk';
import { AgentCtlSource } from './source.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'agent-ctl',
		source: AgentCtlSource,
		setup: {
			env_vars: [
				{
					name: 'AGENT_CTL_PATH',
					description: 'Path to the agent-ctl binary (defaults to ~/personal/agent-ctl/agent-ctl)',
					required: false,
				},
			],
		},
	};
}
