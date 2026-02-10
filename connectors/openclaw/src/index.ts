/**
 * @orgloop/connector-openclaw — OpenClaw actor (target) connector registration.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { OpenClawServiceDetector } from './detector.js';
import { OpenClawTarget } from './target.js';
import { OpenClawCredentialValidator } from './validator.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'openclaw',
		target: OpenClawTarget,
		setup: {
			env_vars: [
				{
					name: 'OPENCLAW_WEBHOOK_TOKEN',
					description: 'OpenClaw webhook authentication token',
					help_url: 'https://openclaw.com/docs/webhooks',
					required: false,
				},
			],
		},
		credential_validators: {
			OPENCLAW_WEBHOOK_TOKEN: new OpenClawCredentialValidator(),
		},
		service_detector: new OpenClawServiceDetector(),
	};
}
