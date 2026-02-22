/**
 * orgloop shutdown — Unconditionally stop the daemon and all modules.
 *
 * Unlike `orgloop stop` which only removes the current directory's module,
 * `shutdown` tears down the entire daemon regardless of how many modules
 * are registered.
 */

import { readFile, unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import { getDaemonInfo, isProcessRunning, shutdownDaemon } from '../daemon-client.js';
import { clearModulesState } from '../module-registry.js';
import * as output from '../output.js';

const PID_DIR = join(homedir(), '.orgloop');
const PID_FILE = join(PID_DIR, 'orgloop.pid');
const PORT_FILE = join(PID_DIR, 'runtime.port');
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (!isProcessRunning(pid)) return true;
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	return false;
}

async function cleanupFiles(): Promise<void> {
	for (const file of [PID_FILE, PORT_FILE]) {
		try {
			await unlink(file);
		} catch {
			/* ignore */
		}
	}
}

export function registerShutdownCommand(program: Command): void {
	program
		.command('shutdown')
		.description('Shut down the daemon and all registered modules')
		.option('--force', 'Force kill with SIGKILL')
		.action(async (opts) => {
			try {
				const daemonInfo = await getDaemonInfo();

				if (!daemonInfo) {
					// Check for stale PID file
					try {
						await readFile(PID_FILE, 'utf-8');
						output.info('OrgLoop is not running (stale PID file). Cleaning up.');
						await cleanupFiles();
						await clearModulesState();
					} catch {
						output.info('OrgLoop is not running.');
					}
					return;
				}

				const { pid, port } = daemonInfo;

				output.info(`Shutting down OrgLoop daemon (PID ${pid}) and all modules...`);

				if (opts.force) {
					process.kill(pid, 'SIGKILL');
					output.success('Force killed.');
					await cleanupFiles();
					await clearModulesState();
					if (output.isJsonMode()) {
						output.json({ shutdown: true, pid, force: true });
					}
					return;
				}

				// Graceful shutdown via control API
				output.info('Requesting graceful shutdown via control API...');
				const apiShutdown = await shutdownDaemon(port);

				if (!apiShutdown) {
					// Fallback to SIGTERM
					process.kill(pid, 'SIGTERM');
					output.info('Sent SIGTERM, waiting for shutdown...');
				}

				const exited = await waitForExit(pid, SHUTDOWN_TIMEOUT_MS);
				if (exited) {
					output.success('Daemon shut down.');
				} else {
					output.warn(
						`Process did not exit within ${SHUTDOWN_TIMEOUT_MS / 1000}s. Sending SIGKILL...`,
					);
					try {
						process.kill(pid, 'SIGKILL');
					} catch {
						/* already dead */
					}
					output.success('Force killed.');
				}

				await cleanupFiles();
				await clearModulesState();

				if (output.isJsonMode()) {
					output.json({ shutdown: true, pid });
				}
			} catch (err) {
				const errObj = err as NodeJS.ErrnoException;
				if (errObj.code === 'EPERM' || errObj.code === 'EACCES') {
					output.error(
						'Permission denied. The daemon may have been started by another user. Try: sudo orgloop shutdown',
					);
				} else {
					output.error(`Shutdown failed: ${err instanceof Error ? err.message : String(err)}`);
				}
				process.exitCode = 1;
			}
		});
}
