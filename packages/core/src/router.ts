/**
 * Route matching + dispatch.
 *
 * Matches events against routes using `when` criteria (source, events, filter).
 * Supports multi-route matching: one event can match many routes.
 */

import type { OrgLoopEvent, RouteDefinition } from '@orgloop/sdk';

// ─── Dot-path field access ────────────────────────────────────────────────────

export function getNestedValue(obj: unknown, path: string): unknown {
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

// ─── Config interpolation ────────────────────────────────────────────────────

const TEMPLATE_RE = /\{\{(.+?)\}\}/g;

/**
 * Interpolate {{dot.path}} templates in a config object using event data.
 * Static values (no {{ }}) pass through unchanged. Missing fields resolve to ''.
 */
export function interpolateConfig(
	config: Record<string, unknown>,
	event: OrgLoopEvent,
): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(config)) {
		if (typeof value === 'string' && TEMPLATE_RE.test(value)) {
			// Reset lastIndex since we use .test() then .replace() on the same regex
			TEMPLATE_RE.lastIndex = 0;
			result[key] = value.replace(TEMPLATE_RE, (_, path: string) => {
				const resolved = getNestedValue(event, path.trim());
				return resolved != null ? String(resolved) : '';
			});
		} else {
			result[key] = value;
		}
	}
	return result;
}
