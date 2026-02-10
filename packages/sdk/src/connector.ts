/**
 * Connector interfaces — the contract between OrgLoop and external systems.
 *
 * Connectors bridge the gap between OrgLoop's event model and specific platforms.
 * A connector can provide a source (inbound events), a target (outbound delivery), or both.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ActorConfig, OrgLoopEvent, RouteDeliveryConfig, SourceConfig } from './types.js';

// ─── Source Connector ─────────────────────────────────────────────────────────

/** Result of a poll operation */
export interface PollResult {
	/** Events discovered since the last checkpoint */
	events: OrgLoopEvent[];
	/** Opaque checkpoint string for crash recovery */
	checkpoint: string;
}

/** HTTP request handler for webhook-based sources */
export type WebhookHandler = (req: IncomingMessage, res: ServerResponse) => Promise<OrgLoopEvent[]>;

/**
 * Source connector interface.
 *
 * Implement this to create a new event source for OrgLoop.
 * Sources can be poll-based (the runtime calls poll() on a schedule)
 * or webhook-based (the runtime mounts a webhook handler).
 */
export interface SourceConnector {
	/** Unique connector ID */
	readonly id: string;

	/** Initialize with user-provided config */
	init(config: SourceConfig): Promise<void>;

	/**
	 * Poll for new events since the last checkpoint.
	 * The runtime calls this on the configured interval.
	 * Return an array of normalized OrgLoop events.
	 */
	poll(checkpoint: string | null): Promise<PollResult>;

	/**
	 * Optional: Register a webhook handler.
	 * Return a request handler the server will mount.
	 * For push-based sources.
	 */
	webhook?(): WebhookHandler;

	/** Clean shutdown */
	shutdown(): Promise<void>;
}

// ─── Actor (Target) Connector ─────────────────────────────────────────────────

/** Result of a delivery operation */
export interface DeliveryResult {
	/** Delivery status */
	status: 'delivered' | 'rejected' | 'error';
	/** If the actor produces a response event, return it */
	responseEvent?: OrgLoopEvent;
	/** Error details if status is 'error' */
	error?: Error;
}

/**
 * Actor (target) connector interface.
 *
 * Implement this to create a new delivery target for OrgLoop.
 * Actors receive events when routes match.
 */
export interface ActorConnector {
	/** Unique connector ID */
	readonly id: string;

	/** Initialize with user-provided config */
	init(config: ActorConfig): Promise<void>;

	/**
	 * Deliver an event to this actor.
	 * routeConfig includes actor-specific config from then.config
	 * plus the resolved launch prompt (if the route has with).
	 */
	deliver(event: OrgLoopEvent, routeConfig: RouteDeliveryConfig): Promise<DeliveryResult>;

	/** Clean shutdown */
	shutdown(): Promise<void>;
}

// ─── Stage 2: Credential Validation & Service Detection ──────────────────────

/**
 * Validates that a credential value actually works against the external service.
 *
 * Stage 2 connector maturity — goes beyond checking if an env var is set
 * to verifying it authenticates successfully and reporting identity/scopes.
 */
export interface CredentialValidator {
	validate(value: string): Promise<{
		valid: boolean;
		/** Identity associated with the credential (e.g., "user: @alice") */
		identity?: string;
		/** Permission scopes granted (e.g., ["repo", "read:org"]) */
		scopes?: string[];
		/** Error message if validation failed */
		error?: string;
	}>;
}

/**
 * Detects whether an external service is running and reachable.
 *
 * Stage 2 connector maturity — used by `orgloop doctor` to report service
 * availability. External tools (e.g., orgctl) can also consume this interface.
 */
export interface ServiceDetector {
	detect(): Promise<{
		running: boolean;
		version?: string;
		endpoint?: string;
		details?: Record<string, unknown>;
	}>;
}

// ─── Connector Registration ──────────────────────────────────────────────────

/**
 * Connector registration — what a connector package exports.
 *
 * A connector package's default export is a function that returns this object.
 * The runtime calls it once at startup to discover the connector's capabilities.
 */
export interface ConnectorRegistration {
	/** Unique connector ID */
	id: string;
	/** Source connector class (if this connector can be a source) */
	source?: new () => SourceConnector;
	/** Target/actor connector class (if this connector can be a target) */
	target?: new () => ActorConnector;
	/** JSON Schema for config validation */
	configSchema?: Record<string, unknown>;
	/** Setup metadata for onboarding — env vars, integration steps, etc. */
	setup?: ConnectorSetup;

	// Stage 2: discoverable
	/** Service detector for checking if external services are running */
	service_detector?: ServiceDetector;
	/** Credential validators keyed by env var name (e.g., "GITHUB_TOKEN") */
	credential_validators?: Record<string, CredentialValidator>;
}

/**
 * Rich definition for an environment variable required by a connector.
 *
 * Provides metadata that the CLI uses to guide users through setup —
 * descriptions, help URLs, and commands to create/acquire credentials.
 */
export interface EnvVarDefinition {
	/** Environment variable name */
	name: string;
	/** Human-readable description of what this var is for */
	description: string;
	/** URL where the user can get/create this credential */
	help_url?: string;
	/** Command to run that helps set up this variable */
	help_command?: string;
	/** Whether this var is required (default: true) */
	required?: boolean;
}

/**
 * Connector setup metadata.
 *
 * Declarative onboarding information that the CLI can use to guide users
 * through connector installation. This is pure metadata — the CLI decides
 * how to act on it.
 */
export interface ConnectorSetup {
	/** Environment variables required by this connector (string or rich definition) */
	env_vars?: (string | EnvVarDefinition)[];
	/**
	 * External integration steps required for this connector to function.
	 * Each entry describes one integration the user needs to configure
	 * outside of OrgLoop (e.g., registering a webhook, installing a hook
	 * in another tool, creating an API token).
	 */
	integrations?: ConnectorIntegration[];
}

/** An external integration step required by a connector. */
export interface ConnectorIntegration {
	/** Short identifier (e.g., "claude-code-hook", "github-webhook") */
	id: string;
	/** Human-readable description of what needs to be configured */
	description: string;
	/** The tool/platform this integration targets (e.g., "claude-code", "github", "slack") */
	platform: string;
	/** Optional: a command that can automate the setup */
	command?: string;
}
