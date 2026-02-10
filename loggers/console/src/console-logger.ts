/**
 * Console logger — human-readable colored output for development.
 *
 * Writes to process.stderr so stdout stays clean for JSON output.
 */

import type { LogEntry, Logger } from '@orgloop/sdk';
import { formatCompact, formatVerbose, shouldLog } from './format.js';

interface ConsoleLoggerConfig {
	level?: 'debug' | 'info' | 'warn' | 'error';
	color?: boolean;
	compact?: boolean;
	show_payload?: boolean;
}

export class ConsoleLogger implements Logger {
	readonly id = 'console';
	private level = 'info';
	private useColor = true;
	private compact = true;
	private showPayload = false;

	async init(config: Record<string, unknown>): Promise<void> {
		const cfg = config as ConsoleLoggerConfig;
		if (cfg.level) this.level = cfg.level;
		if (cfg.color !== undefined) this.useColor = cfg.color;
		if (cfg.compact !== undefined) this.compact = cfg.compact;
		if (cfg.show_payload !== undefined) this.showPayload = cfg.show_payload;
	}

	async log(entry: LogEntry): Promise<void> {
		try {
			if (!shouldLog(entry.phase, this.level)) return;

			const formatted = this.compact
				? formatCompact(entry, this.useColor)
				: formatVerbose(entry, this.useColor, this.showPayload);

			process.stderr.write(`${formatted}\n`);
		} catch {
			// Loggers must not throw
		}
	}

	async flush(): Promise<void> {
		// Console output is unbuffered — nothing to flush
	}

	async shutdown(): Promise<void> {
		// No resources to clean up
	}
}
