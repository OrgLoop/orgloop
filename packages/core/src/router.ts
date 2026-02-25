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

/**
 * Check if a filter entry matches.
 *
 * Supports array-contains via `[]` notation in the path:
 *   "payload.labels[].name": "niko-authored"
 * means "any element in payload.labels has .name === 'niko-authored'".
 *
 * Without `[]`, uses strict equality on the resolved value.
 */
function matchesFilterEntry(event: OrgLoopEvent, path: string, expected: unknown): boolean {
	const bracketIdx = path.indexOf('[]');
	if (bracketIdx === -1) {
		// Simple dot-path: strict equality
		return getNestedValue(event, path) === expected;
	}

	// Array-contains: split at [], resolve the array, match the remainder
	const arrayPath = path.slice(0, bracketIdx);
	const remainder = path.slice(bracketIdx + 2);
	// remainder starts with '.' if there's a sub-field, e.g. "[].name" → ".name"
	const subPath = remainder.startsWith('.') ? remainder.slice(1) : remainder;

	const arr = getNestedValue(event, arrayPath);
	if (!Array.isArray(arr)) return false;

	if (!subPath) {
		// "field[]" with no sub-path: check if expected is an element of the array
		return arr.some((item) => item === expected);
	}

	// "field[].sub.path": check if any element's sub-path matches
	return arr.some((item) => {
		if (item === null || item === undefined || typeof item !== 'object') return false;
		const segments = subPath.split('.');
		let current: unknown = item;
		for (const seg of segments) {
			if (current === null || current === undefined || typeof current !== 'object') return false;
			current = (current as Record<string, unknown>)[seg];
		}
		return current === expected;
	});
}

function matchesFilter(event: OrgLoopEvent, filter: Record<string, unknown>): boolean {
	for (const [path, expected] of Object.entries(filter)) {
		if (!matchesFilterEntry(event, path, expected)) return false;
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
