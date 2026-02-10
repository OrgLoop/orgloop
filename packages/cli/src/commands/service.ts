/**
 * orgloop service — Manage the installed service.
 *
 * Thin wrappers around platform tools (launchctl/systemctl).
 * Subcommands: start, stop, status, logs.
 */

import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Command } from 'commander';
import * as output from '../output.js';

const exec = promisify(execFile);

type Platform = 'launchd' | 'systemd' | 'unknown';

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

async function detectPlatform(): Promise<{ platform: Platform; servicePath: string }> {
	const launchdPath = join(homedir(), 'Library', 'LaunchAgents', 'com.orgloop.daemon.plist');
	const systemdPath = join(homedir(), '.config', 'systemd', 'user', 'orgloop.service');

	if (await fileExists(launchdPath)) {
		return { platform: 'launchd', servicePath: launchdPath };
	}
	if (await fileExists(systemdPath)) {
		return { platform: 'systemd', servicePath: systemdPath };
	}

	return { platform: 'unknown', servicePath: '' };
}

async function runCommand(
	cmd: string,
	args: string[],
): Promise<{ stdout: string; stderr: string }> {
	try {
		return await exec(cmd, args);
	} catch (err) {
		const e = err as { stdout?: string; stderr?: string; message?: string };
		return { stdout: e.stdout ?? '', stderr: e.stderr ?? e.message ?? 'Command failed' };
	}
}

// ─── Command registration ────────────────────────────────────────────────────

export function registerServiceCommand(program: Command): void {
	const serviceCmd = program.command('service').description('Manage the installed OrgLoop service');

	serviceCmd
		.command('start')
		.description('Start the OrgLoop service')
		.action(async () => {
			const { platform, servicePath } = await detectPlatform();

			if (platform === 'unknown') {
				output.error('No OrgLoop service found. Run `orgloop install-service` first.');
				process.exitCode = 1;
				return;
			}

			if (platform === 'launchd') {
				const { stderr } = await runCommand('launchctl', ['load', servicePath]);
				if (stderr && !stderr.includes('already loaded')) {
					output.error(stderr);
					process.exitCode = 1;
				} else {
					output.success('OrgLoop service started (launchd).');
				}
			} else {
				const { stderr } = await runCommand('systemctl', ['--user', 'start', 'orgloop']);
				if (stderr) {
					output.error(stderr);
					process.exitCode = 1;
				} else {
					output.success('OrgLoop service started (systemd).');
				}
			}
		});

	serviceCmd
		.command('stop')
		.description('Stop the OrgLoop service')
		.action(async () => {
			const { platform, servicePath } = await detectPlatform();

			if (platform === 'unknown') {
				output.error('No OrgLoop service found.');
				process.exitCode = 1;
				return;
			}

			if (platform === 'launchd') {
				const { stderr } = await runCommand('launchctl', ['unload', servicePath]);
				if (stderr) {
					output.error(stderr);
					process.exitCode = 1;
				} else {
					output.success('OrgLoop service stopped (launchd).');
				}
			} else {
				const { stderr } = await runCommand('systemctl', ['--user', 'stop', 'orgloop']);
				if (stderr) {
					output.error(stderr);
					process.exitCode = 1;
				} else {
					output.success('OrgLoop service stopped (systemd).');
				}
			}
		});

	serviceCmd
		.command('status')
		.description('Show OrgLoop service status')
		.action(async () => {
			const { platform, servicePath } = await detectPlatform();

			if (platform === 'unknown') {
				output.info('No OrgLoop service installed.');
				output.info('Run `orgloop install-service` to set up a service.');
				return;
			}

			if (platform === 'launchd') {
				const { stdout } = await runCommand('launchctl', ['list']);
				const lines = stdout.split('\n').filter((l) => l.includes('com.orgloop'));
				if (lines.length > 0) {
					output.info('OrgLoop service (launchd):');
					for (const line of lines) {
						output.info(`  ${line.trim()}`);
					}
				} else {
					output.info('OrgLoop service is not loaded.');
					output.info(`Service file: ${servicePath}`);
				}
			} else {
				const { stdout } = await runCommand('systemctl', ['--user', 'status', 'orgloop']);
				output.info(stdout || 'OrgLoop service is not running.');
			}
		});

	serviceCmd
		.command('logs')
		.description('Show OrgLoop service logs')
		.action(async () => {
			const { platform } = await detectPlatform();

			if (platform === 'unknown') {
				output.error('No OrgLoop service found.');
				process.exitCode = 1;
				return;
			}

			const stdoutLog = join(homedir(), '.orgloop', 'logs', 'daemon.stdout.log');
			const stderrLog = join(homedir(), '.orgloop', 'logs', 'daemon.stderr.log');

			if (platform === 'launchd') {
				output.info('Service logs:');
				output.info(`  stdout: ${stdoutLog}`);
				output.info(`  stderr: ${stderrLog}`);
				output.blank();
				output.info('Tail with:');
				output.info(`  tail -f ${stdoutLog}`);
			} else {
				const { stdout } = await runCommand('journalctl', [
					'--user',
					'-u',
					'orgloop',
					'-n',
					'50',
					'--no-pager',
				]);
				if (stdout) {
					output.info(stdout);
				} else {
					output.info('No logs found. Service may not have started.');
					output.info('Fallback log files:');
					output.info(`  stdout: ${stdoutLog}`);
					output.info(`  stderr: ${stderrLog}`);
				}
			}
		});
}
