import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestEvent } from '@orgloop/sdk';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileCheckpointStore, InMemoryCheckpointStore, InMemoryEventStore } from '../store.js';

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

describe('FileCheckpointStore', () => {
	let tempDir: string;
	let store: FileCheckpointStore;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'orgloop-test-checkpoint-'));
		store = new FileCheckpointStore(tempDir);
	});

	afterEach(async () => {
		try {
			await rm(tempDir, { recursive: true, force: true });
		} catch {
			// cleanup best-effort
		}
	});

	it('returns null for unknown source', async () => {
		expect(await store.get('unknown')).toBeNull();
	});

	it('stores and retrieves checkpoint', async () => {
		await store.set('gog-gmail', 'historyId:12345');
		expect(await store.get('gog-gmail')).toBe('historyId:12345');
	});

	it('overwrites existing checkpoint', async () => {
		await store.set('gog-gmail', 'v1');
		await store.set('gog-gmail', 'v2');
		expect(await store.get('gog-gmail')).toBe('v2');
	});

	it('persists checkpoints across store instances (simulates daemon restart)', async () => {
		// First "daemon lifecycle" — write checkpoint
		const store1 = new FileCheckpointStore(tempDir);
		await store1.set('gog-gmail', 'historyId:99999');

		// Second "daemon lifecycle" — new instance, same directory
		const store2 = new FileCheckpointStore(tempDir);
		const checkpoint = await store2.get('gog-gmail');

		// Checkpoint must survive the "restart"
		expect(checkpoint).toBe('historyId:99999');
	});

	it('handles multiple sources independently with persistence', async () => {
		await store.set('gog-gmail', 'gmail-cp');
		await store.set('github', 'github-cp');

		// New instance — both should survive
		const fresh = new FileCheckpointStore(tempDir);
		expect(await fresh.get('gog-gmail')).toBe('gmail-cp');
		expect(await fresh.get('github')).toBe('github-cp');
	});

	it('creates checkpoint directory if it does not exist', async () => {
		const nonExistentDir = join(tempDir, 'nested', 'deep', 'dir');
		const deepStore = new FileCheckpointStore(nonExistentDir);

		// Should not throw — mkdir { recursive: true } in set()
		await deepStore.set('test-source', 'cp-value');
		expect(await deepStore.get('test-source')).toBe('cp-value');
	});

	it('writes atomically — no temp files left behind', async () => {
		await store.set('atomic-test', 'value-1');
		await store.set('atomic-test', 'value-2');

		// Only the final checkpoint file should exist, no .tmp files
		const checkpointDir = join(tempDir, 'checkpoints');
		const files = await readdir(checkpointDir);
		const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
		expect(tmpFiles).toHaveLength(0);
		expect(files).toContain('atomic-test.json');
	});

	it('writes valid JSON with checkpoint and updated_at', async () => {
		await store.set('json-test', 'my-checkpoint-value');

		const checkpointDir = join(tempDir, 'checkpoints');
		const content = await readFile(join(checkpointDir, 'json-test.json'), 'utf-8');
		const data = JSON.parse(content) as { checkpoint: string; updated_at: string };

		expect(data.checkpoint).toBe('my-checkpoint-value');
		expect(data.updated_at).toBeDefined();
		// updated_at should be a valid ISO 8601 timestamp
		expect(new Date(data.updated_at).toISOString()).toBe(data.updated_at);
	});

	it('handles concurrent writes to different sources', async () => {
		// Write to multiple sources concurrently
		await Promise.all([
			store.set('source-a', 'cp-a'),
			store.set('source-b', 'cp-b'),
			store.set('source-c', 'cp-c'),
		]);

		expect(await store.get('source-a')).toBe('cp-a');
		expect(await store.get('source-b')).toBe('cp-b');
		expect(await store.get('source-c')).toBe('cp-c');
	});

	it('handles checkpoint values with special characters', async () => {
		const special = '{"cursor":"abc123","ts":"2024-01-01T00:00:00Z"}';
		await store.set('special', special);
		expect(await store.get('special')).toBe(special);
	});

	it('returns null for corrupted checkpoint file', async () => {
		// Write a valid checkpoint first
		await store.set('corrupt', 'valid');

		// Corrupt the file
		const checkpointDir = join(tempDir, 'checkpoints');
		const { writeFile } = await import('node:fs/promises');
		await writeFile(join(checkpointDir, 'corrupt.json'), 'not-json{{{', 'utf-8');

		// Should return null (graceful fallback)
		expect(await store.get('corrupt')).toBeNull();
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
