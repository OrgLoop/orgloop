/**
 * @orgloop/connector-pi-rust — Pi-rust hook-based source connector registration.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { PiRustSource } from './source.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'pi-rust',
		source: PiRustSource,
		setup: {
			env_vars: [
				{
					name: 'PI_RUST_WEBHOOK_SECRET',
					description: 'HMAC-SHA256 secret for validating webhook signatures (optional)',
					required: false,
				},
			],
			integrations: [
				{
					id: 'pi-rust-stop-hook',
					description: 'Install a Stop hook so Pi-rust session exits notify OrgLoop',
					platform: 'pi-rust',
					command: 'orgloop hook pi-rust-stop',
				},
				{
					id: 'pi-rust-start-hook',
					description: 'Install a Start hook so Pi-rust session launches notify OrgLoop (optional)',
					platform: 'pi-rust',
					command: 'orgloop hook pi-rust-start',
				},
			],
		},
	};
}
