/**
 * orgloop inspect — Deep-dive into a specific source, actor, or route.
 *
 * Shows detailed information about a single component.
 */

import type { OrgLoopConfig } from '@orgloop/sdk';
import type { Command } from 'commander';
import { loadCliConfig } from '../config.js';
import * as output from '../output.js';

function formatConfigEntries(config: Record<string, unknown>): string {
	return Object.entries(config)
		.map(([k, v]) => {
			if (Array.isArray(v)) return `${k}=[${v.join(', ')}]`;
			return `${k}=${String(v)}`;
		})
		.join(', ');
}

function inspectSource(config: OrgLoopConfig, sourceId: string): void {
	const source = config.sources.find((s) => s.id === sourceId);
	if (!source) {
		output.error(`Source "${sourceId}" not found.`);
		output.info(`Available sources: ${config.sources.map((s) => s.id).join(', ') || '(none)'}`);
		process.exitCode = 1;
		return;
	}

	const relatedRoutes = config.routes.filter((r) => r.when.source === sourceId).map((r) => r.name);

	if (output.isJsonMode()) {
		output.json({ ...source, routes: relatedRoutes });
		return;
	}

	const pollType = source.poll ? `poll (every ${source.poll.interval})` : 'hook';

	output.info(`Name:       ${source.id}`);
	if (source.description) output.info(`Desc:       ${source.description}`);
	output.info(`Type:       ${pollType}`);
	output.info(`Connector:  ${source.connector}`);
	output.info(`Config:     ${formatConfigEntries(source.config)}`);
	if (source.emits && source.emits.length > 0) {
		output.info(`Emits:      ${source.emits.join(', ')}`);
	}
	output.info(`Routes:     ${relatedRoutes.join(', ') || '(none)'}`);
}

function inspectActor(config: OrgLoopConfig, actorId: string): void {
	const actor = config.actors.find((a) => a.id === actorId);
	if (!actor) {
		output.error(`Actor "${actorId}" not found.`);
		output.info(`Available actors: ${config.actors.map((a) => a.id).join(', ') || '(none)'}`);
		process.exitCode = 1;
		return;
	}

	const relatedRoutes = config.routes.filter((r) => r.then.actor === actorId).map((r) => r.name);

	if (output.isJsonMode()) {
		output.json({ ...actor, routes: relatedRoutes });
		return;
	}

	output.info(`Name:       ${actor.id}`);
	if (actor.description) output.info(`Desc:       ${actor.description}`);
	output.info(`Connector:  ${actor.connector}`);
	output.info(`Config:     ${formatConfigEntries(actor.config)}`);
	output.info(`Routes:     ${relatedRoutes.join(', ') || '(none)'}`);
}

function inspectRoute(config: OrgLoopConfig, routeName: string): void {
	const route = config.routes.find((r) => r.name === routeName);
	if (!route) {
		output.error(`Route "${routeName}" not found.`);
		output.info(`Available routes: ${config.routes.map((r) => r.name).join(', ') || '(none)'}`);
		process.exitCode = 1;
		return;
	}

	if (output.isJsonMode()) {
		output.json(route);
		return;
	}

	const transformNames = route.transforms?.map((t) => t.ref) ?? [];
	const pipeline =
		transformNames.length > 0
			? `${route.when.source} -> [${transformNames.join(', ')}] -> ${route.then.actor}`
			: `${route.when.source} -> ${route.then.actor}`;

	output.info(`Name:       ${route.name}`);
	if (route.description) output.info(`Desc:       ${route.description}`);
	output.info(`Source:     ${pipeline}`);
	output.info(`Events:     ${route.when.events.join(', ')}`);
	if (route.with?.prompt_file) {
		output.info(`Prompt:     ${route.with.prompt_file}`);
	}
	if (route.when.filter) {
		output.info(`Filter:     ${JSON.stringify(route.when.filter)}`);
	}
}

function inspectTransform(config: OrgLoopConfig, transformName: string): void {
	const transform = config.transforms.find((t) => t.name === transformName);
	if (!transform) {
		output.error(`Transform "${transformName}" not found.`);
		output.info(
			`Available transforms: ${config.transforms.map((t) => t.name).join(', ') || '(none)'}`,
		);
		process.exitCode = 1;
		return;
	}

	const relatedRoutes = config.routes
		.filter((r) => r.transforms?.some((t) => t.ref === transformName))
		.map((r) => r.name);

	if (output.isJsonMode()) {
		output.json({ ...transform, routes: relatedRoutes });
		return;
	}

	output.info(`Name:       ${transform.name}`);
	output.info(`Type:       ${transform.type}`);
	if (transform.script) output.info(`Script:     ${transform.script}`);
	if (transform.package) output.info(`Package:    ${transform.package}`);
	if (transform.timeout_ms) output.info(`Timeout:    ${transform.timeout_ms}ms`);
	output.info(`Routes:     ${relatedRoutes.join(', ') || '(none)'}`);
}

// ─── Command registration ────────────────────────────────────────────────────

export function registerInspectCommand(program: Command): void {
	const inspectCmd = program
		.command('inspect')
		.description('Deep-dive into a specific source, actor, route, or transform');

	inspectCmd
		.command('source <id>')
		.description('Inspect a source connector')
		.action(async (id: string, _opts, cmd) => {
			try {
				const globalOpts = cmd.parent?.parent?.opts() ?? {};
				const config = await loadCliConfig({ configPath: globalOpts.config });
				inspectSource(config, id);
			} catch (err) {
				output.error(`Inspect failed: ${err instanceof Error ? err.message : String(err)}`);
				process.exitCode = 1;
			}
		});

	inspectCmd
		.command('actor <id>')
		.description('Inspect an actor connector')
		.action(async (id: string, _opts, cmd) => {
			try {
				const globalOpts = cmd.parent?.parent?.opts() ?? {};
				const config = await loadCliConfig({ configPath: globalOpts.config });
				inspectActor(config, id);
			} catch (err) {
				output.error(`Inspect failed: ${err instanceof Error ? err.message : String(err)}`);
				process.exitCode = 1;
			}
		});

	inspectCmd
		.command('route <name>')
		.description('Inspect a route')
		.action(async (name: string, _opts, cmd) => {
			try {
				const globalOpts = cmd.parent?.parent?.opts() ?? {};
				const config = await loadCliConfig({ configPath: globalOpts.config });
				inspectRoute(config, name);
			} catch (err) {
				output.error(`Inspect failed: ${err instanceof Error ? err.message : String(err)}`);
				process.exitCode = 1;
			}
		});

	inspectCmd
		.command('transform <name>')
		.description('Inspect a transform')
		.action(async (name: string, _opts, cmd) => {
			try {
				const globalOpts = cmd.parent?.parent?.opts() ?? {};
				const config = await loadCliConfig({ configPath: globalOpts.config });
				inspectTransform(config, name);
			} catch (err) {
				output.error(`Inspect failed: ${err instanceof Error ? err.message : String(err)}`);
				process.exitCode = 1;
			}
		});
}
