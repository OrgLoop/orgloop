/**
 * @orgloop/connector-pi — Pi hook-based source connector registration.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { PiSource } from './source.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'pi',
		source: PiSource,
		setup: {
			env_vars: [
				{
					name: 'PI_WEBHOOK_SECRET',
					description: 'HMAC-SHA256 secret for validating webhook signatures (optional)',
					required: false,
				},
			],
			integrations: [
				{
					id: 'pi-stop-hook',
					description: 'Install a Stop hook so Pi session exits notify OrgLoop',
					platform: 'pi',
					command: 'orgloop hook pi-stop',
				},
				{
					id: 'pi-start-hook',
					description: 'Install a Start hook so Pi session launches notify OrgLoop (optional)',
					platform: 'pi',
					command: 'orgloop hook pi-start',
				},
			],
		},
	};
}
