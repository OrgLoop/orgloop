import { describe, expect, it } from 'vitest';
import { buildEvent } from '../event.js';
import {
	buildDedupeKey,
	eventTypeForPhase,
	type LifecycleOutcome,
	type LifecyclePhase,
	NON_TERMINAL_PHASES,
	TERMINAL_PHASES,
	validateLifecycleEvent,
	validateLifecyclePayload,
} from '../lifecycle.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLifecyclePayload(
	phase: LifecyclePhase,
	overrides: {
		outcome?: LifecycleOutcome;
		reason?: string;
		session_id?: string;
		harness?: string;
	} = {},
): Record<string, unknown> {
	const terminal = TERMINAL_PHASES.has(phase);
	return {
		lifecycle: {
			phase,
			terminal,
			...(terminal ? { outcome: overrides.outcome ?? 'success' } : {}),
			...(overrides.reason ? { reason: overrides.reason } : {}),
			dedupe_key: buildDedupeKey(
				overrides.harness ?? 'claude-code',
				overrides.session_id ?? 'sess-123',
				phase,
			),
		},
		session: {
			id: overrides.session_id ?? 'sess-123',
			adapter: overrides.harness ?? 'claude-code',
			harness: overrides.harness ?? 'claude-code',
			cwd: '/tmp/test',
			started_at: '2026-01-01T00:00:00Z',
			...(terminal ? { ended_at: '2026-01-01T00:05:00Z', exit_status: 0 } : {}),
		},
	};
}

function makeLifecycleEvent(
	phase: LifecyclePhase,
	overrides: { outcome?: LifecycleOutcome; reason?: string } = {},
) {
	return buildEvent({
		source: 'test-claude-code',
		type: eventTypeForPhase(phase),
		provenance: { platform: 'claude-code', platform_event: `session.${phase}` },
		payload: makeLifecyclePayload(phase, overrides),
	});
}

// ─── Phase / Outcome Constants ────────────────────────────────────────────────

describe('lifecycle constants', () => {
	it('TERMINAL_PHASES contains completed, failed, stopped', () => {
		expect(TERMINAL_PHASES.has('completed')).toBe(true);
		expect(TERMINAL_PHASES.has('failed')).toBe(true);
		expect(TERMINAL_PHASES.has('stopped')).toBe(true);
		expect(TERMINAL_PHASES.has('started')).toBe(false);
	});

	it('NON_TERMINAL_PHASES contains started, active', () => {
		expect(NON_TERMINAL_PHASES.has('started')).toBe(true);
		expect(NON_TERMINAL_PHASES.has('active')).toBe(true);
		expect(NON_TERMINAL_PHASES.has('completed')).toBe(false);
	});

	it('every LifecyclePhase is in exactly one set', () => {
		const all: LifecyclePhase[] = ['started', 'active', 'completed', 'failed', 'stopped'];
		for (const phase of all) {
			const inTerminal = TERMINAL_PHASES.has(phase);
			const inNonTerminal = NON_TERMINAL_PHASES.has(phase);
			expect(inTerminal !== inNonTerminal).toBe(true);
		}
	});
});

// ─── eventTypeForPhase ────────────────────────────────────────────────────────

describe('eventTypeForPhase', () => {
	it('maps non-terminal phases to resource.changed', () => {
		expect(eventTypeForPhase('started')).toBe('resource.changed');
		expect(eventTypeForPhase('active')).toBe('resource.changed');
	});

	it('maps terminal phases to actor.stopped', () => {
		expect(eventTypeForPhase('completed')).toBe('actor.stopped');
		expect(eventTypeForPhase('failed')).toBe('actor.stopped');
		expect(eventTypeForPhase('stopped')).toBe('actor.stopped');
	});
});

// ─── buildDedupeKey ───────────────────────────────────────────────────────────

describe('buildDedupeKey', () => {
	it('builds stable key from harness, session, and phase', () => {
		expect(buildDedupeKey('claude-code', 'sess-123', 'completed')).toBe(
			'claude-code:sess-123:completed',
		);
	});

	it('produces different keys for different phases of the same session', () => {
		const started = buildDedupeKey('claude-code', 'sess-1', 'started');
		const completed = buildDedupeKey('claude-code', 'sess-1', 'completed');
		expect(started).not.toBe(completed);
	});
});

// ─── validateLifecyclePayload ─────────────────────────────────────────────────

describe('validateLifecyclePayload', () => {
	it('accepts valid non-terminal payload', () => {
		const errors = validateLifecyclePayload(makeLifecyclePayload('started'));
		expect(errors).toHaveLength(0);
	});

	it('accepts valid terminal payload', () => {
		const errors = validateLifecyclePayload(makeLifecyclePayload('completed'));
		expect(errors).toHaveLength(0);
	});

	it('accepts all phases with correct terminal/non-terminal', () => {
		const phases: LifecyclePhase[] = ['started', 'active', 'completed', 'failed', 'stopped'];
		for (const phase of phases) {
			const outcome = TERMINAL_PHASES.has(phase) ? 'success' : undefined;
			const errors = validateLifecyclePayload(
				makeLifecyclePayload(phase, { outcome: outcome as LifecycleOutcome }),
			);
			expect(errors).toHaveLength(0);
		}
	});

	it('rejects missing lifecycle object', () => {
		const errors = validateLifecyclePayload({
			session: { id: 'x', adapter: 'x', harness: 'claude-code' },
		});
		expect(errors.some((e) => e.field === 'lifecycle')).toBe(true);
	});

	it('rejects missing session object', () => {
		const payload = makeLifecyclePayload('started');
		delete (payload as Record<string, unknown>).session;
		const errors = validateLifecyclePayload(payload);
		expect(errors.some((e) => e.field === 'session')).toBe(true);
	});

	it('rejects invalid phase', () => {
		const payload = makeLifecyclePayload('started');
		(payload.lifecycle as Record<string, unknown>).phase = 'running';
		const errors = validateLifecyclePayload(payload);
		expect(errors.some((e) => e.field === 'lifecycle.phase')).toBe(true);
	});

	it('rejects terminal:false for terminal phase', () => {
		const payload = makeLifecyclePayload('completed');
		(payload.lifecycle as Record<string, unknown>).terminal = false;
		const errors = validateLifecyclePayload(payload);
		expect(errors.some((e) => e.field === 'lifecycle.terminal')).toBe(true);
	});

	it('rejects terminal:true for non-terminal phase', () => {
		const payload = makeLifecyclePayload('started');
		(payload.lifecycle as Record<string, unknown>).terminal = true;
		const errors = validateLifecyclePayload(payload);
		expect(errors.some((e) => e.field === 'lifecycle.terminal')).toBe(true);
	});

	it('requires outcome for terminal events', () => {
		const payload = makeLifecyclePayload('failed');
		delete (payload.lifecycle as Record<string, unknown>).outcome;
		const errors = validateLifecyclePayload(payload);
		expect(errors.some((e) => e.field === 'lifecycle.outcome')).toBe(true);
	});

	it('rejects empty dedupe_key', () => {
		const payload = makeLifecyclePayload('started');
		(payload.lifecycle as Record<string, unknown>).dedupe_key = '';
		const errors = validateLifecyclePayload(payload);
		expect(errors.some((e) => e.field === 'lifecycle.dedupe_key')).toBe(true);
	});

	it('rejects empty session.id', () => {
		const payload = makeLifecyclePayload('started');
		(payload.session as Record<string, unknown>).id = '';
		const errors = validateLifecyclePayload(payload);
		expect(errors.some((e) => e.field === 'session.id')).toBe(true);
	});

	it('rejects invalid harness type', () => {
		const payload = makeLifecyclePayload('started');
		(payload.session as Record<string, unknown>).harness = 'vscode';
		const errors = validateLifecyclePayload(payload);
		expect(errors.some((e) => e.field === 'session.harness')).toBe(true);
	});

	it('accepts all valid harness types', () => {
		for (const h of ['claude-code', 'codex', 'opencode', 'pi', 'pi-rust', 'other']) {
			const payload = makeLifecyclePayload('started', { harness: h });
			const errors = validateLifecyclePayload(payload);
			expect(errors).toHaveLength(0);
		}
	});

	it('accepts all valid outcomes for terminal events', () => {
		for (const o of ['success', 'failure', 'cancelled', 'unknown']) {
			const payload = makeLifecyclePayload('completed', {
				outcome: o as LifecycleOutcome,
			});
			const errors = validateLifecyclePayload(payload);
			expect(errors).toHaveLength(0);
		}
	});
});

// ─── validateLifecycleEvent ───────────────────────────────────────────────────

describe('validateLifecycleEvent', () => {
	it('accepts valid lifecycle event', () => {
		const event = makeLifecycleEvent('started');
		expect(validateLifecycleEvent(event)).toHaveLength(0);
	});

	it('rejects event type mismatch (terminal phase with resource.changed)', () => {
		const event = buildEvent({
			source: 'test',
			type: 'resource.changed', // wrong — should be actor.stopped
			provenance: { platform: 'claude-code' },
			payload: makeLifecyclePayload('completed'),
		});
		const errors = validateLifecycleEvent(event);
		expect(errors.some((e) => e.field === 'type')).toBe(true);
	});

	it('rejects event type mismatch (non-terminal phase with actor.stopped)', () => {
		const event = buildEvent({
			source: 'test',
			type: 'actor.stopped', // wrong — should be resource.changed
			provenance: { platform: 'claude-code' },
			payload: makeLifecyclePayload('started'),
		});
		const errors = validateLifecycleEvent(event);
		expect(errors.some((e) => e.field === 'type')).toBe(true);
	});

	it('validates full round-trip for all phases', () => {
		const phases: LifecyclePhase[] = ['started', 'active', 'completed', 'failed', 'stopped'];
		for (const phase of phases) {
			const outcome = TERMINAL_PHASES.has(phase) ? 'failure' : undefined;
			const event = makeLifecycleEvent(phase, {
				outcome: outcome as LifecycleOutcome,
			});
			expect(validateLifecycleEvent(event)).toHaveLength(0);
		}
	});
});
