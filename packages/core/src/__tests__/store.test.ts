import { createTestEvent } from '@orgloop/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryCheckpointStore, InMemoryEventStore } from '../store.js';

describe('InMemoryCheckpointStore', () => {
	let store: InMemoryCheckpointStore;

	beforeEach(() => {
		store = new InMemoryCheckpointStore();
	});

	it('returns null for unknown source', async () => {
		expect(await store.get('unknown')).toBeNull();
	});

	it('stores and retrieves checkpoint', async () => {
		await store.set('github', 'checkpoint-123');
		expect(await store.get('github')).toBe('checkpoint-123');
	});

	it('overwrites existing checkpoint', async () => {
		await store.set('github', 'v1');
		await store.set('github', 'v2');
		expect(await store.get('github')).toBe('v2');
	});

	it('handles multiple sources independently', async () => {
		await store.set('github', 'g-checkpoint');
		await store.set('linear', 'l-checkpoint');
		expect(await store.get('github')).toBe('g-checkpoint');
		expect(await store.get('linear')).toBe('l-checkpoint');
	});
});

describe('InMemoryEventStore', () => {
	let store: InMemoryEventStore;

	beforeEach(() => {
		store = new InMemoryEventStore();
	});

	it('writes and retrieves events', async () => {
		const event = createTestEvent();
		await store.write(event);

		const unacked = await store.unacked();
		expect(unacked).toHaveLength(1);
		expect(unacked[0].event.id).toBe(event.id);
		expect(unacked[0].acked).toBe(false);
	});

	it('ack marks events as acknowledged', async () => {
		const event = createTestEvent();
		await store.write(event);
		await store.ack(event.id);

		const unacked = await store.unacked();
		expect(unacked).toHaveLength(0);
	});

	it('multiple writes create multiple entries', async () => {
		await store.write(createTestEvent());
		await store.write(createTestEvent());
		await store.write(createTestEvent());

		const unacked = await store.unacked();
		expect(unacked).toHaveLength(3);
	});

	it('ack only affects the specified event', async () => {
		const e1 = createTestEvent();
		const e2 = createTestEvent();
		await store.write(e1);
		await store.write(e2);
		await store.ack(e1.id);

		const unacked = await store.unacked();
		expect(unacked).toHaveLength(1);
		expect(unacked[0].event.id).toBe(e2.id);
	});
});
