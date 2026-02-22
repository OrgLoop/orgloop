/**
 * Module registry — tracks which modules are loaded in the running daemon.
 *
 * Persists to ~/.orgloop/modules.json so the CLI can map directories
 * to module names across commands (start, stop, status).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';

function stateDir(): string {
	return join(homedir(), '.orgloop');
}

function modulesFile(): string {
	return join(stateDir(), 'modules.json');
}

export interface RegisteredModule {
	/** Module name (matches the name in runtime's ModuleRegistry) */
	name: string;
	/** Absolute path to the module's source directory */
	sourceDir: string;
	/** Absolute path to the config file used */
	configPath: string;
	/** ISO timestamp when the module was loaded */
	loadedAt: string;
}

export interface ModulesState {
	modules: RegisteredModule[];
}

/** Read the current modules state from disk. */
export async function readModulesState(): Promise<ModulesState> {
	try {
		const content = await readFile(modulesFile(), 'utf-8');
		return JSON.parse(content) as ModulesState;
	} catch {
		return { modules: [] };
	}
}

/** Write the modules state to disk. */
export async function writeModulesState(state: ModulesState): Promise<void> {
	await mkdir(stateDir(), { recursive: true });
	await writeFile(modulesFile(), JSON.stringify(state, null, 2), 'utf-8');
}

/** Register a module in the persistent state. Replaces if same name exists. */
export async function registerModule(entry: RegisteredModule): Promise<void> {
	const state = await readModulesState();
	// Remove existing entry with same name or same sourceDir
	state.modules = state.modules.filter(
		(m) => m.name !== entry.name && m.sourceDir !== entry.sourceDir,
	);
	state.modules.push(entry);
	await writeModulesState(state);
}

/** Unregister a module by name. */
export async function unregisterModule(name: string): Promise<void> {
	const state = await readModulesState();
	state.modules = state.modules.filter((m) => m.name !== name);
	await writeModulesState(state);
}

/** Find a module by source directory. */
export async function findModuleByDir(sourceDir: string): Promise<RegisteredModule | undefined> {
	const state = await readModulesState();
	const absDir = resolve(sourceDir);
	return state.modules.find((m) => m.sourceDir === absDir);
}

/** Find a module by name. */
export async function findModuleByName(name: string): Promise<RegisteredModule | undefined> {
	const state = await readModulesState();
	return state.modules.find((m) => m.name === name);
}

/** Clear all registered modules (used on full daemon shutdown). */
export async function clearModulesState(): Promise<void> {
	await writeModulesState({ modules: [] });
}

/** Derive a module name from a config or directory. */
export function deriveModuleName(configName?: string, configDir?: string): string {
	if (configName) return configName;
	if (configDir) return basename(configDir);
	return basename(process.cwd());
}
