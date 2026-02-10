/**
 * Event builder and validators — helpers for creating and validating OrgLoop events.
 */

import { randomUUID } from 'node:crypto';
import type { EventProvenance, OrgLoopEvent, OrgLoopEventType } from './types.js';

/** Valid OaC event types */
const VALID_EVENT_TYPES: Set<string> = new Set([
	'resource.changed',
	'actor.stopped',
	'message.received',
]);

/**
 * Generate a unique event ID with the evt_ prefix.
 * Uses UUID v4 for uniqueness.
 */
export function generateEventId(): string {
	return `evt_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
}

/**
 * Generate a trace ID with the trc_ prefix.
 */
export function generateTraceId(): string {
	return `trc_${randomUUID().replace(/-/g, '').substring(0, 16)}`;
}

/** Options for building an event */
export interface BuildEventOptions {
	source: string;
	type: OrgLoopEventType;
	provenance: EventProvenance;
	payload?: Record<string, unknown>;
	id?: string;
	timestamp?: string;
	trace_id?: string;
}

/**
 * Build a well-formed OrgLoop event.
 * Fills in defaults for id, timestamp, and trace_id.
 */
export function buildEvent(options: BuildEventOptions): OrgLoopEvent {
	return {
		id: options.id ?? generateEventId(),
		timestamp: options.timestamp ?? new Date().toISOString(),
		source: options.source,
		type: options.type,
		provenance: options.provenance,
		payload: options.payload ?? {},
		trace_id: options.trace_id ?? generateTraceId(),
	};
}

/** Validation error */
export interface ValidationError {
	field: string;
	message: string;
}

/**
 * Validate an OrgLoop event.
 * Returns an array of validation errors (empty if valid).
 */
export function validateEvent(event: unknown): ValidationError[] {
	const errors: ValidationError[] = [];

	if (!event || typeof event !== 'object') {
		errors.push({ field: '', message: 'Event must be a non-null object' });
		return errors;
	}

	const e = event as Record<string, unknown>;

	// Required fields
	if (typeof e.id !== 'string' || !e.id.startsWith('evt_')) {
		errors.push({ field: 'id', message: 'id must be a string starting with "evt_"' });
	}
	if (typeof e.timestamp !== 'string') {
		errors.push({ field: 'timestamp', message: 'timestamp must be an ISO 8601 string' });
	}
	if (typeof e.source !== 'string' || e.source.length === 0) {
		errors.push({ field: 'source', message: 'source must be a non-empty string' });
	}
	if (typeof e.type !== 'string' || !VALID_EVENT_TYPES.has(e.type)) {
		errors.push({
			field: 'type',
			message: `type must be one of: ${[...VALID_EVENT_TYPES].join(', ')}`,
		});
	}

	// Provenance
	if (!e.provenance || typeof e.provenance !== 'object') {
		errors.push({ field: 'provenance', message: 'provenance must be an object' });
	} else {
		const prov = e.provenance as Record<string, unknown>;
		if (typeof prov.platform !== 'string') {
			errors.push({
				field: 'provenance.platform',
				message: 'provenance.platform must be a string',
			});
		}
	}

	return errors;
}

/**
 * Check if a value is a valid OrgLoop event (type guard).
 */
export function isOrgLoopEvent(value: unknown): value is OrgLoopEvent {
	return validateEvent(value).length === 0;
}
