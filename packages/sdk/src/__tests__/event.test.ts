import { describe, expect, it } from 'vitest';
import {
	buildEvent,
	generateEventId,
	generateTraceId,
	isOrgLoopEvent,
	validateEvent,
} from '../event.js';

describe('generateEventId', () => {
	it('generates IDs with evt_ prefix', () => {
		const id = generateEventId();
		expect(id).toMatch(/^evt_[a-f0-9]{16}$/);
	});

	it('generates unique IDs', () => {
		const ids = new Set(Array.from({ length: 100 }, () => generateEventId()));
		expect(ids.size).toBe(100);
	});
});

describe('generateTraceId', () => {
	it('generates IDs with trc_ prefix', () => {
		const id = generateTraceId();
		expect(id).toMatch(/^trc_[a-f0-9]{16}$/);
	});
});

describe('buildEvent', () => {
	it('creates a well-formed event with defaults', () => {
		const event = buildEvent({
			source: 'github',
			type: 'resource.changed',
			provenance: {
				platform: 'github',
				platform_event: 'pull_request.review_submitted',
				author: 'alice',
				author_type: 'team_member',
			},
		});

		expect(event.id).toMatch(/^evt_/);
		expect(event.timestamp).toBeTruthy();
		expect(event.source).toBe('github');
		expect(event.type).toBe('resource.changed');
		expect(event.provenance.platform).toBe('github');
		expect(event.payload).toEqual({});
		expect(event.trace_id).toMatch(/^trc_/);
	});

	it('allows overriding id, timestamp, trace_id', () => {
		const event = buildEvent({
			source: 'test',
			type: 'actor.stopped',
			provenance: { platform: 'test' },
			id: 'evt_custom123',
			timestamp: '2026-01-01T00:00:00Z',
			trace_id: 'trc_custom456',
		});

		expect(event.id).toBe('evt_custom123');
		expect(event.timestamp).toBe('2026-01-01T00:00:00Z');
		expect(event.trace_id).toBe('trc_custom456');
	});

	it('includes payload when provided', () => {
		const event = buildEvent({
			source: 'test',
			type: 'resource.changed',
			provenance: { platform: 'test' },
			payload: { pr_number: 42, title: 'Fix bug' },
		});

		expect(event.payload).toEqual({ pr_number: 42, title: 'Fix bug' });
	});
});

describe('validateEvent', () => {
	it('returns no errors for valid event', () => {
		const event = buildEvent({
			source: 'github',
			type: 'resource.changed',
			provenance: { platform: 'github' },
		});
		expect(validateEvent(event)).toEqual([]);
	});

	it('catches missing id', () => {
		const errors = validateEvent({
			timestamp: '2026-01-01T00:00:00Z',
			source: 'test',
			type: 'resource.changed',
			provenance: { platform: 'test' },
		});
		expect(errors.some((e) => e.field === 'id')).toBe(true);
	});

	it('catches invalid type', () => {
		const errors = validateEvent({
			id: 'evt_abc',
			timestamp: '2026-01-01T00:00:00Z',
			source: 'test',
			type: 'invalid.type',
			provenance: { platform: 'test' },
		});
		expect(errors.some((e) => e.field === 'type')).toBe(true);
	});

	it('catches missing provenance', () => {
		const errors = validateEvent({
			id: 'evt_abc',
			timestamp: '2026-01-01T00:00:00Z',
			source: 'test',
			type: 'resource.changed',
		});
		expect(errors.some((e) => e.field === 'provenance')).toBe(true);
	});

	it('catches null input', () => {
		expect(validateEvent(null)).toHaveLength(1);
		expect(validateEvent(undefined)).toHaveLength(1);
		expect(validateEvent('string')).toHaveLength(1);
	});
});

describe('isOrgLoopEvent', () => {
	it('returns true for valid events', () => {
		const event = buildEvent({
			source: 'test',
			type: 'resource.changed',
			provenance: { platform: 'test' },
		});
		expect(isOrgLoopEvent(event)).toBe(true);
	});

	it('returns false for invalid objects', () => {
		expect(isOrgLoopEvent({})).toBe(false);
		expect(isOrgLoopEvent(null)).toBe(false);
		expect(isOrgLoopEvent({ id: 'no-prefix' })).toBe(false);
	});
});
