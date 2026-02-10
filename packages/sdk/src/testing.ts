/**
 * Test harness for OrgLoop plugin authors.
 *
 * Provides mock implementations and helpers for testing connectors,
 * transforms, and loggers in isolation.
 */

import type { ActorConnector, DeliveryResult, PollResult, SourceConnector } from './connector.js';
import { type BuildEventOptions, buildEvent } from './event.js';
import type { Logger } from './logger.js';
import type { Transform, TransformContext } from './transform.js';
import type {
	ActorConfig,
	LogEntry,
	OrgLoopEvent,
	RouteDeliveryConfig,
	SourceConfig,
} from './types.js';

// ─── Mock Source ──────────────────────────────────────────────────────────────

/**
 * Mock source connector for testing.
 * Returns pre-configured events on poll().
 */
export class MockSource implements SourceConnector {
	readonly id: string;
	private events: OrgLoopEvent[] = [];
	private pollCount = 0;
	initialized = false;
	shutdownCalled = false;

	constructor(id = 'mock-source') {
		this.id = id;
	}

	async init(_config: SourceConfig): Promise<void> {
		this.initialized = true;
	}

	/** Add events that will be returned on the next poll */
	addEvents(...events: OrgLoopEvent[]): void {
		this.events.push(...events);
	}

	async poll(_checkpoint: string | null): Promise<PollResult> {
		this.pollCount++;
		const events = [...this.events];
		this.events = [];
		return {
			events,
			checkpoint: `mock-checkpoint-${this.pollCount}`,
		};
	}

	async shutdown(): Promise<void> {
		this.shutdownCalled = true;
	}

	get totalPolls(): number {
		return this.pollCount;
	}
}

// ─── Mock Actor ───────────────────────────────────────────────────────────────

/**
 * Mock actor connector for testing.
 * Records all delivered events for assertion.
 */
export class MockActor implements ActorConnector {
	readonly id: string;
	readonly delivered: Array<{ event: OrgLoopEvent; config: RouteDeliveryConfig }> = [];
	private shouldReject = false;
	private shouldError = false;
	initialized = false;
	shutdownCalled = false;

	constructor(id = 'mock-actor') {
		this.id = id;
	}

	async init(_config: ActorConfig): Promise<void> {
		this.initialized = true;
	}

	/** Make subsequent deliveries reject */
	setReject(reject: boolean): void {
		this.shouldReject = reject;
	}

	/** Make subsequent deliveries error */
	setError(error: boolean): void {
		this.shouldError = error;
	}

	async deliver(event: OrgLoopEvent, routeConfig: RouteDeliveryConfig): Promise<DeliveryResult> {
		this.delivered.push({ event, config: routeConfig });

		if (this.shouldError) {
			return { status: 'error', error: new Error('Mock delivery error') };
		}
		if (this.shouldReject) {
			return { status: 'rejected' };
		}
		return { status: 'delivered' };
	}

	async shutdown(): Promise<void> {
		this.shutdownCalled = true;
	}
}

// ─── Mock Transform ───────────────────────────────────────────────────────────

/**
 * Mock transform for testing.
 * Can be configured to pass, drop, or modify events.
 */
export class MockTransform implements Transform {
	readonly id: string;
	readonly processed: Array<{ event: OrgLoopEvent; context: TransformContext }> = [];
	private dropAll = false;
	private modifier?: (event: OrgLoopEvent) => OrgLoopEvent;
	initialized = false;
	shutdownCalled = false;

	constructor(id = 'mock-transform') {
		this.id = id;
	}

	async init(_config: Record<string, unknown>): Promise<void> {
		this.initialized = true;
	}

	/** Make the transform drop all events */
	setDrop(drop: boolean): void {
		this.dropAll = drop;
	}

	/** Set a modifier function that transforms events */
	setModifier(fn: (event: OrgLoopEvent) => OrgLoopEvent): void {
		this.modifier = fn;
	}

	async execute(event: OrgLoopEvent, context: TransformContext): Promise<OrgLoopEvent | null> {
		this.processed.push({ event, context });
		if (this.dropAll) return null;
		if (this.modifier) return this.modifier(event);
		return event;
	}

	async shutdown(): Promise<void> {
		this.shutdownCalled = true;
	}
}

// ─── Mock Logger ──────────────────────────────────────────────────────────────

/**
 * Mock logger for testing.
 * Records all log entries for assertion.
 */
export class MockLogger implements Logger {
	readonly id: string;
	readonly entries: LogEntry[] = [];
	initialized = false;
	flushed = false;
	shutdownCalled = false;

	constructor(id = 'mock-logger') {
		this.id = id;
	}

	async init(_config: Record<string, unknown>): Promise<void> {
		this.initialized = true;
	}

	async log(entry: LogEntry): Promise<void> {
		this.entries.push(entry);
	}

	async flush(): Promise<void> {
		this.flushed = true;
	}

	async shutdown(): Promise<void> {
		this.flushed = true;
		this.shutdownCalled = true;
	}

	/** Get entries for a specific phase */
	entriesForPhase(phase: LogEntry['phase']): LogEntry[] {
		return this.entries.filter((e) => e.phase === phase);
	}

	/** Get entries for a specific event */
	entriesForEvent(eventId: string): LogEntry[] {
		return this.entries.filter((e) => e.event_id === eventId);
	}
}

// ─── Test Event Factory ───────────────────────────────────────────────────────

/**
 * Create a test event with sensible defaults.
 */
export function createTestEvent(overrides?: Partial<BuildEventOptions>): OrgLoopEvent {
	return buildEvent({
		source: 'test-source',
		type: 'resource.changed',
		provenance: {
			platform: 'test',
			author: 'test-author',
			author_type: 'team_member',
		},
		payload: { test: true },
		...overrides,
	});
}

/**
 * Create a test transform context with sensible defaults.
 */
export function createTestContext(overrides?: Partial<TransformContext>): TransformContext {
	return {
		source: 'test-source',
		target: 'test-actor',
		eventType: 'resource.changed',
		routeName: 'test-route',
		...overrides,
	};
}
