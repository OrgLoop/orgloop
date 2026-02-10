import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadCliConfig } from '../config.js';

describe('config loading', () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), 'orgloop-test-'));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it('loads sources from ConnectorGroup YAML files', async () => {
		await mkdir(join(tempDir, 'connectors'), { recursive: true });
		await mkdir(join(tempDir, 'routes'), { recursive: true });

		await writeFile(
			join(tempDir, 'orgloop.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: Project
metadata:
  name: test-project
connectors:
  - connectors/github.yaml
`,
		);

		await writeFile(
			join(tempDir, 'connectors', 'github.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: ConnectorGroup
sources:
  - id: github
    connector: "@orgloop/connector-github"
    config:
      repo: test-repo
      token_env: GITHUB_TOKEN
    poll:
      interval: 5m
    emits:
      - resource.changed
`,
		);

		// Set required env var
		const origToken = process.env.GITHUB_TOKEN;
		process.env.GITHUB_TOKEN = 'test-token';

		try {
			const config = await loadCliConfig({ configPath: join(tempDir, 'orgloop.yaml') });
			expect(config.sources).toHaveLength(1);
			expect(config.sources[0].id).toBe('github');
			expect(config.sources[0].connector).toBe('@orgloop/connector-github');
			expect(config.sources[0].poll?.interval).toBe('5m');
		} finally {
			if (origToken === undefined) {
				process.env.GITHUB_TOKEN = undefined;
			} else {
				process.env.GITHUB_TOKEN = origToken;
			}
		}
	});

	it('loads actors from ConnectorGroup YAML files', async () => {
		await mkdir(join(tempDir, 'connectors'), { recursive: true });
		await mkdir(join(tempDir, 'routes'), { recursive: true });

		await writeFile(
			join(tempDir, 'orgloop.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: Project
metadata:
  name: test-project
connectors:
  - connectors/openclaw.yaml
`,
		);

		await writeFile(
			join(tempDir, 'connectors', 'openclaw.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: ConnectorGroup
actors:
  - id: openclaw-engineering-agent
    connector: "@orgloop/connector-openclaw"
    config:
      base_url: "http://127.0.0.1:18789"
      agent_id: engineering
`,
		);

		const config = await loadCliConfig({ configPath: join(tempDir, 'orgloop.yaml') });
		expect(config.actors).toHaveLength(1);
		expect(config.actors[0].id).toBe('openclaw-engineering-agent');
		expect(config.actors[0].connector).toBe('@orgloop/connector-openclaw');
	});

	it('loads transforms from TransformGroup YAML files', async () => {
		await mkdir(join(tempDir, 'transforms'), { recursive: true });
		await mkdir(join(tempDir, 'routes'), { recursive: true });

		await writeFile(
			join(tempDir, 'orgloop.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: Project
metadata:
  name: test-project
transforms:
  - transforms/transforms.yaml
`,
		);

		await writeFile(
			join(tempDir, 'transforms', 'transforms.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: TransformGroup
transforms:
  - name: drop-bot-noise
    type: package
    package: "@orgloop/transform-filter"
    config:
      exclude:
        provenance.author_type: bot
  - name: dedup
    type: package
    package: "@orgloop/transform-dedup"
    config:
      window: 5m
`,
		);

		const config = await loadCliConfig({ configPath: join(tempDir, 'orgloop.yaml') });
		expect(config.transforms).toHaveLength(2);
		expect(config.transforms[0].name).toBe('drop-bot-noise');
		expect(config.transforms[1].name).toBe('dedup');
	});

	it('loads routes from routes/ directory', async () => {
		await mkdir(join(tempDir, 'routes'), { recursive: true });

		await writeFile(
			join(tempDir, 'orgloop.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: Project
metadata:
  name: test-project
`,
		);

		await writeFile(
			join(tempDir, 'routes', 'test.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: RouteGroup
routes:
  - name: test-route
    when:
      source: github
      events:
        - resource.changed
    then:
      actor: test-actor
`,
		);

		const config = await loadCliConfig({ configPath: join(tempDir, 'orgloop.yaml') });
		expect(config.routes).toHaveLength(1);
		expect(config.routes[0].name).toBe('test-route');
		expect(config.routes[0].when.source).toBe('github');
		expect(config.routes[0].then.actor).toBe('test-actor');
	});

	it('loads loggers from LoggerGroup YAML files', async () => {
		await mkdir(join(tempDir, 'loggers'), { recursive: true });
		await mkdir(join(tempDir, 'routes'), { recursive: true });

		await writeFile(
			join(tempDir, 'orgloop.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: Project
metadata:
  name: test-project
loggers:
  - loggers/default.yaml
`,
		);

		await writeFile(
			join(tempDir, 'loggers', 'default.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: LoggerGroup
loggers:
  - name: console-log
    type: "@orgloop/logger-console"
    config:
      level: info
`,
		);

		const config = await loadCliConfig({ configPath: join(tempDir, 'orgloop.yaml') });
		expect(config.loggers).toHaveLength(1);
		expect(config.loggers[0].name).toBe('console-log');
	});

	it('handles full production-like config', async () => {
		await mkdir(join(tempDir, 'connectors'), { recursive: true });
		await mkdir(join(tempDir, 'routes'), { recursive: true });
		await mkdir(join(tempDir, 'transforms'), { recursive: true });
		await mkdir(join(tempDir, 'loggers'), { recursive: true });

		await writeFile(
			join(tempDir, 'orgloop.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: Project
metadata:
  name: engineering-org
  description: "Test full config"
defaults:
  poll_interval: 5m
connectors:
  - connectors/source.yaml
  - connectors/actor.yaml
transforms:
  - transforms/transforms.yaml
loggers:
  - loggers/default.yaml
`,
		);

		await writeFile(
			join(tempDir, 'connectors', 'source.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: ConnectorGroup
sources:
  - id: test-src
    connector: "@orgloop/connector-webhook"
    config:
      path: /webhook
`,
		);

		await writeFile(
			join(tempDir, 'connectors', 'actor.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: ConnectorGroup
actors:
  - id: test-act
    connector: "@orgloop/connector-webhook"
    config:
      url: http://localhost:8080
`,
		);

		await writeFile(
			join(tempDir, 'transforms', 'transforms.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: TransformGroup
transforms:
  - name: filter
    type: script
    script: ./filter.sh
`,
		);

		await writeFile(
			join(tempDir, 'loggers', 'default.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: LoggerGroup
loggers:
  - name: log
    type: "@orgloop/logger-console"
    config:
      level: info
`,
		);

		await writeFile(
			join(tempDir, 'routes', 'main.yaml'),
			`apiVersion: orgloop/v1alpha1
kind: RouteGroup
routes:
  - name: main-route
    when:
      source: test-src
      events:
        - resource.changed
    then:
      actor: test-act
`,
		);

		const config = await loadCliConfig({ configPath: join(tempDir, 'orgloop.yaml') });

		expect(config.project.name).toBe('engineering-org');
		expect(config.sources).toHaveLength(1);
		expect(config.actors).toHaveLength(1);
		expect(config.routes).toHaveLength(1);
		expect(config.transforms).toHaveLength(1);
		expect(config.loggers).toHaveLength(1);
	});

	it('throws on missing config file', async () => {
		await expect(loadCliConfig({ configPath: join(tempDir, 'nonexistent.yaml') })).rejects.toThrow(
			/not found/,
		);
	});
});
