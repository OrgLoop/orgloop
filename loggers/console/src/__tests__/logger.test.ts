/**
 * Tests for ConsoleLogger — level filtering, formatting, color, error resilience.
 */

import type { LogEntry, LogPhase } from '@orgloop/sdk';
import { ConsoleLogger } from '../console-logger.js';
import { formatCompact, formatVerbose, shouldLog } from '../format.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
	return {
		timestamp: '2024-01-15T10:30:45.123Z',
		event_id: 'evt_abc123',
		trace_id: 'trc_xyz789',
		phase: 'deliver.success',
		source: 'github',
		target: 'openclaw',
		route: 'pr-review',
		event_type: 'resource.changed',
		...overrides,
	};
}

// ANSI codes for assertion
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';

// ─── shouldLog ───────────────────────────────────────────────────────────────

describe('shouldLog', () => {
	it('shows all phases at debug level', () => {
		expect(shouldLog('source.emit', 'debug')).toBe(true);
		expect(shouldLog('transform.start', 'debug')).toBe(true);
		expect(shouldLog('route.no_match', 'debug')).toBe(true);
		expect(shouldLog('deliver.attempt', 'debug')).toBe(true);
		expect(shouldLog('deliver.success', 'debug')).toBe(true);
		expect(shouldLog('system.error', 'debug')).toBe(true);
	});

	it('filters debug-level phases at info level', () => {
		expect(shouldLog('transform.start', 'info')).toBe(false); // debug → filtered
		expect(shouldLog('route.no_match', 'info')).toBe(false); // debug → filtered
		expect(shouldLog('deliver.attempt', 'info')).toBe(false); // debug → filtered
		expect(shouldLog('deliver.success', 'info')).toBe(true); // info → shown
		expect(shouldLog('system.start', 'info')).toBe(true); // info → shown
	});

	it('filters info-level phases at warn level', () => {
		expect(shouldLog('deliver.success', 'warn')).toBe(false); // info → filtered
		expect(shouldLog('route.match', 'warn')).toBe(false); // info → filtered
		expect(shouldLog('transform.error', 'warn')).toBe(true); // warn → shown
		expect(shouldLog('deliver.retry', 'warn')).toBe(true); // warn → shown
		expect(shouldLog('deliver.failure', 'warn')).toBe(true); // error → shown
	});

	it('only shows error phases at error level', () => {
		expect(shouldLog('deliver.retry', 'error')).toBe(false); // warn → filtered
		expect(shouldLog('transform.error', 'error')).toBe(false); // warn → filtered
		expect(shouldLog('deliver.failure', 'error')).toBe(true); // error → shown
		expect(shouldLog('system.error', 'error')).toBe(true); // error → shown
	});

	it('handles unknown phase gracefully', () => {
		expect(shouldLog('unknown.phase' as LogPhase, 'info')).toBe(true);
	});

	it('handles unknown level gracefully', () => {
		expect(shouldLog('deliver.success', 'unknown')).toBe(true);
	});
});

// ─── formatCompact ───────────────────────────────────────────────────────────

describe('formatCompact', () => {
	it('produces one-line output with phase, source, target, route', () => {
		const entry = makeEntry();
		const output = formatCompact(entry, false);

		expect(output).toContain('deliver.success');
		expect(output).toContain('src=github');
		expect(output).toContain('tgt=openclaw');
		expect(output).toContain('route=pr-review');
		expect(output).toContain('type=resource.changed');
		expect(output).not.toContain('\n');
	});

	it('includes duration when present', () => {
		const entry = makeEntry({ duration_ms: 42 });
		const output = formatCompact(entry, false);
		expect(output).toContain('42ms');
	});

	it('includes result when present', () => {
		const entry = makeEntry({ result: 'delivered' });
		const output = formatCompact(entry, false);
		expect(output).toContain('result=delivered');
	});

	it('includes error when present', () => {
		const entry = makeEntry({ error: 'connection refused' });
		const output = formatCompact(entry, false);
		expect(output).toContain('err=connection refused');
	});

	it('includes transform field when present', () => {
		const entry = makeEntry({ phase: 'transform.pass', transform: 'dedup' });
		const output = formatCompact(entry, false);
		expect(output).toContain('xform=dedup');
	});

	it('formats time as HH:MM:SS.mmm', () => {
		const entry = makeEntry({ timestamp: '2024-01-15T10:30:45.123Z' });
		const output = formatCompact(entry, false);
		// Time will be in local timezone, just check HH:MM:SS.mmm pattern
		expect(output).toMatch(/\d{2}:\d{2}:\d{2}\.\d{3}/);
	});

	it('uses ANSI colors when color=true', () => {
		const entry = makeEntry();
		const output = formatCompact(entry, true);
		expect(output).toContain(RESET);
		expect(output).toContain(GREEN); // deliver.success is green
	});

	it('no ANSI codes when color=false', () => {
		const entry = makeEntry();
		const output = formatCompact(entry, false);
		expect(output).not.toContain('\x1b[');
	});

	it('shows error in red when color=true', () => {
		const entry = makeEntry({ error: 'timeout' });
		const output = formatCompact(entry, true);
		expect(output).toContain(`${RED}err=timeout${RESET}`);
	});
});

// ─── Phase icons ─────────────────────────────────────────────────────────────

describe('phase icons', () => {
	const cases: [LogPhase, string][] = [
		['source.emit', '\u25cf'], // ●
		['transform.start', '\u25c6'], // ◆
		['transform.pass', '\u25c6'], // ◆
		['transform.drop', '\u2717'], // ✗
		['transform.error', '\u26a0'], // ⚠
		['route.match', '\u25ba'], // ►
		['route.no_match', '\u25ba'], // ►
		['deliver.attempt', '\u25b7'], // ▷
		['deliver.success', '\u2713'], // ✓
		['deliver.failure', '\u2717'], // ✗
		['deliver.retry', '\u21bb'], // ↻
		['system.start', '\u25cf'], // ●
		['system.stop', '\u25cf'], // ●
		['system.error', '\u26a0'], // ⚠
	];

	for (const [phase, expectedIcon] of cases) {
		it(`${phase} → ${expectedIcon}`, () => {
			const entry = makeEntry({ phase });
			const output = formatCompact(entry, false);
			expect(output).toContain(expectedIcon);
		});
	}
});

// ─── formatVerbose ───────────────────────────────────────────────────────────

describe('formatVerbose', () => {
	it('includes compact line plus metadata when showPayload=true', () => {
		const entry = makeEntry({ metadata: { key: 'value' } });
		const output = formatVerbose(entry, false, true);

		const lines = output.split('\n');
		expect(lines.length).toBeGreaterThan(1);
		expect(output).toContain('"key": "value"');
		expect(output).toContain('metadata:');
	});

	it('is single line when showPayload=false', () => {
		const entry = makeEntry({ metadata: { key: 'value' } });
		const output = formatVerbose(entry, false, false);

		// Should be same as compact
		expect(output).not.toContain('metadata:');
		expect(output).not.toContain('\n');
	});

	it('is single line when no metadata present', () => {
		const entry = makeEntry();
		const output = formatVerbose(entry, false, true);
		expect(output).not.toContain('\n');
	});

	it('uses dim ANSI for metadata when color=true', () => {
		const entry = makeEntry({ metadata: { key: 'value' } });
		const output = formatVerbose(entry, true, true);
		expect(output).toContain(DIM);
	});
});

// ─── ConsoleLogger integration ───────────────────────────────────────────────

describe('ConsoleLogger', () => {
	let writeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('writes to stderr', async () => {
		const logger = new ConsoleLogger();
		await logger.init({});
		await logger.log(makeEntry());
		expect(writeSpy).toHaveBeenCalled();
		const output = writeSpy.mock.calls[0][0] as string;
		expect(output).toContain('deliver.success');
		expect(output.endsWith('\n')).toBe(true);
	});

	it('filters by level', async () => {
		const logger = new ConsoleLogger();
		await logger.init({ level: 'error' });
		await logger.log(makeEntry({ phase: 'deliver.success' })); // info → filtered
		expect(writeSpy).not.toHaveBeenCalled();

		await logger.log(makeEntry({ phase: 'deliver.failure' })); // error → shown
		expect(writeSpy).toHaveBeenCalled();
	});

	it('uses compact mode by default', async () => {
		const logger = new ConsoleLogger();
		await logger.init({});
		await logger.log(makeEntry({ metadata: { key: 'value' } }));
		const output = writeSpy.mock.calls[0][0] as string;
		expect(output).not.toContain('metadata:');
	});

	it('uses verbose mode when compact=false', async () => {
		const logger = new ConsoleLogger();
		await logger.init({ compact: false, show_payload: true });
		await logger.log(makeEntry({ metadata: { key: 'value' } }));
		const output = writeSpy.mock.calls[0][0] as string;
		expect(output).toContain('metadata:');
	});

	it('respects color=false', async () => {
		const logger = new ConsoleLogger();
		await logger.init({ color: false });
		await logger.log(makeEntry());
		const output = writeSpy.mock.calls[0][0] as string;
		expect(output).not.toContain('\x1b[');
	});

	it('does not throw on malformed entry', async () => {
		const logger = new ConsoleLogger();
		await logger.init({});
		// Force an error inside log by mocking stderr.write to throw
		writeSpy.mockImplementation(() => {
			throw new Error('write failed');
		});
		await expect(logger.log(makeEntry())).resolves.toBeUndefined();
	});

	it('flush is a no-op', async () => {
		const logger = new ConsoleLogger();
		await logger.init({});
		await expect(logger.flush()).resolves.toBeUndefined();
	});

	it('shutdown is a no-op', async () => {
		const logger = new ConsoleLogger();
		await logger.init({});
		await expect(logger.shutdown()).resolves.toBeUndefined();
	});
});

// ─── register() ───────────────────────────────────────────────────────────────

describe('register()', () => {
	it('returns correct registration shape', async () => {
		const { register } = await import('../index.js');
		const reg = register();
		expect(reg.id).toBe('console');
		expect(reg.logger).toBe(ConsoleLogger);
		expect(reg.configSchema).toBeDefined();
	});
});
