/**
 * Native .env file support for the OrgLoop CLI.
 *
 * Loads KEY=VALUE pairs from a .env file in the project directory (next to orgloop.yaml).
 * Shell environment variables take precedence over .env values (no overwrite).
 */

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseEnvFile } from './commands/env.js';
import { resolveConfigPath } from './config.js';

/**
 * Load a .env file from the same directory as orgloop.yaml.
 * Sets process.env[KEY] only if not already set (shell env wins).
 * Returns the list of variables that were loaded from .env.
 * Silently skips if no .env file exists.
 */
export async function loadDotEnv(configPath?: string): Promise<string[]> {
	const resolvedConfig = resolveConfigPath(configPath);
	const configDir = dirname(resolvedConfig);
	const dotenvPath = join(configDir, '.env');

	let content: string;
	try {
		content = await readFile(dotenvPath, 'utf-8');
	} catch {
		// No .env file — not an error
		return [];
	}

	const vars = parseEnvFile(content);
	const loaded: string[] = [];

	for (const [key, value] of vars) {
		if (process.env[key] === undefined) {
			process.env[key] = value;
			loaded.push(key);
		}
	}

	return loaded;
}
