/**
 * CLI command: orgloop inbox — drain and inspect inbox queues.
 *
 * Subcommands:
 *   orgloop inbox drain --key <session_key> [--limit N] [--format json|text]
 *   orgloop inbox status [--key <session_key>]
 */

import type { Command } from 'commander';
import { getDaemonInfo } from '../daemon-client.js';
import * as output from '../output.js';

interface DrainResult {
	events: Array<Record<string, unknown>>;
	remaining: number;
	continuation: string | null;
}

async function fetchInboxApi(
	port: number,
	endpoint: string,
	params?: Record<string, string>,
): Promise<unknown> {
	const url = new URL(`http://127.0.0.1:${port}/api/inbox/${endpoint}`);
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			url.searchParams.set(k, v);
		}
	}
	const res = await fetch(url.toString(), {
		signal: AbortSignal.timeout(5_000),
	});
	if (!res.ok) {
		throw new Error(`Inbox API returned HTTP ${res.status}`);
	}
	return res.json();
}

/** Format drain output for human consumption. */
export function formatDrainText(result: DrainResult): string {
	const lines: string[] = [];
	lines.push(`Drained ${result.events.length} event(s)`);
	if (result.remaining > 0) {
		lines.push(`  ${result.remaining} event(s) remaining`);
	}
	for (const evt of result.events) {
		const ts = (evt.timestamp as string) ?? '';
		const type = (evt.type as string) ?? '';
		const src = (evt.source as string) ?? '';
		const id = (evt.id as string) ?? '';
		lines.push(`  ${ts}  ${type}  ${src}  ${id}`);
	}
	return lines.join('\n');
}

/** Format status output for human consumption. */
export function formatStatusText(sessions: Array<{ sessionKey: string; pending: number }>): string {
	if (sessions.length === 0) return 'No pending inbox sessions.';
	const lines: string[] = ['Inbox sessions:'];
	for (const s of sessions) {
		lines.push(`  ${s.sessionKey}  (${s.pending} pending)`);
	}
	return lines.join('\n');
}

export function registerInboxCommand(program: Command): void {
	const inboxCmd = program.command('inbox').description('Inspect and drain inbox event queues');

	inboxCmd
		.command('drain')
		.description('Drain pending events for a session key')
		.requiredOption('--key <session_key>', 'Session key to drain')
		.option('--limit <n>', 'Max events to drain', '100')
		.option('--format <fmt>', 'Output format: json or text', 'json')
		.action(async (opts) => {
			try {
				const daemon = await getDaemonInfo();
				if (!daemon) {
					output.error('OrgLoop is not running. Start with `orgloop start`.');
					process.exitCode = 1;
					return;
				}

				const params: Record<string, string> = {
					session_key: opts.key,
				};
				if (opts.limit) params.limit = opts.limit;

				const result = (await fetchInboxApi(daemon.port, 'drain', params)) as DrainResult;

				if (opts.format === 'text') {
					output.info(formatDrainText(result));
				} else {
					output.json(result);
				}
			} catch (err) {
				output.error(`Inbox drain failed: ${err instanceof Error ? err.message : String(err)}`);
				process.exitCode = 1;
			}
		});

	inboxCmd
		.command('status')
		.description('Show inbox status')
		.option('--key <session_key>', 'Session key to check (omit for all)')
		.action(async (opts) => {
			try {
				const daemon = await getDaemonInfo();
				if (!daemon) {
					output.error('OrgLoop is not running. Start with `orgloop start`.');
					process.exitCode = 1;
					return;
				}

				if (opts.key) {
					const result = (await fetchInboxApi(daemon.port, 'status', {
						session_key: opts.key,
					})) as { pending: number };

					if (output.isJsonMode()) {
						output.json(result);
					} else {
						output.info(`${opts.key}: ${result.pending} event(s) pending`);
					}
				} else {
					const result = (await fetchInboxApi(daemon.port, 'list')) as {
						sessions: Array<{ sessionKey: string; pending: number }>;
					};

					if (output.isJsonMode()) {
						output.json(result);
					} else {
						output.info(formatStatusText(result.sessions));
					}
				}
			} catch (err) {
				output.error(`Inbox status failed: ${err instanceof Error ? err.message : String(err)}`);
				process.exitCode = 1;
			}
		});
}
