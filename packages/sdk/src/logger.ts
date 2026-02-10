/**
 * Logger interface — passive observers of the event pipeline.
 *
 * Loggers receive LogEntry records for every pipeline phase:
 * source emit, transform results, route matches, delivery attempts.
 */

import type { LogEntry } from './types.js';

/**
 * Logger interface.
 *
 * Implement this to create a new log destination for OrgLoop.
 * Loggers are called for every pipeline event — they should be fast.
 */
export interface Logger {
	/** Unique logger ID */
	readonly id: string;

	/** Initialize with config */
	init(config: Record<string, unknown>): Promise<void>;

	/**
	 * Called for every pipeline event.
	 * Should not throw — log errors should be handled internally.
	 */
	log(entry: LogEntry): Promise<void>;

	/** Flush any buffered entries */
	flush(): Promise<void>;

	/** Clean shutdown (flush + close) */
	shutdown(): Promise<void>;
}

/**
 * Logger registration — what a logger package exports.
 */
export interface LoggerRegistration {
	/** Unique logger ID */
	id: string;
	/** Logger class */
	logger: new () => Logger;
	/** JSON Schema for config validation */
	configSchema?: Record<string, unknown>;
}
