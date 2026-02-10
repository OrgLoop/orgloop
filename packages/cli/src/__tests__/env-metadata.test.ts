import { describe, expect, it } from 'vitest';
import { getEnvVarMeta } from '../env-metadata.js';

describe('getEnvVarMeta', () => {
	it('returns metadata for known variables', () => {
		const meta = getEnvVarMeta('GITHUB_TOKEN');
		expect(meta).toBeDefined();
		expect(meta?.description).toContain('GitHub');
		expect(meta?.help_url).toContain('github.com');
	});

	it('returns metadata with help_url for LINEAR_API_KEY', () => {
		const meta = getEnvVarMeta('LINEAR_API_KEY');
		expect(meta).toBeDefined();
		expect(meta?.help_url).toContain('linear.app');
	});

	it('returns undefined for unknown variables', () => {
		expect(getEnvVarMeta('UNKNOWN_VAR')).toBeUndefined();
	});

	it('covers all connectors', () => {
		for (const name of [
			'GITHUB_TOKEN',
			'GITHUB_REPO',
			'LINEAR_API_KEY',
			'LINEAR_TEAM_KEY',
			'OPENCLAW_WEBHOOK_TOKEN',
			'OPENCLAW_AGENT_ID',
			'SLACK_WEBHOOK_URL',
			'PAGERDUTY_WEBHOOK_URL',
		]) {
			expect(getEnvVarMeta(name)).toBeDefined();
		}
	});
});
