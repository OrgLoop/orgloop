/**
 * Poll scheduling.
 *
 * Schedules poll operations for sources based on their configured intervals.
 * Graceful start/stop with interval cleanup.
 */

import { parseDuration } from '@orgloop/sdk';

export type PollCallback = (sourceId: string) => Promise<void>;

interface ScheduledSource {
	sourceId: string;
	intervalMs: number;
	timer: ReturnType<typeof setInterval> | null;
}

export class Scheduler {
	private readonly sources: ScheduledSource[] = [];
	private running = false;
	private pollCallback: PollCallback | null = null;

	/**
	 * Register a source to be polled at the given interval.
	 */
	addSource(sourceId: string, interval: string): void {
		const intervalMs = parseDuration(interval);
		this.sources.push({ sourceId, intervalMs, timer: null });
	}

	/**
	 * Start polling all registered sources.
	 */
	start(callback: PollCallback): void {
		if (this.running) return;
		this.running = true;
		this.pollCallback = callback;

		for (const source of this.sources) {
			// Run first poll immediately
			void this.safePoll(source.sourceId);
			// Then schedule recurring polls
			source.timer = setInterval(() => {
				void this.safePoll(source.sourceId);
			}, source.intervalMs);
		}
	}

	private async safePoll(sourceId: string): Promise<void> {
		if (!this.pollCallback) return;
		try {
			await this.pollCallback(sourceId);
		} catch {
			// Errors handled upstream; scheduler keeps going
		}
	}

	/**
	 * Stop all scheduled polls.
	 */
	stop(): void {
		this.running = false;
		for (const source of this.sources) {
			if (source.timer) {
				clearInterval(source.timer);
				source.timer = null;
			}
		}
	}

	get isRunning(): boolean {
		return this.running;
	}
}
