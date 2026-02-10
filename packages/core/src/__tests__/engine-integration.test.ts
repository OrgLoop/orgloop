import { MockActor, MockLogger, MockSource, MockTransform, createTestEvent } from '@orgloop/sdk';
import type { OrgLoopConfig } from '@orgloop/sdk';
import { describe, expect, it } from 'vitest';
import { OrgLoop } from '../engine.js';

function makeConfig(overrides?: Partial<OrgLoopConfig>): OrgLoopConfig {
	return {
		project: { name: 'test-project' },
		sources: [
			{
				id: 'test-source',
				connector: 'mock',
				config: {},
				poll: { interval: '5m' },
			},
		],
		actors: [
			{
				id: 'test-actor',
				connector: 'mock',
				config: {},
			},
		],
		routes: [
			{
				name: 'test-route',
				when: {
					source: 'test-source',
					events: ['resource.changed'],
				},
				then: {
					actor: 'test-actor',
				},
			},
		],
		transforms: [],
		loggers: [],
		...overrides,
	};
}

describe('OrgLoop engine integration', () => {
	it('initializes sources and actors on start', async () => {
		const source = new MockSource('test-source');
		const actor = new MockActor('test-actor');

		const engine = new OrgLoop(makeConfig(), {
			sources: new Map([['test-source', source]]),
			actors: new Map([['test-actor', actor]]),
		});

		await engine.start();

		expect(source.initialized).toBe(true);
		expect(actor.initialized).toBe(true);

		await engine.stop();
	});

	it('delivers injected events to matching actors', async () => {
		const source = new MockSource('test-source');
		const actor = new MockActor('test-actor');

		const engine = new OrgLoop(makeConfig(), {
			sources: new Map([['test-source', source]]),
			actors: new Map([['test-actor', actor]]),
		});

		await engine.start();

		const event = createTestEvent({
			source: 'test-source',
			type: 'resource.changed',
		});

		await engine.inject(event);

		expect(actor.delivered).toHaveLength(1);
		expect(actor.delivered[0].event.source).toBe('test-source');

		await engine.stop();
	});

	it('does not deliver events with no matching route', async () => {
		const source = new MockSource('test-source');
		const actor = new MockActor('test-actor');

		const engine = new OrgLoop(makeConfig(), {
			sources: new Map([['test-source', source]]),
			actors: new Map([['test-actor', actor]]),
		});

		await engine.start();

		// Event from a source that doesn't match any route
		const event = createTestEvent({
			source: 'unknown-source',
			type: 'resource.changed',
		});

		await engine.inject(event);

		expect(actor.delivered).toHaveLength(0);

		await engine.stop();
	});

	it('reports status with connector info', async () => {
		const source = new MockSource('test-source');
		const actor = new MockActor('test-actor');

		const engine = new OrgLoop(makeConfig(), {
			sources: new Map([['test-source', source]]),
			actors: new Map([['test-actor', actor]]),
		});

		// Before start
		const preStatus = engine.status();
		expect(preStatus.running).toBe(false);
		expect(preStatus.sources).toContain('test-source');
		expect(preStatus.actors).toContain('test-actor');
		expect(preStatus.routes).toBe(1);

		await engine.start();

		const runningStatus = engine.status();
		expect(runningStatus.running).toBe(true);
		expect(runningStatus.uptime_ms).toBeGreaterThanOrEqual(0);

		await engine.stop();
	});

	it('shuts down sources and actors on stop', async () => {
		const source = new MockSource('test-source');
		const actor = new MockActor('test-actor');

		const engine = new OrgLoop(makeConfig(), {
			sources: new Map([['test-source', source]]),
			actors: new Map([['test-actor', actor]]),
		});

		await engine.start();
		await engine.stop();

		expect(source.shutdownCalled).toBe(true);
		expect(actor.shutdownCalled).toBe(true);
	});

	it('initializes and invokes loggers on events', async () => {
		const source = new MockSource('test-source');
		const actor = new MockActor('test-actor');
		const logger = new MockLogger('test-logger');

		const config = makeConfig({
			loggers: [{ name: 'test-logger', type: 'mock', config: {} }],
		});

		const engine = new OrgLoop(config, {
			sources: new Map([['test-source', source]]),
			actors: new Map([['test-actor', actor]]),
			loggers: new Map([['test-logger', logger]]),
		});

		await engine.start();
		expect(logger.initialized).toBe(true);

		const event = createTestEvent({
			source: 'test-source',
			type: 'resource.changed',
		});
		await engine.inject(event);

		// Logger should have received log entries (system.start + event processing)
		expect(logger.entries.length).toBeGreaterThan(0);

		await engine.stop();
		expect(logger.shutdownCalled).toBe(true);
	});

	it('initializes and runs package transforms in pipeline', async () => {
		const source = new MockSource('test-source');
		const actor = new MockActor('test-actor');
		const transform = new MockTransform('test-transform');

		const config = makeConfig({
			transforms: [{ name: 'test-transform', type: 'package' }],
			routes: [
				{
					name: 'test-route',
					when: { source: 'test-source', events: ['resource.changed'] },
					transforms: [{ ref: 'test-transform' }],
					then: { actor: 'test-actor' },
				},
			],
		});

		const engine = new OrgLoop(config, {
			sources: new Map([['test-source', source]]),
			actors: new Map([['test-actor', actor]]),
			transforms: new Map([['test-transform', transform]]),
		});

		await engine.start();
		expect(transform.initialized).toBe(true);

		const event = createTestEvent({
			source: 'test-source',
			type: 'resource.changed',
		});
		await engine.inject(event);

		// Transform should have processed the event
		expect(transform.processed).toHaveLength(1);
		// Actor should still receive it (transform passes through)
		expect(actor.delivered).toHaveLength(1);

		await engine.stop();
	});
});
