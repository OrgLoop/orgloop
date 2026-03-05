/**
 * Claude Code source connector — backward-compatible re-export.
 *
 * The implementation has moved to @orgloop/connector-coding-agent.
 * This module re-exports the generalized CodingAgentSource as ClaudeCodeSource
 * for backward compatibility.
 */

export type {
	CodingAgentSessionPayload as ClaudeCodeSessionPayload,
	CodingAgentSourceConfig as ClaudeCodeSourceConfig,
} from '@orgloop/connector-coding-agent';
export { CodingAgentSource as ClaudeCodeSource } from '@orgloop/connector-coding-agent';
