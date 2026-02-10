import { createTestContext, createTestEvent } from '@orgloop/sdk';
import { describe, expect, it } from 'vitest';
import { EnrichTransform } from '../enrich.js';

describe('EnrichTransform', () => {
	const ctx = createTestContext();

	// ─── Static field setting (set) ─────────────────────────────────────────────

	describe('set', () => {
		it('sets a top-level field on the event', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				set: { 'payload.priority': 'high' },
			});

			const event = createTestEvent({ payload: { test: true } });
			const result = await enrich.execute(event, ctx);

			expect(result).not.toBeNull();
			expect(result?.payload).toEqual({ test: true, priority: 'high' });
		});

		it('sets multiple fields', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				set: {
					'payload.priority': 'high',
					'payload.team': 'engineering',
				},
			});

			const event = createTestEvent({ payload: {} });
			const result = await enrich.execute(event, ctx);

			expect(result?.payload).toEqual({ priority: 'high', team: 'engineering' });
		});

		it('creates intermediate objects for nested dot-paths', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				set: { 'payload.meta.tags.priority': 'high' },
			});

			const event = createTestEvent({ payload: {} });
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).meta).toEqual({
				tags: { priority: 'high' },
			});
		});

		it('overwrites existing fields', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				set: { 'payload.existing': 'new-value' },
			});

			const event = createTestEvent({ payload: { existing: 'old-value' } });
			const result = await enrich.execute(event, ctx);

			expect(result?.payload).toEqual({ existing: 'new-value' });
		});

		it('sets non-string values (numbers, booleans)', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				set: {
					'payload.count': 42,
					'payload.active': true,
				},
			});

			const event = createTestEvent({ payload: {} });
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).count).toBe(42);
			expect((result?.payload as Record<string, unknown>).active).toBe(true);
		});
	});

	// ─── Field copying (copy) ───────────────────────────────────────────────────

	describe('copy', () => {
		it('copies a field from one path to another', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				copy: { 'payload.reviewer': 'provenance.author' },
			});

			const event = createTestEvent({
				provenance: { platform: 'github', author: 'alice', author_type: 'team_member' },
				payload: {},
			});
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).reviewer).toBe('alice');
		});

		it('copies nested fields', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				copy: { 'payload.pr_num': 'payload.pr.number' },
			});

			const event = createTestEvent({ payload: { pr: { number: 42 } } });
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).pr_num).toBe(42);
		});

		it('skips copy when source path is missing', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				copy: { 'payload.copied': 'payload.nonexistent.field' },
			});

			const event = createTestEvent({ payload: { existing: 'data' } });
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).copied).toBeUndefined();
			expect((result?.payload as Record<string, unknown>).existing).toBe('data');
		});

		it('creates intermediate objects for copy target', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				copy: { 'payload.deep.nested.target': 'source' },
			});

			const event = createTestEvent({ source: 'github', payload: {} });
			const result = await enrich.execute(event, ctx);

			expect(
				(
					((result?.payload as Record<string, unknown>).deep as Record<string, unknown>)
						.nested as Record<string, unknown>
				).target,
			).toBe('github');
		});
	});

	// ─── Computed fields (compute) ──────────────────────────────────────────────

	describe('compute', () => {
		it('evaluates === with string literal', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				compute: { 'payload.is_bot': "provenance.author_type === 'bot'" },
			});

			const event = createTestEvent({
				provenance: { platform: 'github', author: 'dependabot', author_type: 'bot' },
			});
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).is_bot).toBe(true);
		});

		it('evaluates === returning false', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				compute: { 'payload.is_bot': "provenance.author_type === 'bot'" },
			});

			const event = createTestEvent({
				provenance: {
					platform: 'github',
					author: 'alice',
					author_type: 'team_member',
				},
			});
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).is_bot).toBe(false);
		});

		it('evaluates !== operator', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				compute: { 'payload.is_human': "provenance.author_type !== 'bot'" },
			});

			const event = createTestEvent({
				provenance: {
					platform: 'github',
					author: 'alice',
					author_type: 'team_member',
				},
			});
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).is_human).toBe(true);
		});

		it('evaluates > operator with numbers', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				compute: { 'payload.is_large': 'payload.size > 100' },
			});

			const event = createTestEvent({ payload: { size: 150 } });
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).is_large).toBe(true);
		});

		it('evaluates < operator with numbers', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				compute: { 'payload.is_small': 'payload.size < 10' },
			});

			const event = createTestEvent({ payload: { size: 5 } });
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).is_small).toBe(true);
		});

		it('evaluates >= operator', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				compute: { 'payload.at_least': 'payload.count >= 10' },
			});

			const event = createTestEvent({ payload: { count: 10 } });
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).at_least).toBe(true);
		});

		it('evaluates <= operator', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				compute: { 'payload.at_most': 'payload.count <= 5' },
			});

			const event = createTestEvent({ payload: { count: 5 } });
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).at_most).toBe(true);
		});

		it('returns false for numeric comparison with non-numeric field', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				compute: { 'payload.big': 'payload.name > 100' },
			});

			const event = createTestEvent({ payload: { name: 'alice' } });
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).big).toBe(false);
		});

		it('handles invalid compute expression gracefully', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				compute: { 'payload.result': 'this is not a valid expression' },
			});

			const event = createTestEvent({ payload: { data: 'test' } });
			const result = await enrich.execute(event, ctx);

			// Invalid expression → undefined → field not set
			expect((result?.payload as Record<string, unknown>).result).toBeUndefined();
			// Original data preserved
			expect((result?.payload as Record<string, unknown>).data).toBe('test');
		});

		it('evaluates === with double-quoted string', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				compute: { 'payload.is_github': 'source === "github"' },
			});

			const event = createTestEvent({ source: 'github' });
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).is_github).toBe(true);
		});
	});

	// ─── Event immutability ─────────────────────────────────────────────────────

	describe('immutability', () => {
		it('does not mutate the input event', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				set: { 'payload.added': 'value' },
			});

			const event = createTestEvent({ payload: { original: 'data' } });
			const originalPayload = { ...event.payload };

			await enrich.execute(event, ctx);

			// Original event should be unchanged
			expect(event.payload).toEqual(originalPayload);
		});

		it('does not mutate input when copying fields', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				copy: { 'payload.src': 'source' },
			});

			const event = createTestEvent({ source: 'github', payload: {} });
			const originalPayload = { ...event.payload };

			await enrich.execute(event, ctx);

			expect(event.payload).toEqual(originalPayload);
		});
	});

	// ─── No config = passthrough ────────────────────────────────────────────────

	describe('passthrough', () => {
		it('passes event through unchanged when no config is provided', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({});

			const event = createTestEvent({ payload: { test: true } });
			const result = await enrich.execute(event, ctx);

			expect(result).not.toBeNull();
			expect(result?.payload).toEqual({ test: true });
		});

		it('returns a new event object even with no config', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({});

			const event = createTestEvent();
			const result = await enrich.execute(event, ctx);

			expect(result).not.toBe(event);
		});
	});

	// ─── Combined operations ────────────────────────────────────────────────────

	describe('combined operations', () => {
		it('applies set, copy, and compute together', async () => {
			const enrich = new EnrichTransform();
			await enrich.init({
				set: { 'payload.team': 'engineering' },
				copy: { 'payload.author': 'provenance.author' },
				compute: { 'payload.is_bot': "provenance.author_type === 'bot'" },
			});

			const event = createTestEvent({
				provenance: {
					platform: 'github',
					author: 'dependabot',
					author_type: 'bot',
				},
				payload: { pr: 123 },
			});
			const result = await enrich.execute(event, ctx);

			expect((result?.payload as Record<string, unknown>).team).toBe('engineering');
			expect((result?.payload as Record<string, unknown>).author).toBe('dependabot');
			expect((result?.payload as Record<string, unknown>).is_bot).toBe(true);
			expect((result?.payload as Record<string, unknown>).pr).toBe(123);
		});
	});

	// ─── Registration ──────────────────────────────────────────────────────────

	describe('registration', () => {
		it('register() returns valid TransformRegistration', async () => {
			const { register } = await import('../index.js');
			const reg = register();

			expect(reg.id).toBe('enrich');
			expect(reg.transform).toBe(EnrichTransform);
			expect(reg.configSchema).toBeDefined();
			expect(reg.configSchema?.type).toBe('object');
		});
	});
});
