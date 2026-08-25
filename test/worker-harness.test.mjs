import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTestHarness } from 'wrangler';

import { signedSessionCookie, TEST_SESSION_SECRET } from './support/session.mjs';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, '..');
const harness = createTestHarness({
	root: projectRoot,
	workers: [
		{
			configPath: './dist/server/wrangler.json',
			secrets: { SESSION_SECRET: TEST_SESSION_SECRET },
		},
	],
});

const worker = harness.getWorker();

describe('production Worker test seam', { concurrency: false }, () => {
	before(async () => {
		await harness.listen();
	});

	afterEach(async () => {
		await harness.reset();
	});

	after(async () => {
		await harness.close();
	});

	test('serves the public page and static assets anonymously', async () => {
		const response = await harness.fetch('/');
		assert.equal(response.status, 200);
		const body = await response.text();
		assert.match(body, /类脑 Odysseia - 道馆挑战/u);

		const asset = await harness.fetch('/favicon.svg');
		assert.equal(asset.status, 200);
		assert.match(asset.headers.get('content-type') ?? '', /^image\/svg\+xml/u);
	});

	test('routes the provisional authentication endpoint through the deployed Worker', async () => {
		const response = await harness.fetch('/api/auth/discord');
		assert.equal(response.status, 501);
		assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.match(await response.text(), /not configured yet/u);
	});

	test('fails closed for anonymous protected document and resource requests', async () => {
		const document = await harness.fetch('/docs/tutorials/discord-and-odysseia/', { redirect: 'manual' });
		assert.equal(document.status, 302);
		assert.equal(
			document.headers.get('location'),
			'/login?returnTo=%2Fdocs%2Ftutorials%2Fdiscord-and-odysseia%2F'
		);
		assert.equal(document.headers.get('cache-control'), 'no-store');

		const resource = await harness.fetch('/protected/tutorial-images/fixture-api-settings.svg');
		assert.equal(resource.status, 401);
		assert.equal(resource.headers.get('cache-control'), 'no-store');
		assert.doesNotMatch(await resource.text(), /fixture-api-settings/u);
	});

	test('serves protected fixture output only for a token accepted by the production verifier', async () => {
		const cookie = await signedSessionCookie();
		const headers = { Cookie: cookie };

		const document = await harness.fetch('/docs/tutorials/discord-and-odysseia/', { headers });
		assert.equal(document.status, 200);
		assert.match(document.headers.get('content-type') ?? '', /^text\/html/u);
		assert.equal(document.headers.get('cache-control'), 'private, no-store, max-age=0');
		assert.match(await document.text(), /Discord/u);

		const resource = await harness.fetch('/protected/tutorial-images/fixture-api-settings.svg', { headers });
		assert.equal(resource.status, 200);
		assert.equal(resource.headers.get('cache-control'), 'private, no-store, max-age=0');
		assert.match(await resource.text(), /<svg/u);
	});

	test('rejects a tampered token before static assets are fetched', async () => {
		const cookie = `${await signedSessionCookie()}tampered`;
		const response = await harness.fetch('/protected/attachments/fixture-reading-checklist.txt', {
			headers: { Cookie: cookie },
		});

		assert.equal(response.status, 401);
		assert.equal(response.headers.get('cache-control'), 'no-store');
		assert.doesNotMatch(await response.text(), /Fixture protected attachment/u);
	});

	test('provides isolated D1 and invokes the deployed scheduled entrypoint', async () => {
		const result = await worker.scheduled({
			cron: '0 0 * * *',
			scheduledTime: new Date('2026-08-26T00:00:00.000Z'),
		});
		assert.equal(result.outcome, 'ok');

		const env = await worker.getEnv();
		await env.DB.prepare('CREATE TABLE seam_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
		await env.DB.prepare('INSERT INTO seam_state (key, value) VALUES (?, ?)')
			.bind('scheduled-entrypoint', 'available')
			.run();
		const row = await env.DB.prepare('SELECT value FROM seam_state WHERE key = ?')
			.bind('scheduled-entrypoint')
			.first();
		assert.equal(row?.value, 'available');
	});

	test('keeps future Discord egress controllable without contacting Discord', async () => {
		const originalFetch = globalThis.fetch;
		const observedRequests = [];
		globalThis.fetch = async (input, init) => {
			const request = new Request(input, init);
			observedRequests.push({ url: request.url, authorization: request.headers.get('authorization') });
			return new Response(JSON.stringify({ id: 'test-discord-member' }), {
				headers: { 'content-type': 'application/json' },
			});
		};

		const outboundHarness = createTestHarness({
			root: projectRoot,
			workers: [
				{
					config: {
						name: 'discord-outbound-boundary',
						main: './test/fixtures/discord-outbound-worker.mjs',
						compatibility_date: '2026-08-20',
					},
				},
			],
		});

		try {
			await outboundHarness.listen();
			const response = await outboundHarness.fetch('/probe');
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), {
				status: 200,
				body: JSON.stringify({ id: 'test-discord-member' }),
			});
			assert.deepEqual(observedRequests, [
				{
					url: 'https://discord.com/api/v10/users/@me',
					authorization: 'Bearer test-only-token',
				},
			]);
		} finally {
			await outboundHarness.close();
			globalThis.fetch = originalFetch;
		}
	});
});
