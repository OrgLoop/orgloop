/**
 * Tests for the module registry — persistent tracking of modules loaded
 * into the running daemon.
 */

import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	clearModulesState,
	deriveModuleName,
	findModuleByDir,
	findModuleByName,
	readModulesState,
	registerModule,
	unregisterModule,
	writeModulesState,
} from '../module-registry.js';

describe('module-registry', () => {
	let testDir: string;
	let originalHome: string;

	beforeEach(async () => {
		testDir = join(
			tmpdir(),
			`orgloop-modreg-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		);
		await mkdir(join(testDir, '.orgloop'), { recursive: true });
		originalHome = process.env.HOME ?? '';
		process.env.HOME = testDir;
	});

	afterEach(async () => {
		process.env.HOME = originalHome;
		await rm(testDir, { recursive: true, force: true });
	});

	it('reads empty state when no file exists', async () => {
		const state = await readModulesState();
		expect(state).toEqual({ modules: [] });
	});

	it('writes and reads module state', async () => {
		const state = {
			modules: [
				{
					name: 'test-mod',
					sourceDir: '/tmp/test-project',
					configPath: '/tmp/test-project/orgloop.yaml',
					loadedAt: '2026-01-01T00:00:00.000Z',
				},
			],
		};
		await writeModulesState(state);
		const read = await readModulesState();
		expect(read).toEqual(state);
	});

	it('registers a module', async () => {
		await registerModule({
			name: 'mod-a',
			sourceDir: '/projects/a',
			configPath: '/projects/a/orgloop.yaml',
			loadedAt: '2026-01-01T00:00:00.000Z',
		});

		const state = await readModulesState();
		expect(state.modules).toHaveLength(1);
		expect(state.modules[0].name).toBe('mod-a');
	});

	it('replaces module with same name on re-register', async () => {
		await registerModule({
			name: 'mod-a',
			sourceDir: '/projects/a',
			configPath: '/projects/a/orgloop.yaml',
			loadedAt: '2026-01-01T00:00:00.000Z',
		});
		await registerModule({
			name: 'mod-a',
			sourceDir: '/projects/a-new',
			configPath: '/projects/a-new/orgloop.yaml',
			loadedAt: '2026-01-02T00:00:00.000Z',
		});

		const state = await readModulesState();
		expect(state.modules).toHaveLength(1);
		expect(state.modules[0].sourceDir).toBe('/projects/a-new');
	});

	it('replaces module with same sourceDir on re-register', async () => {
		await registerModule({
			name: 'mod-a',
			sourceDir: '/projects/a',
			configPath: '/projects/a/orgloop.yaml',
			loadedAt: '2026-01-01T00:00:00.000Z',
		});
		await registerModule({
			name: 'mod-a-renamed',
			sourceDir: '/projects/a',
			configPath: '/projects/a/orgloop.yaml',
			loadedAt: '2026-01-02T00:00:00.000Z',
		});

		const state = await readModulesState();
		expect(state.modules).toHaveLength(1);
		expect(state.modules[0].name).toBe('mod-a-renamed');
	});

	it('registers multiple modules', async () => {
		await registerModule({
			name: 'mod-a',
			sourceDir: '/projects/a',
			configPath: '/projects/a/orgloop.yaml',
			loadedAt: '2026-01-01T00:00:00.000Z',
		});
		await registerModule({
			name: 'mod-b',
			sourceDir: '/projects/b',
			configPath: '/projects/b/orgloop.yaml',
			loadedAt: '2026-01-01T00:00:00.000Z',
		});

		const state = await readModulesState();
		expect(state.modules).toHaveLength(2);
	});

	it('unregisters a module by name', async () => {
		await registerModule({
			name: 'mod-a',
			sourceDir: '/projects/a',
			configPath: '/projects/a/orgloop.yaml',
			loadedAt: '2026-01-01T00:00:00.000Z',
		});
		await registerModule({
			name: 'mod-b',
			sourceDir: '/projects/b',
			configPath: '/projects/b/orgloop.yaml',
			loadedAt: '2026-01-01T00:00:00.000Z',
		});

		await unregisterModule('mod-a');

		const state = await readModulesState();
		expect(state.modules).toHaveLength(1);
		expect(state.modules[0].name).toBe('mod-b');
	});

	it('finds module by directory', async () => {
		await registerModule({
			name: 'mod-a',
			sourceDir: '/projects/a',
			configPath: '/projects/a/orgloop.yaml',
			loadedAt: '2026-01-01T00:00:00.000Z',
		});

		const found = await findModuleByDir('/projects/a');
		expect(found?.name).toBe('mod-a');

		const notFound = await findModuleByDir('/projects/z');
		expect(notFound).toBeUndefined();
	});

	it('finds module by name', async () => {
		await registerModule({
			name: 'mod-a',
			sourceDir: '/projects/a',
			configPath: '/projects/a/orgloop.yaml',
			loadedAt: '2026-01-01T00:00:00.000Z',
		});

		const found = await findModuleByName('mod-a');
		expect(found?.sourceDir).toBe('/projects/a');

		const notFound = await findModuleByName('ghost');
		expect(notFound).toBeUndefined();
	});

	it('clears all modules', async () => {
		await registerModule({
			name: 'mod-a',
			sourceDir: '/projects/a',
			configPath: '/projects/a/orgloop.yaml',
			loadedAt: '2026-01-01T00:00:00.000Z',
		});
		await registerModule({
			name: 'mod-b',
			sourceDir: '/projects/b',
			configPath: '/projects/b/orgloop.yaml',
			loadedAt: '2026-01-01T00:00:00.000Z',
		});

		await clearModulesState();

		const state = await readModulesState();
		expect(state.modules).toHaveLength(0);
	});

	it('derives module name from config name', () => {
		expect(deriveModuleName('my-project')).toBe('my-project');
	});

	it('derives module name from directory when no config name', () => {
		expect(deriveModuleName(undefined, '/path/to/my-project')).toBe('my-project');
	});
});
