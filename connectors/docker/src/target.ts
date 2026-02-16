/**
 * Docker actor (target) connector — controls Docker containers and Kind clusters.
 *
 * Supported actions (via route config `action` field):
 *   - cluster.shutdown  — kind delete cluster --name <clusterName>
 *   - cluster.start     — kind create cluster --name <clusterName> [--config <configPath>]
 *   - container.stop    — docker stop <containerName>
 *   - container.start   — docker start <containerName>
 *
 * Supports a `delay` option (seconds) for deferred execution.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
	ActorConfig,
	ActorConnector,
	DeliveryResult,
	OrgLoopEvent,
	RouteDeliveryConfig,
} from '@orgloop/sdk';

const execFileAsync = promisify(execFile);

type DockerAction = 'cluster.shutdown' | 'cluster.start' | 'container.stop' | 'container.start';

const VALID_ACTIONS = new Set<DockerAction>([
	'cluster.shutdown',
	'cluster.start',
	'container.stop',
	'container.start',
]);

interface DockerTargetConfig {
	/** Default cluster name for Kind operations */
	cluster_name?: string;
	/** Default container name for Docker operations */
	container_name?: string;
	/** Path to Kind cluster config file */
	config_path?: string;
	/** Execution timeout in ms (default: 60000) */
	timeout?: number;
}

export type ExecFn = (
	cmd: string,
	args: string[],
	opts: { timeout: number },
) => Promise<{ stdout: string; stderr: string }>;

export class DockerTarget implements ActorConnector {
	readonly id = 'docker';
	private clusterName?: string;
	private containerName?: string;
	private configPath?: string;
	private timeout = 60_000;
	private execFn: ExecFn = execFileAsync;

	async init(config: ActorConfig): Promise<void> {
		const cfg = config.config as unknown as DockerTargetConfig;
		this.clusterName = cfg.cluster_name;
		this.containerName = cfg.container_name;
		this.configPath = cfg.config_path;
		if (cfg.timeout) {
			this.timeout = cfg.timeout;
		}
	}

	/** Inject a custom exec function (for testing) */
	setExecFn(fn: ExecFn): void {
		this.execFn = fn;
	}

	async deliver(event: OrgLoopEvent, routeConfig: RouteDeliveryConfig): Promise<DeliveryResult> {
		const action = (routeConfig.action as string) ?? (event.payload.action as string);
		if (!action || !VALID_ACTIONS.has(action as DockerAction)) {
			return {
				status: 'rejected',
				error: new Error(
					`Invalid or missing action: "${action}". Must be one of: ${[...VALID_ACTIONS].join(', ')}`,
				),
			};
		}

		const delay = Number(routeConfig.delay ?? event.payload.delay ?? 0);
		if (delay > 0) {
			await new Promise((resolve) => setTimeout(resolve, delay * 1000));
		}

		try {
			switch (action as DockerAction) {
				case 'cluster.shutdown':
					return await this.clusterShutdown(routeConfig, event);
				case 'cluster.start':
					return await this.clusterStart(routeConfig, event);
				case 'container.stop':
					return await this.containerStop(routeConfig, event);
				case 'container.start':
					return await this.containerStart(routeConfig, event);
				default:
					return { status: 'rejected', error: new Error(`Unknown action: ${action}`) };
			}
		} catch (err) {
			return {
				status: 'error',
				error: err instanceof Error ? err : new Error(String(err)),
			};
		}
	}

	async shutdown(): Promise<void> {
		// Nothing to clean up
	}

	private resolveClusterName(routeConfig: RouteDeliveryConfig, event: OrgLoopEvent): string {
		return (
			(routeConfig.cluster_name as string) ??
			(event.payload.cluster_name as string) ??
			this.clusterName ??
			'kind'
		);
	}

	private resolveContainerName(
		routeConfig: RouteDeliveryConfig,
		event: OrgLoopEvent,
	): string | undefined {
		return (
			(routeConfig.container_name as string) ??
			(event.payload.container_name as string) ??
			this.containerName
		);
	}

	private async clusterShutdown(
		routeConfig: RouteDeliveryConfig,
		event: OrgLoopEvent,
	): Promise<DeliveryResult> {
		const name = this.resolveClusterName(routeConfig, event);
		await this.execFn('kind', ['delete', 'cluster', '--name', name], { timeout: this.timeout });
		return { status: 'delivered' };
	}

	private async clusterStart(
		routeConfig: RouteDeliveryConfig,
		event: OrgLoopEvent,
	): Promise<DeliveryResult> {
		const name = this.resolveClusterName(routeConfig, event);
		const args = ['create', 'cluster', '--name', name];
		const cfgPath =
			(routeConfig.config_path as string) ??
			(event.payload.config_path as string) ??
			this.configPath;
		if (cfgPath) {
			args.push('--config', cfgPath);
		}
		await this.execFn('kind', args, { timeout: this.timeout });
		return { status: 'delivered' };
	}

	private async containerStop(
		routeConfig: RouteDeliveryConfig,
		event: OrgLoopEvent,
	): Promise<DeliveryResult> {
		const name = this.resolveContainerName(routeConfig, event);
		if (!name) {
			return {
				status: 'rejected',
				error: new Error('container.stop requires a container_name'),
			};
		}
		await this.execFn('docker', ['stop', name], { timeout: this.timeout });
		return { status: 'delivered' };
	}

	private async containerStart(
		routeConfig: RouteDeliveryConfig,
		event: OrgLoopEvent,
	): Promise<DeliveryResult> {
		const name = this.resolveContainerName(routeConfig, event);
		if (!name) {
			return {
				status: 'rejected',
				error: new Error('container.start requires a container_name'),
			};
		}
		await this.execFn('docker', ['start', name], { timeout: this.timeout });
		return { status: 'delivered' };
	}
}
