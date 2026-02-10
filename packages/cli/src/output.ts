/**
 * Output formatting utilities for the CLI.
 *
 * Provides colored output, table formatting, JSON mode,
 * quiet mode, and spinner support.
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';

// ─── Global output state ─────────────────────────────────────────────────────

let jsonMode = false;
let quietMode = false;
let verboseMode = false;

export function setJsonMode(enabled: boolean): void {
	jsonMode = enabled;
}

export function setQuietMode(enabled: boolean): void {
	quietMode = enabled;
}

export function setVerboseMode(enabled: boolean): void {
	verboseMode = enabled;
}

export function isJsonMode(): boolean {
	return jsonMode;
}

// ─── Basic output ────────────────────────────────────────────────────────────

export function info(message: string): void {
	if (quietMode || jsonMode) return;
	console.log(message);
}

export function success(message: string): void {
	if (quietMode || jsonMode) return;
	console.log(chalk.green(`  ✓ ${message}`));
}

export function error(message: string): void {
	if (jsonMode) return;
	console.error(chalk.red(`  ✗ ${message}`));
}

export function warn(message: string): void {
	if (quietMode || jsonMode) return;
	console.warn(chalk.yellow(`  ! ${message}`));
}

export function verbose(message: string): void {
	if (!verboseMode || quietMode || jsonMode) return;
	console.log(chalk.dim(`  … ${message}`));
}

export function blank(): void {
	if (quietMode || jsonMode) return;
	console.log();
}

// ─── Styled output ───────────────────────────────────────────────────────────

export function heading(text: string): void {
	if (quietMode || jsonMode) return;
	console.log(chalk.bold(text));
}

export function subheading(text: string): void {
	if (quietMode || jsonMode) return;
	console.log(chalk.bold.dim(`\n  ${text}:`));
}

export function planAdd(text: string): void {
	if (quietMode || jsonMode) return;
	console.log(chalk.green(`    + ${text}`));
}

export function planChange(text: string): void {
	if (quietMode || jsonMode) return;
	console.log(chalk.yellow(`    ~ ${text}`));
}

export function planUnchanged(text: string): void {
	if (quietMode || jsonMode) return;
	console.log(chalk.dim(`    = ${text}`));
}

export function planRemove(text: string): void {
	if (quietMode || jsonMode) return;
	console.log(chalk.red(`    - ${text}`));
}

// ─── JSON output ─────────────────────────────────────────────────────────────

export function json(data: unknown): void {
	console.log(JSON.stringify(data, null, 2));
}

// ─── Table formatting ────────────────────────────────────────────────────────

export interface TableColumn {
	header: string;
	key: string;
	width?: number;
	align?: 'left' | 'right';
}

export function table(columns: TableColumn[], rows: Record<string, string>[]): void {
	if (jsonMode) {
		json(rows);
		return;
	}
	if (quietMode) return;

	// Calculate column widths
	const widths = columns.map((col) => {
		const headerLen = col.header.length;
		const maxDataLen = rows.reduce((max, row) => Math.max(max, (row[col.key] ?? '').length), 0);
		return col.width ?? Math.max(headerLen, maxDataLen) + 2;
	});

	// Print header
	const headerLine = columns.map((col, i) => col.header.padEnd(widths[i])).join('');
	console.log(chalk.dim(`  ${headerLine}`));

	// Print rows
	for (const row of rows) {
		const line = columns
			.map((col, i) => {
				const val = row[col.key] ?? '';
				return col.align === 'right' ? val.padStart(widths[i]) : val.padEnd(widths[i]);
			})
			.join('');
		console.log(`  ${line}`);
	}
}

// ─── Spinner ─────────────────────────────────────────────────────────────────

export function spinner(text: string): Ora {
	if (jsonMode || quietMode) {
		// Return a no-op spinner
		return ora({ text, isSilent: true });
	}
	return ora({ text, color: 'cyan' }).start();
}

// ─── Validation output ───────────────────────────────────────────────────────

export function validPass(file: string, description: string): void {
	if (quietMode || jsonMode) return;
	console.log(`${chalk.green('✓')} ${file} — ${description}`);
}

export function validFail(file: string, description: string): void {
	if (jsonMode) return;
	console.log(`${chalk.red('✗')} ${file} — ${description}`);
}

export function validWarn(file: string, description: string): void {
	if (quietMode || jsonMode) return;
	console.log(`${chalk.yellow('!')} ${file} — ${description}`);
}
