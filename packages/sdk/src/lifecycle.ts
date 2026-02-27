/**
 * Normalized lifecycle event contract for coding harness connectors.
 *
 * All coding harness connectors (claude-code, codex, opencode, pi, pi-rust)
 * MUST include these fields in their event payload. This enables harness-agnostic
 * routing, supervision, and automation downstream.
 *
 * The lifecycle payload is additive — it lives inside `event.payload` alongside
 * any connector-specific fields. OrgLoop event types are preserved:
 *   - Non-terminal phases (started, active) → `resource.changed`
 *   - Terminal phases (completed, failed, stopped) → `actor.stopped`
 */

import type { OrgLoopEvent, OrgLoopEventType } from './types.js';

// ─── Lifecycle Phases ─────────────────────────────────────────────────────────

/**
 * Lifecycle phase of a coding harness session.
 *
 * - `started`   — session launched, harness process running
 * - `active`    — session actively processing (tool calls, edits, etc.)
 * - `active`    — session alive and processing (may include running/idle transitions)
 * - `completed` — session ended normally (work finished)
 * - `failed`    — session ended with error (crash, non-zero exit, timeout)
 * - `stopped`   — session ended by external action (user cancel, host signal)
 */
export type LifecyclePhase = 'started' | 'active' | 'completed' | 'failed' | 'stopped';

/** Terminal phases — the session is over and won't transition again. */
export const TERMINAL_PHASES: ReadonlySet<LifecyclePhase> = new Set([
	'completed',
	'failed',
	'stopped',
]);

/** Non-terminal phases — the session is still alive. */
export const NON_TERMINAL_PHASES: ReadonlySet<LifecyclePhase> = new Set([
	'started',
	'active',
]);

// ─── Lifecycle Outcome ────────────────────────────────────────────────────────

/**
 * Terminal outcome — only present when `lifecycle.terminal` is true.
 *
 * - `success`   — work completed as intended (exit 0, task done)
 * - `failure`   — work failed (non-zero exit, crash, unrecoverable error)
 * - `cancelled` — session stopped by user or system before completion
 * - `unknown`   — terminal state reached but cause unclear (stale timeout, etc.)
 */
export type LifecycleOutcome = 'success' | 'failure' | 'cancelled' | 'unknown';

// ─── Harness Type ─────────────────────────────────────────────────────────────

/**
 * Known coding harness identifiers. Extensible via `other`.
 */
export type HarnessType = 'claude-code' | 'codex' | 'opencode' | 'pi' | 'pi-rust' | 'other';

// ─── Lifecycle Payload ────────────────────────────────────────────────────────

/** Lifecycle state for a coding harness session transition. */
export interface LifecycleState {
	/** Current phase of the session. */
	phase: LifecyclePhase;
	/** Whether this is a terminal event (session is over). */
	terminal: boolean;
	/** Terminal outcome. Required when `terminal` is true, absent otherwise. */
	outcome?: LifecycleOutcome;
	/** Machine-readable reason for the transition (e.g., "exit_code_1", "sigterm", "timeout"). */
	reason?: string;
	/** Stable dedupe key for this specific transition. Prevents duplicate delivery. */
	dedupe_key: string;
}

/** Session identity and metadata. */
export interface SessionInfo {
	/** Session identifier (harness-specific, but stable within a session). */
	id: string;
	/** Adapter/harness adapter name (e.g., "claude-code" in agent-ctl). */
	adapter: string;
	/** Coding harness type. */
	harness: HarnessType;
	/** Working directory of the session. */
	cwd?: string;
	/** ISO 8601 timestamp when the session started. */
	started_at?: string;
	/** ISO 8601 timestamp when the session ended (terminal only). */
	ended_at?: string;
	/** Process exit status code (terminal only). */
	exit_status?: number;
}

/**
 * Normalized lifecycle payload shape.
 *
 * Connectors include this at `event.payload.lifecycle` and `event.payload.session`
 * alongside any connector-specific payload fields.
 */
export interface LifecyclePayload {
	lifecycle: LifecycleState;
	session: SessionInfo;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the correct OrgLoop event type for a lifecycle phase.
 *
 * Terminal phases map to `actor.stopped` (session ended).
 * Non-terminal phases map to `resource.changed` (state transition).
 */
export function eventTypeForPhase(phase: LifecyclePhase): OrgLoopEventType {
	return TERMINAL_PHASES.has(phase) ? 'actor.stopped' : 'resource.changed';
}

/**
 * Build a dedupe key for a lifecycle event.
 * Format: `<harness>:<session_id>:<phase>`
 */
export function buildDedupeKey(harness: string, sessionId: string, phase: LifecyclePhase): string {
	return `${harness}:${sessionId}:${phase}`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Validation error from lifecycle payload checking. */
export interface LifecycleValidationError {
	field: string;
	message: string;
}

/**
 * Validate that an event payload conforms to the lifecycle contract.
 * Returns an array of errors (empty if valid).
 */
export function validateLifecyclePayload(
	payload: Record<string, unknown>,
): LifecycleValidationError[] {
	const errors: LifecycleValidationError[] = [];

	// lifecycle object
	if (!payload.lifecycle || typeof payload.lifecycle !== 'object') {
		errors.push({ field: 'lifecycle', message: 'payload.lifecycle must be an object' });
		return errors; // can't check sub-fields
	}

	const lc = payload.lifecycle as Record<string, unknown>;

	const validPhases: LifecyclePhase[] = ['started', 'active', 'completed', 'failed', 'stopped'];
	if (typeof lc.phase !== 'string' || !validPhases.includes(lc.phase as LifecyclePhase)) {
		errors.push({
			field: 'lifecycle.phase',
			message: `must be one of: ${validPhases.join(', ')}`,
		});
	}

	if (typeof lc.terminal !== 'boolean') {
		errors.push({ field: 'lifecycle.terminal', message: 'must be a boolean' });
	}

	// terminal consistency
	const phase = lc.phase as LifecyclePhase;
	if (typeof lc.terminal === 'boolean') {
		if (TERMINAL_PHASES.has(phase) && !lc.terminal) {
			errors.push({
				field: 'lifecycle.terminal',
				message: `must be true for terminal phase "${phase}"`,
			});
		}
		if (NON_TERMINAL_PHASES.has(phase) && lc.terminal) {
			errors.push({
				field: 'lifecycle.terminal',
				message: `must be false for non-terminal phase "${phase}"`,
			});
		}
	}

	// outcome required for terminal, absent for non-terminal
	if (lc.terminal === true) {
		const validOutcomes: LifecycleOutcome[] = ['success', 'failure', 'cancelled', 'unknown'];
		if (typeof lc.outcome !== 'string' || !validOutcomes.includes(lc.outcome as LifecycleOutcome)) {
			errors.push({
				field: 'lifecycle.outcome',
				message: `required for terminal events; must be one of: ${validOutcomes.join(', ')}`,
			});
		}
	}

	if (typeof lc.dedupe_key !== 'string' || lc.dedupe_key.length === 0) {
		errors.push({ field: 'lifecycle.dedupe_key', message: 'must be a non-empty string' });
	}

	if (lc.reason !== undefined && typeof lc.reason !== 'string') {
		errors.push({ field: 'lifecycle.reason', message: 'must be a string if present' });
	}

	// session object
	if (!payload.session || typeof payload.session !== 'object') {
		errors.push({ field: 'session', message: 'payload.session must be an object' });
		return errors;
	}

	const sess = payload.session as Record<string, unknown>;

	if (typeof sess.id !== 'string' || sess.id.length === 0) {
		errors.push({ field: 'session.id', message: 'must be a non-empty string' });
	}

	if (typeof sess.adapter !== 'string' || sess.adapter.length === 0) {
		errors.push({ field: 'session.adapter', message: 'must be a non-empty string' });
	}

	const validHarnesses: HarnessType[] = [
		'claude-code',
		'codex',
		'opencode',
		'pi',
		'pi-rust',
		'other',
	];
	if (typeof sess.harness !== 'string' || !validHarnesses.includes(sess.harness as HarnessType)) {
		errors.push({
			field: 'session.harness',
			message: `must be one of: ${validHarnesses.join(', ')}`,
		});
	}

	// Optional fields type-check
	if (sess.cwd !== undefined && typeof sess.cwd !== 'string') {
		errors.push({ field: 'session.cwd', message: 'must be a string if present' });
	}
	if (sess.started_at !== undefined && typeof sess.started_at !== 'string') {
		errors.push({ field: 'session.started_at', message: 'must be an ISO 8601 string if present' });
	}
	if (sess.ended_at !== undefined && typeof sess.ended_at !== 'string') {
		errors.push({ field: 'session.ended_at', message: 'must be an ISO 8601 string if present' });
	}
	if (sess.exit_status !== undefined && typeof sess.exit_status !== 'number') {
		errors.push({ field: 'session.exit_status', message: 'must be a number if present' });
	}

	return errors;
}

/**
 * Check if an OrgLoop event conforms to the lifecycle contract.
 * Validates both the payload shape and event type consistency.
 */
export function validateLifecycleEvent(event: OrgLoopEvent): LifecycleValidationError[] {
	const errors = validateLifecyclePayload(event.payload);

	// Check event type matches phase
	if (event.payload.lifecycle && typeof event.payload.lifecycle === 'object') {
		const lc = event.payload.lifecycle as Record<string, unknown>;
		const phase = lc.phase as LifecyclePhase;
		const expectedType = eventTypeForPhase(phase);
		if (event.type !== expectedType) {
			errors.push({
				field: 'type',
				message: `event type "${event.type}" does not match phase "${phase}" (expected "${expectedType}")`,
			});
		}
	}

	return errors;
}
