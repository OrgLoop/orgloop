/**
 * @orgloop/connector-webhook — Generic webhook connector registration (source + target).
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { WebhookSource } from './source.js';
import { WebhookTarget } from './target.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'webhook',
		source: WebhookSource,
		target: WebhookTarget,
		setup: {
			env_vars: [
				{
					name: 'WEBHOOK_SECRET',
					description: 'HMAC secret for validating incoming webhook signatures',
					required: false,
				},
			],
		},
	};
}
