import { describe, expect, it } from 'vitest';
import {
	buildClaudeCodeHookEntry,
	hasExistingOrgloopHook,
	mergeClaudeCodeHook,
} from '../commands/init.js';

describe('Claude Code hook format', () => {
	const hookCommand = 'orgloop hook claude-code-stop';

	describe('buildClaudeCodeHookEntry', () => {
		it('produces the object format expected by Claude Code', () => {
			const entry = buildClaudeCodeHookEntry(hookCommand);
			expect(entry).toEqual({
				matcher: '',
				hooks: [{ type: 'command', command: hookCommand }],
			});
		});

		it('has a matcher field (empty string matches all)', () => {
			const entry = buildClaudeCodeHookEntry(hookCommand);
			expect(entry).toHaveProperty('matcher', '');
		});

		it('inner hook has type "command"', () => {
			const entry = buildClaudeCodeHookEntry(hookCommand);
			expect(entry.hooks[0].type).toBe('command');
		});
	});

	describe('hasExistingOrgloopHook', () => {
		it('returns false for empty array', () => {
			expect(hasExistingOrgloopHook([])).toBe(false);
		});

		it('detects orgloop hook in object format', () => {
			const hooks = [buildClaudeCodeHookEntry(hookCommand)];
			expect(hasExistingOrgloopHook(hooks)).toBe(true);
		});

		it('ignores non-orgloop hooks', () => {
			const hooks = [{ matcher: '', hooks: [{ type: 'command', command: 'some-other-tool' }] }];
			expect(hasExistingOrgloopHook(hooks)).toBe(false);
		});

		it('returns false for plain strings (old format)', () => {
			const hooks = ['orgloop hook claude-code-stop'];
			expect(hasExistingOrgloopHook(hooks)).toBe(false);
		});

		it('handles mixed entries', () => {
			const hooks = [
				{ matcher: '', hooks: [{ type: 'command', command: 'other-tool' }] },
				buildClaudeCodeHookEntry(hookCommand),
			];
			expect(hasExistingOrgloopHook(hooks)).toBe(true);
		});
	});

	describe('mergeClaudeCodeHook', () => {
		it('adds hook to empty settings', () => {
			const { settings, alreadyInstalled } = mergeClaudeCodeHook({}, hookCommand);
			expect(alreadyInstalled).toBe(false);
			const stopHooks = (settings.hooks as Record<string, unknown[]>).Stop;
			expect(stopHooks).toHaveLength(1);
			expect(stopHooks[0]).toEqual(buildClaudeCodeHookEntry(hookCommand));
		});

		it('preserves existing non-orgloop hooks', () => {
			const existingHook = {
				matcher: '',
				hooks: [{ type: 'command', command: 'other-tool run' }],
			};
			const initial = {
				hooks: { Stop: [existingHook] },
			};
			const { settings, alreadyInstalled } = mergeClaudeCodeHook(initial, hookCommand);
			expect(alreadyInstalled).toBe(false);
			const stopHooks = (settings.hooks as Record<string, unknown[]>).Stop;
			expect(stopHooks).toHaveLength(2);
			expect(stopHooks[0]).toEqual(existingHook);
			expect(stopHooks[1]).toEqual(buildClaudeCodeHookEntry(hookCommand));
		});

		it('detects already-installed hook and skips', () => {
			const initial = {
				hooks: { Stop: [buildClaudeCodeHookEntry(hookCommand)] },
			};
			const { alreadyInstalled } = mergeClaudeCodeHook(initial, hookCommand);
			expect(alreadyInstalled).toBe(true);
		});

		it('preserves other settings keys', () => {
			const initial = {
				allowedTools: ['Bash', 'Read'],
				hooks: { PreToolUse: [] as unknown[] },
			};
			const { settings } = mergeClaudeCodeHook(initial, hookCommand);
			expect(settings.allowedTools).toEqual(['Bash', 'Read']);
			expect((settings.hooks as Record<string, unknown[]>).PreToolUse).toEqual([]);
		});

		it('produces valid JSON that matches Claude Code expected format', () => {
			const { settings } = mergeClaudeCodeHook({}, hookCommand);
			const json = JSON.parse(JSON.stringify(settings));
			const stop = json.hooks.Stop;
			expect(stop).toHaveLength(1);
			expect(stop[0].matcher).toBe('');
			expect(stop[0].hooks).toHaveLength(1);
			expect(stop[0].hooks[0].type).toBe('command');
			expect(stop[0].hooks[0].command).toBe(hookCommand);
		});
	});
});
