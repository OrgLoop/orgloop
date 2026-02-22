/**
 * Multi-module runtime integration tests.
 *
 * Tests the full lifecycle of multiple modules in a single daemon:
 * - Start daemon with one module
 * - Register a second module via control API
 * - Verify both modules are active
 * - Unload one module, verify the other survives
 * - Reload a module
 * - Shut down the daemon
 */

import { createTestEvent, MockActor, MockSource } from '@orgloop/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryBus } from '../bus.js';
import type { ModuleConfig } from '../module-instance.js';
import { Runtime } from '../runtime.js';

function makeModuleConfig(name: string, overrides?: Partial<ModuleConfig>): ModuleConfig {
	return {
		name,
		sources: [
			{
				id: `${name}-source`,
				connector: 'mock',
				config: {},
				poll: { interval: '5m' },
			},
		],
		actors: [{ id: `${name}-actor`, connector: 'mock', config: {} }],
		routes: [
			{
				name: `${name}-route`,
				when: { source: `${name}-source`, events: ['resource.changed'] },
				then: { actor: `${name}-actor` },
			},
		],
		transforms: [],
		loggers: [],
		...overrides,
	};
}

describe('Multi-module runtime', () => {
	let runtime: Runtime;

	afterEach(async () => {
		if (runtime) {
			try {
				await runtime.stop();
			} catch {
				// already stopped
			}
		}
	});

	it('registers second module while first is running', async () => {
		runtime = new Runtime({ bus: new InMemoryBus() });
		await runtime.start();

		// Load first module
		const sourceA = new MockSource('mod-a-source');
		const actorA = new MockActor('mod-a-actor');
		await runtime.loadModule(makeModuleConfig('mod-a'), {
			sources: new Map([['mod-a-source', sourceA]]),
			actors: new Map([['mod-a-actor', actorA]]),
		});

		expect(runtime.listModules()).toHaveLength(1);

		// Load second module
		const sourceB = new MockSource('mod-b-source');
		const actorB = new MockActor('mod-b-actor');
		await runtime.loadModule(makeModuleConfig('mod-b'), {
			sources: new Map([['mod-b-source', sourceB]]),
			actors: new Map([['mod-b-actor', actorB]]),
		});

		expect(runtime.listModules()).toHaveLength(2);

		// Both modules are active
		const statuses = runtime.listModules();
		expect(statuses[0]).toMatchObject({ name: 'mod-a', state: 'active' });
		expect(statuses[1]).toMatchObject({ name: 'mod-b', state: 'active' });
	});

	it('events route correctly to each module independently', async () => {
		runtime = new Runtime({ bus: new InMemoryBus() });
		await runtime.start();

		const actorA = new MockActor('mod-a-actor');
		const actorB = new MockActor('mod-b-actor');

		await runtime.loadModule(makeModuleConfig('mod-a'), {
			sources: new Map([['mod-a-source', new MockSource('mod-a-source')]]),
			actors: new Map([['mod-a-actor', actorA]]),
		});

		await runtime.loadModule(makeModuleConfig('mod-b'), {
			sources: new Map([['mod-b-source', new MockSource('mod-b-source')]]),
			actors: new Map([['mod-b-actor', actorB]]),
		});

		// Event to mod-a
		await runtime.inject(
			createTestEvent({ source: 'mod-a-source', type: 'resource.changed' }),
			'mod-a',
		);

		// Event to mod-b
		await runtime.inject(
			createTestEvent({ source: 'mod-b-source', type: 'resource.changed' }),
			'mod-b',
		);

		expect(actorA.delivered).toHaveLength(1);
		expect(actorB.delivered).toHaveLength(1);
		expect(actorA.delivered[0].event.source).toBe('mod-a-source');
		expect(actorB.delivered[0].event.source).toBe('mod-b-source');
	});

	it('unloading one module does not affect others', async () => {
		runtime = new Runtime({ bus: new InMemoryBus() });
		await runtime.start();

		const sourceA = new MockSource('mod-a-source');
		const actorA = new MockActor('mod-a-actor');
		const sourceB = new MockSource('mod-b-source');
		const actorB = new MockActor('mod-b-actor');

		await runtime.loadModule(makeModuleConfig('mod-a'), {
			sources: new Map([['mod-a-source', sourceA]]),
			actors: new Map([['mod-a-actor', actorA]]),
		});

		await runtime.loadModule(makeModuleConfig('mod-b'), {
			sources: new Map([['mod-b-source', sourceB]]),
			actors: new Map([['mod-b-actor', actorB]]),
		});

		// Unload mod-a
		await runtime.unloadModule('mod-a');

		expect(runtime.listModules()).toHaveLength(1);
		expect(runtime.listModules()[0]).toMatchObject({ name: 'mod-b', state: 'active' });
		expect(sourceA.shutdownCalled).toBe(true);

		// mod-b still works
		await runtime.inject(
			createTestEvent({ source: 'mod-b-source', type: 'resource.changed' }),
			'mod-b',
		);
		expect(actorB.delivered).toHaveLength(1);
	});

	it('supports hot-reload: unload then load same name', async () => {
		runtime = new Runtime({ bus: new InMemoryBus() });
		await runtime.start();

		const sourceA1 = new MockSource('mod-a-source');
		const actorA1 = new MockActor('mod-a-actor');

		await runtime.loadModule(makeModuleConfig('mod-a'), {
			sources: new Map([['mod-a-source', sourceA1]]),
			actors: new Map([['mod-a-actor', actorA1]]),
		});

		// Unload and reload with new instances
		await runtime.unloadModule('mod-a');
		expect(sourceA1.shutdownCalled).toBe(true);

		const sourceA2 = new MockSource('mod-a-source');
		const actorA2 = new MockActor('mod-a-actor');

		await runtime.loadModule(makeModuleConfig('mod-a'), {
			sources: new Map([['mod-a-source', sourceA2]]),
			actors: new Map([['mod-a-actor', actorA2]]),
		});

		// New instance works
		await runtime.inject(
			createTestEvent({ source: 'mod-a-source', type: 'resource.changed' }),
			'mod-a',
		);
		expect(actorA2.delivered).toHaveLength(1);
		expect(actorA1.delivered).toHaveLength(0);
	});

	it('runtime.status() shows all modules', async () => {
		runtime = new Runtime({ bus: new InMemoryBus() });
		await runtime.start();

		await runtime.loadModule(makeModuleConfig('mod-a'), {
			sources: new Map([['mod-a-source', new MockSource('mod-a-source')]]),
			actors: new Map([['mod-a-actor', new MockActor('mod-a-actor')]]),
		});

		await runtime.loadModule(makeModuleConfig('mod-b'), {
			sources: new Map([['mod-b-source', new MockSource('mod-b-source')]]),
			actors: new Map([['mod-b-actor', new MockActor('mod-b-actor')]]),
		});

		const status = runtime.status();
		expect(status.running).toBe(true);
		expect(status.modules).toHaveLength(2);
		expect(status.modules.map((m) => m.name).sort()).toEqual(['mod-a', 'mod-b']);
	});

	it('getModuleStatus() returns individual module status', async () => {
		runtime = new Runtime({ bus: new InMemoryBus() });
		await runtime.start();

		await runtime.loadModule(makeModuleConfig('mod-a'), {
			sources: new Map([['mod-a-source', new MockSource('mod-a-source')]]),
			actors: new Map([['mod-a-actor', new MockActor('mod-a-actor')]]),
		});

		const modStatus = runtime.getModuleStatus('mod-a');
		expect(modStatus).toBeDefined();
		expect(modStatus?.name).toBe('mod-a');
		expect(modStatus?.state).toBe('active');

		const missing = runtime.getModuleStatus('ghost');
		expect(missing).toBeUndefined();
	});

	it('custom control handler is invoked', async () => {
		const port = 10000 + Math.floor(Math.random() * 50000);
		runtime = new Runtime({ bus: new InMemoryBus(), httpPort: port });
		await runtime.start();
		await runtime.startHttpServer();

		let handlerCalled = false;

		runtime.registerControlHandler('test/echo', async (body) => {
			handlerCalled = true;
			return { echo: true, received: body };
		});

		const res = await fetch(`http://127.0.0.1:${port}/control/test/echo`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ hello: 'world' }),
		});

		expect(res.ok).toBe(true);
		const json = (await res.json()) as { echo: boolean; received: { hello: string } };
		expect(json.echo).toBe(true);
		expect(json.received.hello).toBe('world');
		expect(handlerCalled).toBe(true);
	});

	it('survives after removing all modules (runtime stays up)', async () => {
		runtime = new Runtime({ bus: new InMemoryBus() });
		await runtime.start();

		await runtime.loadModule(makeModuleConfig('mod-a'), {
			sources: new Map([['mod-a-source', new MockSource('mod-a-source')]]),
			actors: new Map([['mod-a-actor', new MockActor('mod-a-actor')]]),
		});

		await runtime.unloadModule('mod-a');

		// Runtime is still running
		expect(runtime.status().running).toBe(true);
		expect(runtime.listModules()).toHaveLength(0);

		// Can add a new module after clearing
		await runtime.loadModule(makeModuleConfig('mod-b'), {
			sources: new Map([['mod-b-source', new MockSource('mod-b-source')]]),
			actors: new Map([['mod-b-actor', new MockActor('mod-b-actor')]]),
		});

		expect(runtime.listModules()).toHaveLength(1);
	});

	it('full lifecycle: start → add → add → remove → survive → shutdown', async () => {
		runtime = new Runtime({ bus: new InMemoryBus() });
		await runtime.start();
		expect(runtime.status().running).toBe(true);

		// Add mod-a
		const actorA = new MockActor('mod-a-actor');
		await runtime.loadModule(makeModuleConfig('mod-a'), {
			sources: new Map([['mod-a-source', new MockSource('mod-a-source')]]),
			actors: new Map([['mod-a-actor', actorA]]),
		});
		expect(runtime.listModules()).toHaveLength(1);

		// Add mod-b
		const actorB = new MockActor('mod-b-actor');
		await runtime.loadModule(makeModuleConfig('mod-b'), {
			sources: new Map([['mod-b-source', new MockSource('mod-b-source')]]),
			actors: new Map([['mod-b-actor', actorB]]),
		});
		expect(runtime.listModules()).toHaveLength(2);

		// Remove mod-a
		await runtime.unloadModule('mod-a');
		expect(runtime.listModules()).toHaveLength(1);

		// mod-b survives
		await runtime.inject(
			createTestEvent({ source: 'mod-b-source', type: 'resource.changed' }),
			'mod-b',
		);
		expect(actorB.delivered).toHaveLength(1);

		// Shutdown
		await runtime.stop();
		expect(runtime.status().running).toBe(false);
	});
});
