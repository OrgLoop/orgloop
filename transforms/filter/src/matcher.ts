/**
 * Dot-path field matching logic for the filter transform.
 *
 * Supports nested field access via dot notation (e.g., "provenance.author_type")
 * and pattern matching against values.
 */

/**
 * Get a value from a nested object using a dot-separated path.
 * Returns undefined if any segment is missing.
 */
export function getByPath(obj: unknown, path: string): unknown {
	const segments = path.split('.');
	let current: unknown = obj;
	for (const segment of segments) {
		if (current === null || current === undefined || typeof current !== 'object') {
			return undefined;
		}
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

/**
 * Check if a value matches a pattern.
 * - Strings: exact match
 * - Numbers/booleans: strict equality
 * - Arrays: value must match any element in the array
 * - RegExp-like strings (/pattern/flags): regex test
 * - null: matches null or undefined
 */
export function matchesValue(actual: unknown, pattern: unknown): boolean {
	if (pattern === null || pattern === undefined) {
		return actual === null || actual === undefined;
	}

	if (Array.isArray(pattern)) {
		return pattern.some((p) => matchesValue(actual, p));
	}

	if (typeof pattern === 'string' && pattern.startsWith('/')) {
		const lastSlash = pattern.lastIndexOf('/');
		if (lastSlash > 0) {
			const regexBody = pattern.slice(1, lastSlash);
			const flags = pattern.slice(lastSlash + 1);
			try {
				const regex = new RegExp(regexBody, flags);
				return regex.test(String(actual));
			} catch {
				// Invalid regex, fall through to exact match
			}
		}
	}

	return actual === pattern;
}

/**
 * Check if an event matches all criteria in a match object.
 * Every field in `criteria` must match the corresponding event field.
 */
export function matchesAll(
	event: Record<string, unknown>,
	criteria: Record<string, unknown>,
): boolean {
	for (const [path, pattern] of Object.entries(criteria)) {
		const actual = getByPath(event, path);
		if (!matchesValue(actual, pattern)) {
			return false;
		}
	}
	return true;
}

/**
 * Check if an event matches any criterion in an exclude object.
 * If any field matches, the event should be excluded.
 */
export function matchesAny(
	event: Record<string, unknown>,
	criteria: Record<string, unknown>,
): boolean {
	for (const [path, pattern] of Object.entries(criteria)) {
		const actual = getByPath(event, path);
		if (matchesValue(actual, pattern)) {
			return true;
		}
	}
	return false;
}
