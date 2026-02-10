/**
 * Event bus implementations.
 *
 * InMemoryBus: simple pub/sub for dev/testing.
 * FileWalBus: wraps EventStore for durable at-least-once delivery.
 */

import type { EventFilter, OrgLoopEvent, Subscription } from '@orgloop/sdk';
import type { EventStore } from './store.js';

// ─── Event Bus Interface ──────────────────────────────────────────────────────

export type BusHandler = (event: OrgLoopEvent) => Promise<void>;

export interface EventBus {
	publish(event: OrgLoopEvent): Promise<void>;
	subscribe(filter: EventFilter, handler: BusHandler): Subscription;
	ack(eventId: string): Promise<void>;
	unacked(): Promise<OrgLoopEvent[]>;
}

// ─── Filter matching ──────────────────────────────────────────────────────────

function matchesFilter(event: OrgLoopEvent, filter: EventFilter): boolean {
	if (filter.source && event.source !== filter.source) return false;
	if (filter.type && event.type !== filter.type) return false;
	return true;
}

// ─── In-Memory Bus ────────────────────────────────────────────────────────────

interface SubscriptionEntry {
	id: number;
	filter: EventFilter;
	handler: BusHandler;
}

export class InMemoryBus implements EventBus {
	private nextId = 0;
	private readonly subscriptions: SubscriptionEntry[] = [];
	private readonly pending = new Map<string, OrgLoopEvent>();

	async publish(event: OrgLoopEvent): Promise<void> {
		this.pending.set(event.id, event);
		const matching = this.subscriptions.filter((s) => matchesFilter(event, s.filter));
		await Promise.all(matching.map((s) => s.handler(event)));
	}

	subscribe(filter: EventFilter, handler: BusHandler): Subscription {
		const id = this.nextId++;
		const entry: SubscriptionEntry = { id, filter, handler };
		this.subscriptions.push(entry);
		return {
			unsubscribe: () => {
				const idx = this.subscriptions.findIndex((s) => s.id === id);
				if (idx >= 0) this.subscriptions.splice(idx, 1);
			},
		};
	}

	async ack(eventId: string): Promise<void> {
		this.pending.delete(eventId);
	}

	async unacked(): Promise<OrgLoopEvent[]> {
		return [...this.pending.values()];
	}
}

// ─── File WAL Bus ─────────────────────────────────────────────────────────────

export class FileWalBus implements EventBus {
	private readonly store: EventStore;
	private nextId = 0;
	private readonly subscriptions: SubscriptionEntry[] = [];

	constructor(store: EventStore) {
		this.store = store;
	}

	async publish(event: OrgLoopEvent): Promise<void> {
		await this.store.write(event);
		const matching = this.subscriptions.filter((s) => matchesFilter(event, s.filter));
		await Promise.all(matching.map((s) => s.handler(event)));
	}

	subscribe(filter: EventFilter, handler: BusHandler): Subscription {
		const id = this.nextId++;
		const entry: SubscriptionEntry = { id, filter, handler };
		this.subscriptions.push(entry);
		return {
			unsubscribe: () => {
				const idx = this.subscriptions.findIndex((s) => s.id === id);
				if (idx >= 0) this.subscriptions.splice(idx, 1);
			},
		};
	}

	async ack(eventId: string): Promise<void> {
		await this.store.ack(eventId);
	}

	async unacked(): Promise<OrgLoopEvent[]> {
		const entries = await this.store.unacked();
		return entries.map((e) => e.event);
	}
}
