import { createTestContext, createTestEvent } from '@orgloop/sdk';
import { beforeEach, describe, expect, it } from 'vitest';
import { FilterTransform } from '../filter.js';

describe('FilterTransform', () => {
	let filter: FilterTransform;

	beforeEach(() => {
		filter = new FilterTransform();
	});

	describe('match mode', () => {
		it('passes events matching all criteria', async () => {
			await filter.init({
				match: {
					'provenance.author_type': 'team_member',
					type: 'resource.changed',
				},
			});

			const event = createTestEvent({
				type: 'resource.changed',
				provenance: { platform: 'test', author_type: 'team_member' },
			});
			const result = await filter.execute(event, createTestContext());
			expect(result).not.toBeNull();
		});

		it('drops events not matching', async () => {
			await filter.init({
				match: {
					'provenance.author_type': 'team_member',
				},
			});

			const event = createTestEvent({
				provenance: { platform: 'test', author_type: 'bot' },
			});
			const result = await filter.execute(event, createTestContext());
			expect(result).toBeNull();
		});
	});

	describe('exclude mode', () => {
		it('drops events matching exclude pattern', async () => {
			await filter.init({
				exclude: {
					'provenance.author_type': 'bot',
				},
			});

			const event = createTestEvent({
				provenance: { platform: 'test', author_type: 'bot' },
			});
			const result = await filter.execute(event, createTestContext());
			expect(result).toBeNull();
		});

		it('passes events not matching exclude', async () => {
			await filter.init({
				exclude: {
					'provenance.author_type': 'bot',
				},
			});

			const event = createTestEvent({
				provenance: { platform: 'test', author_type: 'team_member' },
			});
			const result = await filter.execute(event, createTestContext());
			expect(result).not.toBeNull();
		});

		it('supports array exclude values', async () => {
			await filter.init({
				exclude: {
					'provenance.author': ['dependabot[bot]', 'renovate[bot]'],
				},
			});

			const botEvent = createTestEvent({
				provenance: { platform: 'test', author: 'dependabot[bot]' },
			});
			const humanEvent = createTestEvent({
				provenance: { platform: 'test', author: 'alice' },
			});

			expect(await filter.execute(botEvent, createTestContext())).toBeNull();
			expect(await filter.execute(humanEvent, createTestContext())).not.toBeNull();
		});
	});

	describe('regex matching', () => {
		it('matches regex pattern on payload.cwd for CWD-based routing', async () => {
			await filter.init({
				match: {
					'payload.cwd': '/^\\/home\\/.*\\/projects\\/app/',
				},
			});

			const event = createTestEvent({
				payload: { cwd: '/home/user/projects/app' },
			});
			const result = await filter.execute(event, createTestContext());
			expect(result).not.toBeNull();
		});

		it('rejects non-matching CWD regex', async () => {
			await filter.init({
				match: {
					'payload.cwd': '/^\\/home\\/.*\\/projects\\/app/',
				},
			});

			const event = createTestEvent({
				payload: { cwd: '/home/user/projects/orgloop' },
			});
			const result = await filter.execute(event, createTestContext());
			expect(result).toBeNull();
		});

		it('supports regex with flags', async () => {
			await filter.init({
				match: {
					'payload.title': '/fix|bug/i',
				},
			});

			const event = createTestEvent({
				payload: { title: 'FIX: login issue' },
			});
			const result = await filter.execute(event, createTestContext());
			expect(result).not.toBeNull();
		});

		it('falls back to exact match for non-regex strings', async () => {
			await filter.init({
				match: {
					'payload.cwd': '/home/user/projects/app',
				},
			});

			// Exact match should work
			const exactEvent = createTestEvent({
				payload: { cwd: '/home/user/projects/app' },
			});
			const exactResult = await filter.execute(exactEvent, createTestContext());
			expect(exactResult).not.toBeNull();

			// Partial match should NOT work (not a regex)
			const partialEvent = createTestEvent({
				payload: { cwd: '/home/user/projects/app-extra' },
			});
			const partialResult = await filter.execute(partialEvent, createTestContext());
			expect(partialResult).toBeNull();
		});

		it('handles invalid regex gracefully (no crash)', async () => {
			await filter.init({
				match: {
					'payload.cwd': '/[invalid/',
				},
			});

			const event = createTestEvent({
				payload: { cwd: '/anything' },
			});
			// Invalid regex falls back to exact string match, which won't match
			const result = await filter.execute(event, createTestContext());
			expect(result).toBeNull();
		});

		it('works with regex in exclude mode', async () => {
			await filter.init({
				exclude: {
					'payload.cwd': '/\\/tmp\\//',
				},
			});

			const tmpEvent = createTestEvent({
				payload: { cwd: '/tmp/scratch' },
			});
			const normalEvent = createTestEvent({
				payload: { cwd: '/home/user/projects/work' },
			});

			expect(await filter.execute(tmpEvent, createTestContext())).toBeNull();
			expect(await filter.execute(normalEvent, createTestContext())).not.toBeNull();
		});

		it('routes personal vs work repos by CWD pattern', async () => {
			// Simulates a bespoke setup:
			// ~/code/mono* → work agent, ~/personal/* → personal agent

			const workFilter = new FilterTransform();
			await workFilter.init({
				match: { 'payload.cwd': '/\\/projects\\/app/' },
			});

			const personalFilter = new FilterTransform();
			await personalFilter.init({
				match: { 'payload.cwd': '/\\/personal\\//' },
			});

			const workEvent = createTestEvent({
				payload: { cwd: '/home/user/projects/app-api' },
			});
			const personalEvent = createTestEvent({
				payload: { cwd: '/home/user/personal/orgloop' },
			});

			const ctx = createTestContext();

			// Work event matches work filter, not personal
			expect(await workFilter.execute(workEvent, ctx)).not.toBeNull();
			expect(await personalFilter.execute(workEvent, ctx)).toBeNull();

			// Personal event matches personal filter, not work
			expect(await workFilter.execute(personalEvent, ctx)).toBeNull();
			expect(await personalFilter.execute(personalEvent, ctx)).not.toBeNull();
		});
	});

	describe('match_any mode (OR)', () => {
		it('passes events matching any criterion', async () => {
			await filter.init({
				match_any: {
					'provenance.pr_author': 'alice',
					'provenance.author': 'my-bot[bot]',
				},
			});

			// Matches first criterion (pr_author)
			const prEvent = createTestEvent({
				provenance: { platform: 'github', pr_author: 'alice', author: 'bob' },
			});
			expect(await filter.execute(prEvent, createTestContext())).not.toBeNull();

			// Matches second criterion (author)
			const botEvent = createTestEvent({
				provenance: { platform: 'github', pr_author: 'charlie', author: 'my-bot[bot]' },
			});
			expect(await filter.execute(botEvent, createTestContext())).not.toBeNull();
		});

		it('drops events matching no criteria', async () => {
			await filter.init({
				match_any: {
					'provenance.pr_author': 'alice',
					'provenance.author': 'my-bot[bot]',
				},
			});

			const event = createTestEvent({
				provenance: { platform: 'github', pr_author: 'charlie', author: 'dave' },
			});
			expect(await filter.execute(event, createTestContext())).toBeNull();
		});

		it('works with exclude — exclude runs first', async () => {
			await filter.init({
				match_any: {
					'provenance.pr_author': 'alice',
					'provenance.author': 'my-bot[bot]',
				},
				exclude: {
					'provenance.author_type': 'bot',
				},
			});

			// Bot event on alice's PR — excluded because author_type is bot
			const event = createTestEvent({
				provenance: {
					platform: 'github',
					pr_author: 'alice',
					author: 'dependabot[bot]',
					author_type: 'bot',
				},
			});
			expect(await filter.execute(event, createTestContext())).toBeNull();
		});

		it('combines with match (AND) — both must pass', async () => {
			await filter.init({
				match: {
					type: 'resource.changed',
				},
				match_any: {
					'provenance.pr_author': 'alice',
					'provenance.author': 'my-bot[bot]',
				},
			});

			// Right type + matches match_any → pass
			const goodEvent = createTestEvent({
				type: 'resource.changed',
				provenance: { platform: 'github', pr_author: 'alice' },
			});
			expect(await filter.execute(goodEvent, createTestContext())).not.toBeNull();

			// Wrong type → dropped by match even though match_any would pass
			const wrongType = createTestEvent({
				type: 'actor.stopped',
				provenance: { platform: 'github', pr_author: 'alice' },
			});
			expect(await filter.execute(wrongType, createTestContext())).toBeNull();
		});

		it('supports array values in match_any criteria', async () => {
			await filter.init({
				match_any: {
					'provenance.author': ['my-bot[bot]', 'other-bot[bot]'],
				},
			});

			const event = createTestEvent({
				provenance: { platform: 'github', author: 'other-bot[bot]' },
			});
			expect(await filter.execute(event, createTestContext())).not.toBeNull();
		});

		it('auto-splits CSV string values into arrays', async () => {
			// Simulates GITHUB_WATCHED="c-h-,my-app-bot" after env var substitution
			await filter.init({
				match_any: {
					'provenance.pr_author': 'c-h-,my-app-bot',
					'provenance.author': 'c-h-,my-app-bot',
				},
			});

			// Matches pr_author
			const prEvent = createTestEvent({
				provenance: { platform: 'github', pr_author: 'c-h-', author: 'reviewer' },
			});
			expect(await filter.execute(prEvent, createTestContext())).not.toBeNull();

			// Matches author (bot)
			const botEvent = createTestEvent({
				provenance: { platform: 'github', pr_author: 'other', author: 'my-app-bot' },
			});
			expect(await filter.execute(botEvent, createTestContext())).not.toBeNull();

			// Matches neither
			const otherEvent = createTestEvent({
				provenance: { platform: 'github', pr_author: 'other', author: 'stranger' },
			});
			expect(await filter.execute(otherEvent, createTestContext())).toBeNull();
		});
	});

	describe('array-contains via [] notation', () => {
		it('matches when array element has matching sub-field', async () => {
			await filter.init({
				match: {
					'payload.labels[].name': 'niko-authored',
				},
			});

			const event = createTestEvent({
				payload: { labels: [{ name: 'niko-authored' }, { name: 'bug' }] },
			});
			expect(await filter.execute(event, createTestContext())).not.toBeNull();
		});

		it('drops when no array element matches', async () => {
			await filter.init({
				match: {
					'payload.labels[].name': 'niko-authored',
				},
			});

			const event = createTestEvent({
				payload: { labels: [{ name: 'bug' }, { name: 'enhancement' }] },
			});
			expect(await filter.execute(event, createTestContext())).toBeNull();
		});

		it('drops when field is not an array', async () => {
			await filter.init({
				match: {
					'payload.labels[].name': 'niko-authored',
				},
			});

			const event = createTestEvent({
				payload: { labels: 'not-an-array' },
			});
			expect(await filter.execute(event, createTestContext())).toBeNull();
		});

		it('works with match_any and [] notation', async () => {
			await filter.init({
				match_any: {
					'payload.labels[].name': 'niko-authored',
					'provenance.author': 'nick',
				},
			});

			// Matches via label
			const labelEvent = createTestEvent({
				provenance: { platform: 'github', author: 'bot' },
				payload: { labels: [{ name: 'niko-authored' }] },
			});
			expect(await filter.execute(labelEvent, createTestContext())).not.toBeNull();

			// Matches via author
			const authorEvent = createTestEvent({
				provenance: { platform: 'github', author: 'nick' },
				payload: { labels: [{ name: 'bug' }] },
			});
			expect(await filter.execute(authorEvent, createTestContext())).not.toBeNull();

			// Matches neither
			const noMatchEvent = createTestEvent({
				provenance: { platform: 'github', author: 'stranger' },
				payload: { labels: [{ name: 'bug' }] },
			});
			expect(await filter.execute(noMatchEvent, createTestContext())).toBeNull();
		});

		it('works with exclude and [] notation', async () => {
			await filter.init({
				exclude: {
					'payload.labels[].name': 'do-not-autofix',
				},
			});

			const excludedEvent = createTestEvent({
				payload: { labels: [{ name: 'do-not-autofix' }, { name: 'bug' }] },
			});
			expect(await filter.execute(excludedEvent, createTestContext())).toBeNull();

			const normalEvent = createTestEvent({
				payload: { labels: [{ name: 'bug' }] },
			});
			expect(await filter.execute(normalEvent, createTestContext())).not.toBeNull();
		});

		it('handles simple value arrays (no sub-path)', async () => {
			await filter.init({
				match: {
					'payload.tags[]': 'urgent',
				},
			});

			const event = createTestEvent({
				payload: { tags: ['urgent', 'bugfix'] },
			});
			expect(await filter.execute(event, createTestContext())).not.toBeNull();
		});
	});

	describe('no config', () => {
		it('passes all events when no match/exclude configured', async () => {
			await filter.init({});

			const event = createTestEvent();
			const result = await filter.execute(event, createTestContext());
			expect(result).not.toBeNull();
		});
	});
});
