import { describe, expect, it } from 'vitest';
import { buildEnvExampleContent, collectEnvVars } from '../commands/init.js';

describe('orgloop init — .env.example generation', () => {
	describe('collectEnvVars', () => {
		it('collects env vars from github connector', () => {
			const vars = collectEnvVars(['github']);
			expect(vars.has('GITHUB_REPO')).toBe(true);
			expect(vars.has('GITHUB_TOKEN')).toBe(true);
			expect(vars.get('GITHUB_REPO')).toBe('connectors/github.yaml');
		});

		it('collects env vars from multiple connectors', () => {
			const vars = collectEnvVars(['github', 'linear', 'openclaw']);
			expect(vars.has('GITHUB_TOKEN')).toBe(true);
			expect(vars.has('LINEAR_API_KEY')).toBe(true);
			expect(vars.has('OPENCLAW_WEBHOOK_TOKEN')).toBe(true);
			expect(vars.has('OPENCLAW_AGENT_ID')).toBe(true);
		});

		it('returns empty map for connectors without env vars', () => {
			const vars = collectEnvVars(['claude-code']);
			expect(vars.size).toBe(0);
		});

		it('collects env vars from actor connectors', () => {
			const vars = collectEnvVars(['slack', 'pagerduty']);
			expect(vars.has('SLACK_WEBHOOK_URL')).toBe(true);
			expect(vars.has('PAGERDUTY_WEBHOOK_URL')).toBe(true);
		});
	});

	describe('buildEnvExampleContent', () => {
		it('includes header comments', () => {
			const vars = new Map([['GITHUB_TOKEN', 'connectors/github.yaml']]);
			const content = buildEnvExampleContent(vars);
			expect(content).toContain('# OrgLoop environment variables');
			expect(content).toContain('# Copy to .env and fill in values');
		});

		it('includes var name as commented-out assignment', () => {
			const vars = new Map([['GITHUB_TOKEN', 'connectors/github.yaml']]);
			const content = buildEnvExampleContent(vars);
			expect(content).toContain('# GITHUB_TOKEN=');
		});

		it('includes description from env metadata', () => {
			const vars = new Map([['GITHUB_TOKEN', 'connectors/github.yaml']]);
			const content = buildEnvExampleContent(vars);
			expect(content).toContain('# GitHub personal access token with repo scope');
		});

		it('includes help_url from env metadata', () => {
			const vars = new Map([['GITHUB_TOKEN', 'connectors/github.yaml']]);
			const content = buildEnvExampleContent(vars);
			expect(content).toContain('# https://github.com/settings/tokens/new?scopes=repo');
		});

		it('includes metadata for Linear vars', () => {
			const vars = new Map([['LINEAR_API_KEY', 'connectors/linear.yaml']]);
			const content = buildEnvExampleContent(vars);
			expect(content).toContain('# Linear API key for reading issues and comments');
			expect(content).toContain('# https://linear.app/settings/api');
		});

		it('handles vars without metadata gracefully', () => {
			const vars = new Map([['UNKNOWN_VAR', 'connectors/unknown.yaml']]);
			const content = buildEnvExampleContent(vars);
			expect(content).toContain('# UNKNOWN_VAR=');
			// Should not throw
		});

		it('generates correct content for engineering connector vars', () => {
			const vars = collectEnvVars(['github', 'linear', 'openclaw']);
			const content = buildEnvExampleContent(vars);
			expect(content).toContain('# GITHUB_REPO=');
			expect(content).toContain('# GITHUB_TOKEN=');
			expect(content).toContain('# LINEAR_TEAM_KEY=');
			expect(content).toContain('# LINEAR_API_KEY=');
			expect(content).toContain('# OPENCLAW_WEBHOOK_TOKEN=');
			expect(content).toContain('# OPENCLAW_AGENT_ID=');
		});
	});
});
