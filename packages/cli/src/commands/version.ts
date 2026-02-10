/**
 * orgloop version — Print version info.
 *
 * Shows orgloop version, node version, platform.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import * as output from '../output.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function getVersion(): Promise<string> {
	try {
		// Walk up from commands/ to find package.json
		const pkgPath = resolve(__dirname, '..', '..', 'package.json');
		const content = await readFile(pkgPath, 'utf-8');
		const pkg = JSON.parse(content) as { version: string };
		return pkg.version;
	} catch {
		return 'unknown';
	}
}

export function registerVersionCommand(program: Command): void {
	program
		.command('version')
		.description('Print version info')
		.action(async () => {
			const version = await getVersion();

			if (output.isJsonMode()) {
				output.json({
					orgloop: version,
					node: process.version,
					platform: `${process.platform} ${process.arch}`,
				});
				return;
			}

			output.info(`orgloop ${version}`);
			output.info(`node    ${process.version}`);
			output.info(`platform ${process.platform} ${process.arch}`);
		});
}
