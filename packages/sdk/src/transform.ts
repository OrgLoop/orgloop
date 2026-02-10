/**
 * Transform interface — the contract for event pipeline steps.
 *
 * Transforms modify, filter, or enrich events as they flow through routes.
 * Two modes: script transforms (shell scripts) and package transforms (TypeScript).
 */

import type { OrgLoopEvent } from './types.js';

/** Context provided to transforms during execution */
export interface TransformContext {
	/** Source connector ID */
	source: string;
	/** Target actor ID */
	target: string;
	/** Event type string */
	eventType: string;
	/** Route name */
	routeName: string;
}

/**
 * Transform interface (package transforms).
 *
 * Implement this for complex/reusable transforms.
 * For simple filtering, prefer script transforms (shell scripts).
 */
export interface Transform {
	/** Unique transform ID */
	readonly id: string;

	/** Initialize with config */
	init(config: Record<string, unknown>): Promise<void>;

	/**
	 * Process an event.
	 * Return the (optionally modified) event to continue.
	 * Return null to filter/drop the event.
	 */
	execute(event: OrgLoopEvent, context: TransformContext): Promise<OrgLoopEvent | null>;

	/** Clean shutdown */
	shutdown(): Promise<void>;
}

/**
 * Transform registration — what a transform package exports.
 */
export interface TransformRegistration {
	/** Unique transform ID */
	id: string;
	/** Transform class */
	transform: new () => Transform;
	/** JSON Schema for config validation */
	configSchema?: Record<string, unknown>;
}
