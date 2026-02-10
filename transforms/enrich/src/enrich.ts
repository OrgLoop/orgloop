/**
 * Enrich transform — add, copy, and compute fields on events.
 *
 * Three operations:
 * - set:     Static key-value pairs added to event (dot-path → value)
 * - copy:    Copy a field from one dot-path to another
 * - compute: Simple boolean expression evaluated against event fields
 */

import type { OrgLoopEvent, Transform, TransformContext } from '@orgloop/sdk';

interface EnrichConfig {
	set?: Record<string, unknown>;
	copy?: Record<string, string>;
	compute?: Record<string, string>;
}

/**
 * Get a value from a nested object using a dot-separated path.
 * Returns undefined for missing paths without throwing.
 */
function getByPath(obj: unknown, path: string): unknown {
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
 * Set a value on a nested object using a dot-separated path.
 * Creates intermediate objects as needed.
 */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
	const segments = path.split('.');
	let current: Record<string, unknown> = obj;
	for (let i = 0; i < segments.length - 1; i++) {
		const segment = segments[i];
		const next = current[segment];
		if (next === null || next === undefined || typeof next !== 'object') {
			current[segment] = {};
		}
		current = current[segment] as Record<string, unknown>;
	}
	current[segments[segments.length - 1]] = value;
}

/**
 * Parse and evaluate a simple comparison expression against an event.
 *
 * Supported formats:
 *   field === 'value'   (string equality)
 *   field !== 'value'   (string inequality)
 *   field === value      (unquoted — tries numeric then string)
 *   field !== value
 *   field > N            (numeric comparison)
 *   field < N
 *   field >= N
 *   field <= N
 *
 * No eval() — just string parsing.
 */
function evaluateExpression(expression: string, event: unknown): unknown {
	const trimmed = expression.trim();

	// Match: field operator value
	// Operators: ===, !==, >=, <=, >, <
	const match = trimmed.match(/^([a-zA-Z_][\w.]*)\s*(===|!==|>=|<=|>|<)\s*(.+)$/);
	if (!match) {
		return undefined;
	}

	const [, fieldPath, operator, rawValue] = match;
	const fieldValue = getByPath(event, fieldPath);

	// Parse the comparison value
	let compareValue: string | number;
	const trimmedValue = rawValue.trim();

	// String literal: 'value' or "value"
	const stringMatch = trimmedValue.match(/^(['"])(.*)(\1)$/);
	if (stringMatch) {
		compareValue = stringMatch[2];
	} else {
		// Try numeric
		const num = Number(trimmedValue);
		if (!Number.isNaN(num)) {
			compareValue = num;
		} else {
			compareValue = trimmedValue;
		}
	}

	switch (operator) {
		case '===':
			return fieldValue === compareValue || String(fieldValue) === String(compareValue);
		case '!==':
			return fieldValue !== compareValue && String(fieldValue) !== String(compareValue);
		case '>':
			return typeof fieldValue === 'number' && typeof compareValue === 'number'
				? fieldValue > compareValue
				: false;
		case '<':
			return typeof fieldValue === 'number' && typeof compareValue === 'number'
				? fieldValue < compareValue
				: false;
		case '>=':
			return typeof fieldValue === 'number' && typeof compareValue === 'number'
				? fieldValue >= compareValue
				: false;
		case '<=':
			return typeof fieldValue === 'number' && typeof compareValue === 'number'
				? fieldValue <= compareValue
				: false;
		default:
			return undefined;
	}
}

export class EnrichTransform implements Transform {
	readonly id = 'enrich';
	private config: EnrichConfig = {};

	async init(config: Record<string, unknown>): Promise<void> {
		const c = config as unknown as Partial<EnrichConfig>;
		this.config = {
			set: c.set,
			copy: c.copy,
			compute: c.compute,
		};
	}

	async execute(event: OrgLoopEvent, _context: TransformContext): Promise<OrgLoopEvent | null> {
		// Shallow clone to avoid mutating the input
		const result = { ...event, payload: { ...event.payload } } as OrgLoopEvent;
		const resultObj = result as unknown as Record<string, unknown>;

		// 1. Static field setting
		if (this.config.set) {
			for (const [path, value] of Object.entries(this.config.set)) {
				setByPath(resultObj, path, value);
			}
		}

		// 2. Field copying
		if (this.config.copy) {
			for (const [targetPath, sourcePath] of Object.entries(this.config.copy)) {
				const value = getByPath(resultObj, sourcePath);
				if (value !== undefined) {
					setByPath(resultObj, targetPath, value);
				}
			}
		}

		// 3. Computed fields
		if (this.config.compute) {
			for (const [targetPath, expression] of Object.entries(this.config.compute)) {
				const value = evaluateExpression(expression, resultObj);
				if (value !== undefined) {
					setByPath(resultObj, targetPath, value);
				}
			}
		}

		return result;
	}

	async shutdown(): Promise<void> {
		// No resources to clean up
	}
}
