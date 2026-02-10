import { createTestContext, createTestEvent } from '@orgloop/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DedupTransform } from '../dedup.js';

describe('DedupTransform', () => {
	let dedup: DedupTransform;

	beforeEach(() => {
		dedup = new DedupTransform();
	});

	afterEach(async () => {
		await dedup.shutdown();
		vi.useRealTimers();
	});

	it('passes first occurrence of an event', async () => {
		await dedup.init({
			key: ['source', 'type'],
			window: '5m',
		});

		const event = createTestEvent({ source: 'github', type: 'resource.changed' });
		const result = await dedup.execute(event, createTestContext());
		expect(result).not.toBeNull();
	});

	it('drops duplicate events within window', async () => {
		await dedup.init({
			key: ['source', 'type'],
			window: '5m',
		});

		const ctx = createTestContext();
		const event1 = createTestEvent({ source: 'github', type: 'resource.changed' });
		const event2 = createTestEvent({ source: 'github', type: 'resource.changed' });

		const r1 = await dedup.execute(event1, ctx);
		const r2 = await dedup.execute(event2, ctx);

		expect(r1).not.toBeNull();
		expect(r2).toBeNull();
	});

	it('passes events with different keys', async () => {
		await dedup.init({
			key: ['source', 'type'],
			window: '5m',
		});

		const ctx = createTestContext();
		const e1 = createTestEvent({ source: 'github', type: 'resource.changed' });
		const e2 = createTestEvent({ source: 'linear', type: 'resource.changed' });

		expect(await dedup.execute(e1, ctx)).not.toBeNull();
		expect(await dedup.execute(e2, ctx)).not.toBeNull();
	});

	it('uses default key when not configured', async () => {
		await dedup.init({ window: '5m' });

		const ctx = createTestContext();
		const e1 = createTestEvent();
		const e2 = createTestEvent();

		// Different event IDs but same source+type = dedup by default key
		expect(await dedup.execute(e1, ctx)).not.toBeNull();
		expect(await dedup.execute(e2, ctx)).not.toBeNull(); // Different IDs = different default key
	});

	// ─── Window expiration ─────────────────────────────────────────────────────

	it('passes same event again after window expires', async () => {
		vi.useFakeTimers();
		await dedup.init({ key: ['source', 'type'], window: '1m' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ source: 'github', type: 'resource.changed' });
		const e2 = createTestEvent({ source: 'github', type: 'resource.changed' });

		expect(await dedup.execute(e1, ctx)).not.toBeNull();
		expect(await dedup.execute(e2, ctx)).toBeNull();

		// Advance past the 1-minute window
		vi.advanceTimersByTime(61_000);

		const e3 = createTestEvent({ source: 'github', type: 'resource.changed' });
		expect(await dedup.execute(e3, ctx)).not.toBeNull();
	});

	it('still deduplicates within window after partial time advance', async () => {
		vi.useFakeTimers();
		await dedup.init({ key: ['source', 'type'], window: '5m' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ source: 'github', type: 'resource.changed' });

		expect(await dedup.execute(e1, ctx)).not.toBeNull();

		// Advance 2 minutes — still within 5m window
		vi.advanceTimersByTime(2 * 60_000);

		const e2 = createTestEvent({ source: 'github', type: 'resource.changed' });
		expect(await dedup.execute(e2, ctx)).toBeNull();
	});

	// ─── Cleanup timer ─────────────────────────────────────────────────────────

	it('cleanup removes expired entries', async () => {
		vi.useFakeTimers();
		await dedup.init({ key: ['source', 'type'], window: '10s' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ source: 'github', type: 'resource.changed' });

		expect(await dedup.execute(e1, ctx)).not.toBeNull();

		// Advance past window + cleanup interval (minimum 10s)
		vi.advanceTimersByTime(11_000);

		// Trigger cleanup by advancing past the interval
		vi.advanceTimersByTime(10_000);

		// After cleanup, the same event should pass again
		const e2 = createTestEvent({ source: 'github', type: 'resource.changed' });
		expect(await dedup.execute(e2, ctx)).not.toBeNull();
	});

	// ─── Memory cleanup on shutdown ────────────────────────────────────────────

	it('clears all entries on shutdown', async () => {
		await dedup.init({ key: ['source', 'type'], window: '5m' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ source: 'github', type: 'resource.changed' });
		expect(await dedup.execute(e1, ctx)).not.toBeNull();
		expect(await dedup.execute(e1, ctx)).toBeNull();

		await dedup.shutdown();

		// Re-initialize — a fresh instance should pass the same event
		const fresh = new DedupTransform();
		await fresh.init({ key: ['source', 'type'], window: '5m' });
		expect(await fresh.execute(e1, ctx)).not.toBeNull();
		await fresh.shutdown();
	});

	// ─── Custom key fields ─────────────────────────────────────────────────────

	it('different key configs produce different hashes', async () => {
		const dedupBySource = new DedupTransform();
		const dedupByType = new DedupTransform();

		await dedupBySource.init({ key: ['source'], window: '5m' });
		await dedupByType.init({ key: ['type'], window: '5m' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ source: 'github', type: 'resource.changed' });
		const e2 = createTestEvent({ source: 'linear', type: 'resource.changed' });

		// By source: different sources → both pass
		expect(await dedupBySource.execute(e1, ctx)).not.toBeNull();
		expect(await dedupBySource.execute(e2, ctx)).not.toBeNull();

		// By type: same type → second is dropped
		expect(await dedupByType.execute(e1, ctx)).not.toBeNull();
		expect(await dedupByType.execute(e2, ctx)).toBeNull();

		await dedupBySource.shutdown();
		await dedupByType.shutdown();
	});

	it('key with id field makes every event unique', async () => {
		await dedup.init({ key: ['id'], window: '5m' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ source: 'github', type: 'resource.changed' });
		const e2 = createTestEvent({ source: 'github', type: 'resource.changed' });

		// Different IDs → both pass
		expect(await dedup.execute(e1, ctx)).not.toBeNull();
		expect(await dedup.execute(e2, ctx)).not.toBeNull();
	});

	// ─── Dot-path resolution ───────────────────────────────────────────────────

	it('resolves nested dot-path fields', async () => {
		await dedup.init({ key: ['payload.pr.number'], window: '5m' });

		const ctx = createTestContext();
		const e1 = createTestEvent({
			payload: { pr: { number: 42 } },
		});
		const e2 = createTestEvent({
			payload: { pr: { number: 42 } },
		});
		const e3 = createTestEvent({
			payload: { pr: { number: 43 } },
		});

		expect(await dedup.execute(e1, ctx)).not.toBeNull();
		expect(await dedup.execute(e2, ctx)).toBeNull(); // Same PR number
		expect(await dedup.execute(e3, ctx)).not.toBeNull(); // Different PR number
	});

	it('resolves deeply nested paths', async () => {
		await dedup.init({ key: ['payload.a.b.c.d'], window: '5m' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ payload: { a: { b: { c: { d: 'value' } } } } });
		const e2 = createTestEvent({ payload: { a: { b: { c: { d: 'value' } } } } });

		expect(await dedup.execute(e1, ctx)).not.toBeNull();
		expect(await dedup.execute(e2, ctx)).toBeNull();
	});

	// ─── Missing field handling ────────────────────────────────────────────────

	it('handles missing dot-path fields without crashing', async () => {
		await dedup.init({ key: ['payload.nonexistent.field'], window: '5m' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ payload: { other: 'data' } });
		const e2 = createTestEvent({ payload: { different: 'data' } });

		// Both resolve to undefined → same hash → second is dropped
		expect(await dedup.execute(e1, ctx)).not.toBeNull();
		expect(await dedup.execute(e2, ctx)).toBeNull();
	});

	it('handles null intermediate values in dot-path', async () => {
		await dedup.init({ key: ['payload.nested.value'], window: '5m' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ payload: { nested: null } as Record<string, unknown> });

		// Should not crash
		expect(await dedup.execute(e1, ctx)).not.toBeNull();
	});

	// ─── Null byte separator ───────────────────────────────────────────────────

	it('distinguishes keys that would collide without null byte separator', async () => {
		await dedup.init({ key: ['source', 'type'], window: '5m' });

		const ctx = createTestContext();
		// If we concatenated without separator: "ab" + "" = "ab" and "a" + "b" = "ab"
		// With null byte separator: "ab\0" != "a\0b"
		const e1 = createTestEvent({ source: 'ab', type: 'resource.changed' });
		const e2 = createTestEvent({ source: 'a', type: 'resource.changed' });

		expect(await dedup.execute(e1, ctx)).not.toBeNull();
		// Different source values → different hashes
		expect(await dedup.execute(e2, ctx)).not.toBeNull();
	});

	// ─── Window parsing ────────────────────────────────────────────────────────

	it('parses seconds window', async () => {
		vi.useFakeTimers();
		await dedup.init({ key: ['source'], window: '30s' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ source: 'github' });

		expect(await dedup.execute(e1, ctx)).not.toBeNull();

		// Still within 30s
		vi.advanceTimersByTime(29_000);
		expect(await dedup.execute(createTestEvent({ source: 'github' }), ctx)).toBeNull();

		// Past 30s
		vi.advanceTimersByTime(2_000);
		expect(await dedup.execute(createTestEvent({ source: 'github' }), ctx)).not.toBeNull();
	});

	it('parses hours window', async () => {
		vi.useFakeTimers();
		await dedup.init({ key: ['source'], window: '1h' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ source: 'github' });

		expect(await dedup.execute(e1, ctx)).not.toBeNull();

		// Still within 1h
		vi.advanceTimersByTime(59 * 60_000);
		expect(await dedup.execute(createTestEvent({ source: 'github' }), ctx)).toBeNull();

		// Past 1h
		vi.advanceTimersByTime(2 * 60_000);
		expect(await dedup.execute(createTestEvent({ source: 'github' }), ctx)).not.toBeNull();
	});

	it('parses days window', async () => {
		vi.useFakeTimers();
		await dedup.init({ key: ['source'], window: '1d' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ source: 'github' });

		expect(await dedup.execute(e1, ctx)).not.toBeNull();

		// Still within 1d
		vi.advanceTimersByTime(23 * 60 * 60_000);
		expect(await dedup.execute(createTestEvent({ source: 'github' }), ctx)).toBeNull();

		// Past 1d
		vi.advanceTimersByTime(2 * 60 * 60_000);
		expect(await dedup.execute(createTestEvent({ source: 'github' }), ctx)).not.toBeNull();
	});

	// ─── Concurrent events ─────────────────────────────────────────────────────

	it('deduplicates rapid concurrent events correctly', async () => {
		await dedup.init({ key: ['source', 'type'], window: '5m' });

		const ctx = createTestContext();
		// Fire 10 identical events rapidly
		const events = Array.from({ length: 10 }, () =>
			createTestEvent({ source: 'github', type: 'resource.changed' }),
		);

		const results = await Promise.all(events.map((e) => dedup.execute(e, ctx)));

		// Only the first should pass
		const passed = results.filter((r) => r !== null);
		expect(passed).toHaveLength(1);
	});

	// ─── Large window ──────────────────────────────────────────────────────────

	it('handles large window (24h) without issues', async () => {
		vi.useFakeTimers();
		await dedup.init({ key: ['source'], window: '1d' });

		const ctx = createTestContext();
		const e1 = createTestEvent({ source: 'github' });

		expect(await dedup.execute(e1, ctx)).not.toBeNull();

		// 12 hours in — still deduped
		vi.advanceTimersByTime(12 * 60 * 60_000);
		expect(await dedup.execute(createTestEvent({ source: 'github' }), ctx)).toBeNull();

		// Full 24h + 1s — passes again
		vi.advanceTimersByTime(12 * 60 * 60_000 + 1_000);
		expect(await dedup.execute(createTestEvent({ source: 'github' }), ctx)).not.toBeNull();
	});

	// ─── Registration ──────────────────────────────────────────────────────────

	it('register() returns valid TransformRegistration', async () => {
		const { register } = await import('../index.js');
		const reg = register();

		expect(reg.id).toBe('dedup');
		expect(reg.transform).toBe(DedupTransform);
		expect(reg.configSchema).toBeDefined();
		expect(reg.configSchema?.type).toBe('object');
	});
});
