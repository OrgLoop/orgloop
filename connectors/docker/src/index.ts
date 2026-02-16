import type { ConnectorRegistration } from '@orgloop/sdk';
import { DockerTarget } from './target.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'docker',
		target: DockerTarget,
		setup: {
			env_vars: [
				{
					name: 'KUBECONFIG',
					description: 'Path to kubeconfig file for Kind cluster operations',
					required: false,
				},
			],
		},
	};
}
