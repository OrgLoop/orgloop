/**
 * agent-ctl source connector — polls agent-ctl CLI for session lifecycle events.
 *
 * Shells out to `agent-ctl list --json` on each poll, diffs against the previous
 * state, and emits session.started / session.stopped / session.idle / session.error events.
 */

import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import type { PollResult, SourceConfig, SourceConnector } from '@orgloop/sdk';
import { buildEvent } from '@orgloop/sdk';

const execFileAsync = promisify(execFile);

/** Shape returned by `agent-ctl list --json` */
export interface AgentSession {
	id: string;
	adapter: string;
	status: 'running' | 'idle' | 'stopped' | 'error';
	startedAt: string;
	stoppedAt?: string;
	cwd?: string;
	spec?: string;
	model?: string;
	tokens?: { in: number; out: number };
	cost?: number;
	pid?: number;
	meta: Record<string, unknown>;
}

/** Shape of NDJSON lines from `agent-ctl events --json` */
export interface AgentCtlEvent {
	type: 'session.started' | 'session.stopped' | 'session.idle' | 'session.error';
	adapter: string;
	sessionId: string;
	session: AgentSession;
	timestamp: string;
}

interface AgentCtlSourceConfig {
	/** Path to the agent-ctl binary */
	binary_path?: string;
	/** Timeout in ms for CLI invocations (default: 10000) */
	timeout?: number;
}

/** Resolve env var references like ${VAR_NAME} */
function resolveEnvVar(value: string): string {
	const match = value.match(/^\$\{(.+)\}$/);
	if (match) {
		const envValue = process.env[match[1]];
		if (!envValue) {
			throw new Error(`Environment variable ${match[1]} is not set`);
		}
		return envValue;
	}
	return value;
}

export type ExecFn = (
	cmd: string,
	args: string[],
	opts: { timeout: number },
) => Promise<{ stdout: string; stderr: string }>;

export class AgentCtlSource implements SourceConnector {
	readonly id = 'agent-ctl';
	private binaryPath = `${homedir()}/personal/agent-ctl/agent-ctl`;
	private timeout = 10_000;
	private previousState = new Map<string, AgentSession>();
	private sourceId = 'agent-ctl';
	private execFn: ExecFn = execFileAsync;

	async init(config: SourceConfig): Promise<void> {
		this.sourceId = config.id;
		const cfg = config.config as unknown as AgentCtlSourceConfig;

		if (cfg.binary_path) {
			let resolved = resolveEnvVar(cfg.binary_path);
			if (resolved.startsWith('~/')) {
				resolved = resolved.replace('~', homedir());
			}
			this.binaryPath = resolved;
		}

		if (cfg.timeout) {
			this.timeout = cfg.timeout;
		}
	}

	/** Inject a custom exec function (for testing) */
	setExecFn(fn: ExecFn): void {
		this.execFn = fn;
	}

	async poll(checkpoint: string | null): Promise<PollResult> {
		const sessions = await this.listSessions();
		const currentState = new Map(sessions.map((s) => [s.id, s]));
		const events = this.diffState(currentState);

		this.previousState = currentState;

		return {
			events,
			checkpoint: new Date().toISOString(),
		};
	}

	async shutdown(): Promise<void> {
		this.previousState.clear();
	}

	private async listSessions(): Promise<AgentSession[]> {
		try {
			const { stdout } = await this.execFn(this.binaryPath, ['list', '--json'], {
				timeout: this.timeout,
			});
			const parsed = JSON.parse(stdout.trim());
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			// agent-ctl not available or errored — return empty, will retry next poll
			return [];
		}
	}

	private diffState(current: Map<string, AgentSession>) {
		const events = [];

		// New sessions or status changes
		for (const [id, session] of current) {
			const prev = this.previousState.get(id);

			if (!prev) {
				// New session appeared
				if (session.status === 'running' || session.status === 'idle') {
					events.push(this.buildSessionEvent('session.started', session));
				} else if (session.status === 'stopped') {
					events.push(this.buildSessionEvent('session.stopped', session));
				} else if (session.status === 'error') {
					events.push(this.buildSessionEvent('session.error', session));
				}
			} else if (prev.status !== session.status) {
				// Status changed
				if (session.status === 'stopped') {
					events.push(this.buildSessionEvent('session.stopped', session));
				} else if (session.status === 'error') {
					events.push(this.buildSessionEvent('session.error', session));
				} else if (session.status === 'idle' && prev.status === 'running') {
					events.push(this.buildSessionEvent('session.idle', session));
				} else if (session.status === 'running' && prev.status !== 'running') {
					events.push(this.buildSessionEvent('session.started', session));
				}
			}
		}

		// Sessions that disappeared — treat as stopped
		for (const [id, prev] of this.previousState) {
			if (!current.has(id) && prev.status !== 'stopped') {
				events.push(this.buildSessionEvent('session.stopped', { ...prev, status: 'stopped' }));
			}
		}

		return events;
	}

	private buildSessionEvent(eventType: AgentCtlEvent['type'], session: AgentSession) {
		return buildEvent({
			source: this.sourceId,
			type: 'resource.changed',
			provenance: {
				platform: 'agent-ctl',
				platform_event: eventType,
				author: session.adapter,
				author_type: 'bot',
			},
			payload: {
				action: eventType,
				session_id: session.id,
				adapter: session.adapter,
				status: session.status,
				started_at: session.startedAt,
				stopped_at: session.stoppedAt,
				cwd: session.cwd,
				spec: session.spec,
				model: session.model,
				tokens: session.tokens,
				cost: session.cost,
				pid: session.pid,
				meta: session.meta,
			},
		});
	}
}
