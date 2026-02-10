/**
 * @orgloop/transform-enrich — registration entry point.
 */

import type { TransformRegistration } from '@orgloop/sdk';
import { EnrichTransform } from './enrich.js';

export function register(): TransformRegistration {
	return {
		id: 'enrich',
		transform: EnrichTransform,
		configSchema: {
			type: 'object',
			properties: {
				set: {
					type: 'object',
					description: 'Static key-value pairs to set on the event (dot-path → value).',
				},
				copy: {
					type: 'object',
					description:
						'Copy fields from one location to another (target dot-path → source dot-path).',
					additionalProperties: { type: 'string' },
				},
				compute: {
					type: 'object',
					description:
						'Computed boolean fields from simple expressions (target dot-path → expression).',
					additionalProperties: { type: 'string' },
				},
			},
			additionalProperties: false,
		},
	};
}

export { EnrichTransform } from './enrich.js';
