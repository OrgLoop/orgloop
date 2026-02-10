/**
 * orgloop apply — Start/update the runtime with current config.
 *
 * Loads config, creates OrgLoop engine instance, starts it.
 * Foreground by default; --daemon forks to background.
 */

import { fork } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import type { Command } from 'commander';
import { loadCliConfig, resolveConfigPath } from '../config.js';
import { getEnvVarMeta } from '../env-metadata.js';
import * as output from '../output.js';
import { resolveConnectors } from '../resolve-connectors.js';
import { scanEnvVars } from './env.js';

const PID_DIR = join(homedir(), '.orgloop');
const PID_FILE = join(PID_DIR, 'orgloop.pid');
const STATE_FILE = join(PID_DIR, 'state.json');

// ─── State persistence ──────────────────────────────────────────────────────

async function saveState(config: import('@orgloop/sdk').OrgLoopConfig): Promise<void> {
	await mkdir(PID_DIR, { recursive: true });

	const state = {
		sources: Object.fromEntries(
			config.sources.map((s) => [
				s.id,
				{ connector: s.connector, poll_interval: s.poll?.interval },
			]),
		),
		actors: Object.fromEntries(config.actors.map((a) => [a.id, { connector: a.connector }])),
		routes: Object.fromEntries(
			config.routes.map((r) => [r.name, { source: r.when.source, actor: r.then.actor }]),
		),
		transforms: Object.fromEntries(config.transforms.map((t) => [t.name, { type: t.type }])),
		loggers: Object.fromEntries(config.loggers.map((l) => [l.name, { type: l.type }])),
	};

	await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// ─── Foreground run ──────────────────────────────────────────────────────────

async function runForeground(configPath?: string): Promise<void> {
	// Pre-flight: check all env vars before loadCliConfig crashes on the first one
	try {
		const resolvedPath = resolveConfigPath(configPath);
		const envVars = await scanEnvVars(resolvedPath);
		const missing: Array<{ name: string; source: string }> = [];
		const present: Array<{ name: string; source: string }> = [];

		for (const [name, source] of envVars) {
			if (process.env[name] === undefined) {
				missing.push({ name, source });
			} else {
				present.push({ name, source });
			}
		}

		if (missing.length > 0) {
			const maxLen = Math.max(...[...envVars.keys()].map((k) => k.length));

			output.blank();
			output.heading('Environment Variables:');
			output.blank();

			for (const v of present) {
				console.log(`  ${chalk.green('\u2713')} ${v.name.padEnd(maxLen)}  ${chalk.dim(v.source)}`);
			}
			for (const v of missing) {
				console.log(`  ${chalk.red('\u2717')} ${v.name.padEnd(maxLen)}  ${chalk.dim(v.source)}`);
				const meta = getEnvVarMeta(v.name);
				if (meta) {
					console.log(`    ${chalk.dim('\u2192')} ${chalk.dim(meta.description)}`);
					if (meta.help_url) {
						console.log(`    ${chalk.dim('\u2192')} ${chalk.dim(meta.help_url)}`);
					}
				}
			}

			output.blank();
			output.error(
				`${missing.length} variable${missing.length > 1 ? 's' : ''} missing \u2014 run \`orgloop env\` for details.`,
			);
			process.exitCode = 1;
			return;
		}
	} catch {
		// Pre-flight is best-effort — fall through to loadCliConfig
	}

	const config = await loadCliConfig({ configPath });

	output.blank();
	output.info('Applying plan...');
	output.blank();

	// Import OrgLoop from core — this may fail if core isn't built yet
	let OrgLoop: new (
		config: import('@orgloop/sdk').OrgLoopConfig,
		options?: Record<string, unknown>,
	) => {
		start(): Promise<void>;
		stop(): Promise<void>;
		status(): unknown;
	};

	try {
		const core = await import('@orgloop/core');
		OrgLoop = core.OrgLoop;
	} catch {
		// Core not available yet — run in stub mode
		output.warn('OrgLoop core not available — running in config-only mode');
		output.blank();

		// Display what would be started
		for (const s of config.sources) {
			const interval = s.poll?.interval
				? `polling started (every ${s.poll.interval})`
				: 'hook listener started';
			output.success(`Source ${s.id} — ${interval}`);
		}
		for (const a of config.actors) {
			output.success(`Actor ${a.id} — ready`);
		}
		for (const r of config.routes) {
			output.success(`Route ${r.name} — active`);
		}
		for (const l of config.loggers) {
			output.success(`Logger ${l.name} — configured`);
		}

		await saveState(config);

		// Write PID file
		await mkdir(PID_DIR, { recursive: true });
		await writeFile(PID_FILE, String(process.pid), 'utf-8');

		output.blank();
		output.info(`OrgLoop is running. PID: ${process.pid}`);
		output.info('Logs: orgloop logs | Status: orgloop status | Stop: orgloop stop');

		// Keep process alive
		const shutdown = async () => {
			output.blank();
			output.info('Shutting down...');
			const { unlink } = await import('node:fs/promises');
			try {
				await unlink(PID_FILE);
			} catch {
				/* ignore */
			}
			process.exit(0);
		};

		process.on('SIGTERM', shutdown);
		process.on('SIGINT', shutdown);

		// Block forever
		await new Promise(() => {});
		return;
	}

	// Resolve connectors from config
	let resolvedSources: Map<string, import('@orgloop/sdk').SourceConnector>;
	let resolvedActors: Map<string, import('@orgloop/sdk').ActorConnector>;
	try {
		const resolved = await resolveConnectors(config);
		resolvedSources = resolved.sources;
		resolvedActors = resolved.actors;
	} catch (err) {
		output.error(
			`Connector resolution failed: ${err instanceof Error ? err.message : String(err)}`,
		);
		process.exitCode = 1;
		return;
	}

	// Create persistent checkpoint store
	let checkpointStore: import('@orgloop/core').FileCheckpointStore | undefined;
	try {
		const { FileCheckpointStore } = await import('@orgloop/core');
		checkpointStore = new FileCheckpointStore();
	} catch {
		// Fall through — engine will use InMemoryCheckpointStore
	}

	// Resolve package transforms from config
	const resolvedTransforms = new Map<string, import('@orgloop/sdk').Transform>();
	for (const tDef of config.transforms) {
		if (tDef.type === 'package' && tDef.package) {
			try {
				const mod = await import(tDef.package);
				if (typeof mod.register === 'function') {
					const reg = mod.register();
					resolvedTransforms.set(tDef.name, new reg.transform());
				}
			} catch (err) {
				output.warn(
					`Transform "${tDef.name}" (${tDef.package}) not available: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	// Resolve loggers from config
	const resolvedLoggers = new Map<string, import('@orgloop/sdk').Logger>();
	for (const loggerDef of config.loggers) {
		try {
			const mod = await import(loggerDef.type);
			if (typeof mod.register === 'function') {
				const reg = mod.register();
				resolvedLoggers.set(loggerDef.name, new reg.logger());
			}
		} catch (err) {
			output.warn(
				`Logger "${loggerDef.name}" (${loggerDef.type}) not available: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	// Core is available — start the engine
	const engine = new OrgLoop(config, {
		sources: resolvedSources,
		actors: resolvedActors,
		transforms: resolvedTransforms,
		loggers: resolvedLoggers,
		...(checkpointStore ? { checkpointStore } : {}),
	});

	// Signal handling
	const shutdown = async () => {
		output.blank();
		output.info('Shutting down...');
		await engine.stop();
		const { unlink } = await import('node:fs/promises');
		try {
			await unlink(PID_FILE);
		} catch {
			/* ignore */
		}
		process.exit(0);
	};

	process.on('SIGTERM', shutdown);
	process.on('SIGINT', shutdown);

	try {
		// Display progress as components initialize
		for (const s of config.sources) {
			const interval = s.poll?.interval
				? `polling started (every ${s.poll.interval})`
				: 'hook listener started';
			output.success(`Source ${s.id} — ${interval}`);
		}
		for (const a of config.actors) {
			output.success(`Actor ${a.id} — ready`);
		}
		for (const r of config.routes) {
			output.success(`Route ${r.name} — active`);
		}
		for (const l of config.loggers) {
			output.success(`Logger ${l.name} — configured`);
		}

		await engine.start();
		await saveState(config);

		// Write PID file
		await mkdir(PID_DIR, { recursive: true });
		await writeFile(PID_FILE, String(process.pid), 'utf-8');

		output.blank();
		output.info(`OrgLoop is running. PID: ${process.pid}`);
		output.info('Logs: orgloop logs | Status: orgloop status | Stop: orgloop stop');
	} catch (err) {
		output.error(`Failed to start: ${err instanceof Error ? err.message : String(err)}`);
		process.exitCode = 1;
	}
}

// ─── Command registration ────────────────────────────────────────────────────

export function registerApplyCommand(program: Command): void {
	program
		.command('apply')
		.description('Start/update the runtime with current config')
		.option('--daemon', 'Run as background daemon')
		.action(async (opts, cmd) => {
			try {
				const globalOpts = cmd.parent?.opts() ?? {};

				if (opts.daemon) {
					// Fork to background
					const config = await loadCliConfig({ configPath: globalOpts.config });

					output.info('Starting OrgLoop daemon...');

					const child = fork(fileURLToPath(import.meta.url), ['--foreground'], {
						detached: true,
						stdio: 'ignore',
						env: {
							...process.env,
							ORGLOOP_CONFIG: globalOpts.config ?? '',
							ORGLOOP_DAEMON: '1',
						},
					});

					child.unref();

					if (child.pid) {
						await mkdir(PID_DIR, { recursive: true });
						await writeFile(PID_FILE, String(child.pid), 'utf-8');
						output.success(`OrgLoop daemon started. PID: ${child.pid}`);
						output.info(`PID file: ${PID_FILE}`);
					}
				} else {
					await runForeground(globalOpts.config);
				}
			} catch (err) {
				output.error(`Apply failed: ${err instanceof Error ? err.message : String(err)}`);
				process.exitCode = 1;
			}
		});
}

// Handle being run as a forked daemon child
if (process.env.ORGLOOP_DAEMON === '1') {
	runForeground(process.env.ORGLOOP_CONFIG || undefined).catch((err) => {
		console.error('Daemon failed:', err);
		process.exit(1);
	});
}
