/**
 * @orgloop/connector-cron — Cron source connector registration.
 *
 * Schedule-based event emission using standard 5-field cron expressions
 * or interval syntax (e.g., "every 5m"). No env vars required — purely
 * config-driven.
 */

import type { ConnectorRegistration } from '@orgloop/sdk';
import { CronSource } from './source.js';

export default function register(): ConnectorRegistration {
	return {
		id: 'cron',
		source: CronSource,
		configSchema: {
			type: 'object',
			required: ['schedules'],
			properties: {
				schedules: {
					type: 'array',
					minItems: 1,
					items: {
						type: 'object',
						required: ['name', 'cron'],
						properties: {
							name: {
								type: 'string',
								description: 'Unique name for this schedule (used in event provenance)',
							},
							cron: {
								type: 'string',
								description: 'Cron expression (5-field: "0 9 * * 1-5") or interval ("every 5m")',
							},
							payload: {
								type: 'object',
								description: 'Additional payload fields to include in emitted events',
							},
						},
					},
				},
			},
		},
		setup: {
			// Cron connector requires no env vars — purely config-driven
			env_vars: [],
		},
	};
}
