/**
 * CLI inbox command tests — formatting functions and output.
 */

import { describe, expect, it } from 'vitest';
import { formatDrainText, formatStatusText } from '../commands/inbox.js';

describe('formatDrainText', () => {
	it('formats empty drain', () => {
		const text = formatDrainText({ events: [], remaining: 0, continuation: null });
		expect(text).toContain('Drained 0 event(s)');
	});

	it('formats drain with events', () => {
		const text = formatDrainText({
			events: [
				{
					id: 'evt_1',
					timestamp: '2025-01-01T00:00:00Z',
					type: 'resource.changed',
					source: 'github',
				},
				{
					id: 'evt_2',
					timestamp: '2025-01-01T00:01:00Z',
					type: 'resource.changed',
					source: 'linear',
				},
			],
			remaining: 3,
			continuation: '2',
		});
		expect(text).toContain('Drained 2 event(s)');
		expect(text).toContain('3 event(s) remaining');
		expect(text).toContain('evt_1');
		expect(text).toContain('github');
		expect(text).toContain('linear');
	});

	it('omits remaining line when zero', () => {
		const text = formatDrainText({
			events: [
				{
					id: 'evt_1',
					timestamp: '2025-01-01T00:00:00Z',
					type: 'resource.changed',
					source: 'github',
				},
			],
			remaining: 0,
			continuation: null,
		});
		expect(text).toContain('Drained 1 event(s)');
		expect(text).not.toContain('remaining');
	});
});

describe('formatStatusText', () => {
	it('formats empty sessions', () => {
		const text = formatStatusText([]);
		expect(text).toContain('No pending inbox sessions.');
	});

	it('formats sessions with pending counts', () => {
		const text = formatStatusText([
			{ sessionKey: 'pr:123', pending: 5 },
			{ sessionKey: 'pr:456', pending: 2 },
		]);
		expect(text).toContain('pr:123');
		expect(text).toContain('5 pending');
		expect(text).toContain('pr:456');
		expect(text).toContain('2 pending');
	});
});
