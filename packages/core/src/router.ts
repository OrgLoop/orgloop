/**
 * Route matching + dispatch.
 *
 * Matches events against routes using `when` criteria (source, events, filter).
 * Supports multi-route matching: one event can match many routes.
 */

import type { OrgLoopEvent, RouteDefinition } from '@orgloop/sdk';

// ─── Dot-path field access ────────────────────────────────────────────────────

function getNestedValue(obj: unknown, path: string): unknown {
	const parts = path.split('.');
	let current: unknown = obj;
	for (const part of parts) {
		if (current === null || current === undefined || typeof current !== 'object') {
			return undefined;
		}
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

// ─── Filter matching ──────────────────────────────────────────────────────────

function matchesFilter(event: OrgLoopEvent, filter: Record<string, unknown>): boolean {
	for (const [path, expected] of Object.entries(filter)) {
		const actual = getNestedValue(event, path);
		if (actual !== expected) return false;
	}
	return true;
}

// ─── Route matching ───────────────────────────────────────────────────────────

function matchesRoute(event: OrgLoopEvent, route: RouteDefinition): boolean {
	const { when } = route;

	// Match source
	if (when.source !== event.source) return false;

	// Match event type
	if (!when.events.includes(event.type)) return false;

	// Match filter (optional)
	if (when.filter && !matchesFilter(event, when.filter)) return false;

	return true;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface MatchedRoute {
	route: RouteDefinition;
	event: OrgLoopEvent;
}

/**
 * Find all routes that match a given event.
 * Returns all matched routes (multi-match supported).
 */
export function matchRoutes(event: OrgLoopEvent, routes: RouteDefinition[]): MatchedRoute[] {
	const matched: MatchedRoute[] = [];
	for (const route of routes) {
		if (matchesRoute(event, route)) {
			matched.push({ route, event });
		}
	}
	return matched;
}
