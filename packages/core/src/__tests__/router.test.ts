import type { RouteDefinition } from '@orgloop/sdk';
import { createTestEvent } from '@orgloop/sdk';
import { describe, expect, it } from 'vitest';
import { interpolateConfig, matchRoutes } from '../router.js';

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

describe('interpolateConfig', () => {
	it('replaces {{dot.path}} templates with event payload values', () => {
		const event = createTestEvent({
			payload: { pull_request: { number: 9170 } },
		});
		const config = { session_key: 'orgloop:github:pr:{{payload.pull_request.number}}' };
		const result = interpolateConfig(config, event);
		expect(result.session_key).toBe('orgloop:github:pr:9170');
	});

	it('passes static values through unchanged', () => {
		const event = createTestEvent();
		const config = { session_key: 'static-key', timeout: 5000 };
		const result = interpolateConfig(config, event);
		expect(result.session_key).toBe('static-key');
		expect(result.timeout).toBe(5000);
	});

	it('replaces missing fields with empty string', () => {
		const event = createTestEvent({ payload: {} });
		const config = { session_key: 'prefix:{{payload.missing.field}}:suffix' };
		const result = interpolateConfig(config, event);
		expect(result.session_key).toBe('prefix::suffix');
	});

	it('handles nested dot paths', () => {
		const event = createTestEvent({
			payload: { repo: { owner: { login: 'acme' } } },
		});
		const config = { key: '{{payload.repo.owner.login}}' };
		const result = interpolateConfig(config, event);
		expect(result.key).toBe('acme');
	});

	it('handles multiple templates in one string', () => {
		const event = createTestEvent({
			source: 'github',
			payload: { repo: 'orgloop', pr: 42 },
		});
		const config = { key: '{{source}}:{{payload.repo}}:{{payload.pr}}' };
		const result = interpolateConfig(config, event);
		expect(result.key).toBe('github:orgloop:42');
	});

	it('preserves non-string values', () => {
		const event = createTestEvent();
		const config = { count: 3, enabled: true, tags: ['a', 'b'] };
		const result = interpolateConfig(config, event);
		expect(result.count).toBe(3);
		expect(result.enabled).toBe(true);
		expect(result.tags).toEqual(['a', 'b']);
	});
});
