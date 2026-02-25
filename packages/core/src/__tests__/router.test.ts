import type { RouteDefinition } from '@orgloop/sdk';
import { createTestEvent } from '@orgloop/sdk';
import { describe, expect, it } from 'vitest';
import { matchRoutes } from '../router.js';

function makeRoute(overrides: Partial<RouteDefinition> & { name: string }): RouteDefinition {
	return {
		name: overrides.name,
		when: overrides.when ?? {
			source: 'test-source',
			events: ['resource.changed'],
		},
		then: overrides.then ?? {
			actor: 'test-actor',
		},
		...overrides,
	};
}

describe('matchRoutes', () => {
	it('matches event by source and type', () => {
		const routes = [
			makeRoute({
				name: 'r1',
				when: { source: 'github', events: ['resource.changed'] },
			}),
		];
		const event = createTestEvent({ source: 'github', type: 'resource.changed' });
		const matched = matchRoutes(event, routes);
		expect(matched).toHaveLength(1);
		expect(matched[0].route.name).toBe('r1');
	});

	it('does not match wrong source', () => {
		const routes = [
			makeRoute({
				name: 'r1',
				when: { source: 'github', events: ['resource.changed'] },
			}),
		];
		const event = createTestEvent({ source: 'linear', type: 'resource.changed' });
		expect(matchRoutes(event, routes)).toHaveLength(0);
	});

	it('does not match wrong event type', () => {
		const routes = [
			makeRoute({
				name: 'r1',
				when: { source: 'github', events: ['actor.stopped'] },
			}),
		];
		const event = createTestEvent({ source: 'github', type: 'resource.changed' });
		expect(matchRoutes(event, routes)).toHaveLength(0);
	});

	it('supports multi-route matching', () => {
		const routes = [
			makeRoute({
				name: 'r1',
				when: { source: 'github', events: ['resource.changed'] },
			}),
			makeRoute({
				name: 'r2',
				when: { source: 'github', events: ['resource.changed'] },
			}),
		];
		const event = createTestEvent({ source: 'github', type: 'resource.changed' });
		expect(matchRoutes(event, routes)).toHaveLength(2);
	});

	it('supports filter matching with dot-path', () => {
		const routes = [
			makeRoute({
				name: 'r1',
				when: {
					source: 'github',
					events: ['resource.changed'],
					filter: { 'provenance.platform_event': 'pull_request.review_submitted' },
				},
			}),
		];
		const event = createTestEvent({
			source: 'github',
			type: 'resource.changed',
			provenance: {
				platform: 'github',
				platform_event: 'pull_request.review_submitted',
			},
		});
		expect(matchRoutes(event, routes)).toHaveLength(1);
	});

	it('filter mismatch does not match', () => {
		const routes = [
			makeRoute({
				name: 'r1',
				when: {
					source: 'github',
					events: ['resource.changed'],
					filter: { 'provenance.platform_event': 'pull_request.closed' },
				},
			}),
		];
		const event = createTestEvent({
			source: 'github',
			type: 'resource.changed',
			provenance: {
				platform: 'github',
				platform_event: 'pull_request.review_submitted',
			},
		});
		expect(matchRoutes(event, routes)).toHaveLength(0);
	});

	it('returns empty for no matching routes', () => {
		const event = createTestEvent();
		expect(matchRoutes(event, [])).toHaveLength(0);
	});

	it('supports array-contains filter with [] notation', () => {
		const routes = [
			makeRoute({
				name: 'r1',
				when: {
					source: 'github',
					events: ['resource.changed'],
					filter: { 'payload.labels[].name': 'niko-authored' },
				},
			}),
		];

		// Event with matching label
		const matchEvent = createTestEvent({
			source: 'github',
			type: 'resource.changed',
			payload: {
				labels: [{ name: 'niko-authored' }, { name: 'bug' }],
			},
		});
		expect(matchRoutes(matchEvent, routes)).toHaveLength(1);

		// Event without matching label
		const noMatchEvent = createTestEvent({
			source: 'github',
			type: 'resource.changed',
			payload: {
				labels: [{ name: 'bug' }, { name: 'enhancement' }],
			},
		});
		expect(matchRoutes(noMatchEvent, routes)).toHaveLength(0);

		// Event with no labels
		const noLabelsEvent = createTestEvent({
			source: 'github',
			type: 'resource.changed',
			payload: {},
		});
		expect(matchRoutes(noLabelsEvent, routes)).toHaveLength(0);
	});

	it('array-contains works with empty array', () => {
		const routes = [
			makeRoute({
				name: 'r1',
				when: {
					source: 'github',
					events: ['resource.changed'],
					filter: { 'payload.labels[].name': 'niko-authored' },
				},
			}),
		];
		const event = createTestEvent({
			source: 'github',
			type: 'resource.changed',
			payload: { labels: [] },
		});
		expect(matchRoutes(event, routes)).toHaveLength(0);
	});

	it('array-contains works for simple value arrays (no sub-path)', () => {
		const routes = [
			makeRoute({
				name: 'r1',
				when: {
					source: 'github',
					events: ['resource.changed'],
					filter: { 'payload.tags[]': 'urgent' },
				},
			}),
		];
		const event = createTestEvent({
			source: 'github',
			type: 'resource.changed',
			payload: { tags: ['urgent', 'bugfix'] },
		});
		expect(matchRoutes(event, routes)).toHaveLength(1);
	});

	it('event type matching supports multiple types in route', () => {
		const routes = [
			makeRoute({
				name: 'r1',
				when: {
					source: 'github',
					events: ['resource.changed', 'actor.stopped'],
				},
			}),
		];
		const event1 = createTestEvent({ source: 'github', type: 'resource.changed' });
		const event2 = createTestEvent({ source: 'github', type: 'actor.stopped' });
		expect(matchRoutes(event1, routes)).toHaveLength(1);
		expect(matchRoutes(event2, routes)).toHaveLength(1);
	});
});
