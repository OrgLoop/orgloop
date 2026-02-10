import { describe, expect, it } from 'vitest';
import { parseDuration } from '../types.js';

describe('parseDuration', () => {
	it('parses milliseconds', () => {
		expect(parseDuration('100ms')).toBe(100);
	});

	it('parses seconds', () => {
		expect(parseDuration('30s')).toBe(30000);
	});

	it('parses minutes', () => {
		expect(parseDuration('5m')).toBe(300000);
	});

	it('parses hours', () => {
		expect(parseDuration('2h')).toBe(7200000);
	});

	it('parses days', () => {
		expect(parseDuration('7d')).toBe(604800000);
	});

	it('throws on invalid format', () => {
		expect(() => parseDuration('abc')).toThrow('Invalid duration format');
		expect(() => parseDuration('5x')).toThrow('Invalid duration format');
		expect(() => parseDuration('')).toThrow('Invalid duration format');
		expect(() => parseDuration('5')).toThrow('Invalid duration format');
	});
});
