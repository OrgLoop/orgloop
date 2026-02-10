/**
 * @orgloop/logger-console — registration entry point.
 */

import type { LoggerRegistration } from '@orgloop/sdk';
import { ConsoleLogger } from './console-logger.js';

export function register(): LoggerRegistration {
	return {
		id: 'console',
		logger: ConsoleLogger,
		configSchema: {
			type: 'object',
			properties: {
				level: {
					type: 'string',
					enum: ['debug', 'info', 'warn', 'error'],
					description: 'Minimum log level to display.',
					default: 'info',
				},
				color: {
					type: 'boolean',
					description: 'Use ANSI colors in output.',
					default: true,
				},
				compact: {
					type: 'boolean',
					description: 'One line per entry.',
					default: true,
				},
				show_payload: {
					type: 'boolean',
					description: 'Show event payload metadata in verbose mode.',
					default: false,
				},
			},
			additionalProperties: false,
		},
	};
}

export { ConsoleLogger } from './console-logger.js';
export { formatCompact, formatVerbose, shouldLog } from './format.js';
