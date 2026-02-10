/**
 * Connector instantiation bridge.
 *
 * Dynamically imports connector packages referenced in config,
 * instantiates source/actor connectors, and returns Maps keyed by ID.
 */

import type {
	ActorConnector,
	ConnectorRegistration,
	OrgLoopConfig,
	SourceConnector,
} from '@orgloop/sdk';

export interface ResolvedConnectors {
	sources: Map<string, SourceConnector>;
	actors: Map<string, ActorConnector>;
}

export type ImportFn = (specifier: string) => Promise<{ default: () => ConnectorRegistration }>;

/**
 * Resolve all connectors referenced in config by dynamically importing
 * their packages and instantiating source/actor instances.
 */
export async function resolveConnectors(
	config: OrgLoopConfig,
	importFn: ImportFn = (s) => import(s),
): Promise<ResolvedConnectors> {
	const sources = new Map<string, SourceConnector>();
	const actors = new Map<string, ActorConnector>();

	// Collect unique connector package names
	const packageMap = new Map<string, ConnectorRegistration>();

	const allPackages = new Set<string>();
	for (const s of config.sources) {
		allPackages.add(s.connector);
	}
	for (const a of config.actors) {
		allPackages.add(a.connector);
	}

	// Import each unique connector package
	for (const packageName of allPackages) {
		if (packageMap.has(packageName)) continue;

		let mod: { default: () => ConnectorRegistration };
		try {
			mod = await importFn(packageName);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			throw new Error(
				`Failed to import connector "${packageName}": ${msg}\n` +
					`  Hint: run \`pnpm add ${packageName}\` to install it.`,
			);
		}

		if (typeof mod.default !== 'function') {
			throw new Error(
				`Connector "${packageName}" does not export a default registration function.`,
			);
		}

		const registration = mod.default();
		packageMap.set(packageName, registration);
	}

	// Instantiate sources
	for (const sourceCfg of config.sources) {
		const reg = packageMap.get(sourceCfg.connector);
		if (!reg) continue;

		if (!reg.source) {
			throw new Error(
				`Connector "${sourceCfg.connector}" does not provide a source, ` +
					`but source "${sourceCfg.id}" requires one.`,
			);
		}

		sources.set(sourceCfg.id, new reg.source());
	}

	// Instantiate actors
	for (const actorCfg of config.actors) {
		const reg = packageMap.get(actorCfg.connector);
		if (!reg) continue;

		if (!reg.target) {
			throw new Error(
				`Connector "${actorCfg.connector}" does not provide a target, ` +
					`but actor "${actorCfg.id}" requires one.`,
			);
		}

		actors.set(actorCfg.id, new reg.target());
	}

	return { sources, actors };
}

/**
 * Resolve connector registrations (without instantiating sources/actors).
 *
 * Used by doctor to discover credential_validators and service_detectors
 * without needing a full engine startup. Returns a Map of package name -> registration.
 */
export async function resolveConnectorRegistrations(
	config: OrgLoopConfig,
	importFn: ImportFn = (s) => import(s),
): Promise<Map<string, ConnectorRegistration>> {
	const registrations = new Map<string, ConnectorRegistration>();

	const allPackages = new Set<string>();
	for (const s of config.sources) {
		allPackages.add(s.connector);
	}
	for (const a of config.actors) {
		allPackages.add(a.connector);
	}

	for (const packageName of allPackages) {
		try {
			const mod = await importFn(packageName);
			if (typeof mod.default === 'function') {
				registrations.set(packageName, mod.default());
			}
		} catch {
			// Best-effort — doctor should not fail if a connector can't be imported
		}
	}

	return registrations;
}
