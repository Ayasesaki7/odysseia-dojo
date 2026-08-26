import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createTestHarness } from 'wrangler';
import { decodeJwt } from 'jose';

import { signedSessionCookie, TEST_SESSION_SECRET } from './support/session.mjs';

const TEST_DISCORD_CLIENT_ID = 'test-discord-client-id';
const TEST_DISCORD_CLIENT_SECRET = 'test-discord-client-secret';
const TEST_DISCORD_REDIRECT_URI = 'https://dojo.test/api/auth/callback';
const TEST_DISCORD_GUILD_ID = '1134557553011998840';
const TEST_DISCORD_ACCESS_TOKEN = 'test-discord-access-token';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, '..');
const harness = createTestHarness({
	root: projectRoot,
	workers: [
			{
				configPath: './dist/server/wrangler.json',
				secrets: {
					SESSION_SECRET: TEST_SESSION_SECRET,
					DISCORD_CLIENT_ID: TEST_DISCORD_CLIENT_ID,
					DISCORD_CLIENT_SECRET: TEST_DISCORD_CLIENT_SECRET,
					DISCORD_REDIRECT_URI: TEST_DISCORD_REDIRECT_URI,
					DISCORD_GUILD_ID: TEST_DISCORD_GUILD_ID,
				},
			},
	],
});

const worker = harness.getWorker();
let harnessUrl;

function responseCookies(response) {
	if (typeof response.headers.getSetCookie === 'function') return response.headers.getSetCookie();
	const header = response.headers.get('set-cookie');
	return header ? header.split(/,(?=\s*[^;\s]+=)/u) : [];
}

function responseCookie(response, name) {
	const cookie = responseCookies(response).find((value) => value.startsWith(`${name}=`));
	assert.ok(cookie, `Expected ${name} to be set.`);
	return cookie;
}

function cookiePair(cookie) {
	return cookie.split(';', 1)[0];
}

function cookieValue(cookie) {
	return decodeURIComponent(cookiePair(cookie).slice(cookiePair(cookie).indexOf('=') + 1));
}

function locationPath(response) {
	const location = response.headers.get('location');
	assert.ok(location, 'Expected a redirect location.');
	const url = new URL(location, 'https://worker.test');
	return `${url.pathname}${url.search}${url.hash}`;
}

async function beginOAuth(returnTo = '/docs/tutorials/') {
	const url = new URL('https://worker.test/api/auth/discord');
	url.searchParams.set('returnTo', returnTo);
	const response = await harness.fetch(`${url.pathname}${url.search}`, { redirect: 'manual' });
	assert.equal(response.status, 302);
	const authorizationUrl = new URL(response.headers.get('location'));
	const state = authorizationUrl.searchParams.get('state');
	assert.ok(state, 'OAuth authorization URL must include state.');
	return {
		authorizationUrl,
		response,
		state,
		stateCookie: cookiePair(responseCookie(response, 'dojo_oauth_state')),
	};
}

async function finishOAuth(start, params = {}) {
	const callbackUrl = new URL('https://worker.test/api/auth/callback');
	callbackUrl.searchParams.set('state', params.state ?? start.state);
	for (const [name, value] of Object.entries(params)) {
		if (name !== 'state' && value !== undefined) callbackUrl.searchParams.set(name, value);
	}
	return harness.fetch(`${callbackUrl.pathname}${callbackUrl.search}`, {
		redirect: 'manual',
		headers: { Cookie: start.stateCookie },
	});
}

async function createAuthActivityTable() {
	const env = await worker.getEnv();
	await worker.applyD1Migrations('DB');
	return env;
}

function jsonResponse(value, status = 200) {
	return new Response(JSON.stringify(value), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}

async function withDiscordResponder(responder, action) {
	const originalFetch = globalThis.fetch;
	const requests = [];
	globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		if (new URL(request.url).origin !== 'https://discord.com') return originalFetch(input, init);
		requests.push(request);
		return responder(request, requests);
	};

	try {
		return await action(requests);
	} finally {
		globalThis.fetch = originalFetch;
	}
}

function memberResponder({ guildPages = [[{ id: TEST_DISCORD_GUILD_ID }]], username = 'fixture-member' } = {}) {
	let guildPage = 0;
	return async (request) => {
		const url = new URL(request.url);
		if (url.pathname === '/api/v10/oauth2/token') {
			assert.equal(request.method, 'POST');
			assert.match(request.headers.get('authorization') ?? '', /^Basic /u);
			assert.equal(request.headers.get('content-type'), 'application/x-www-form-urlencoded');
			assert.equal(
				await request.text(),
				new URLSearchParams({
					grant_type: 'authorization_code',
					code: 'fixture-authorization-code',
					redirect_uri: TEST_DISCORD_REDIRECT_URI,
				}).toString()
			);
			return jsonResponse({ access_token: TEST_DISCORD_ACCESS_TOKEN, token_type: 'Bearer' });
		}
		if (url.pathname === '/api/v10/users/@me') {
			assert.equal(request.headers.get('authorization'), `Bearer ${TEST_DISCORD_ACCESS_TOKEN}`);
			return jsonResponse({ id: '123456789012345678', username });
		}
		if (url.pathname === '/api/v10/users/@me/guilds') {
			assert.equal(request.headers.get('authorization'), `Bearer ${TEST_DISCORD_ACCESS_TOKEN}`);
			assert.equal(url.searchParams.get('limit'), '200');
			const page = guildPages[guildPage++];
			assert.ok(page, 'Unexpected extra guild-page request.');
			return jsonResponse(page);
		}
		throw new Error(`Unexpected Discord request: ${request.method} ${url.pathname}`);
	};
}

async function searchPagefind(query, cookie) {
	const originalFetch = globalThis.fetch;
	const requestedUrls = [];
	globalThis.fetch = async (input, init) => {
		const request = new Request(input, init);
		const url = new URL(request.url, harnessUrl);
		requestedUrls.push(url.toString());
		if (url.origin !== harnessUrl.origin || !url.pathname.startsWith('/pagefind/')) {
			return originalFetch(input, init);
		}
		const headers = new Headers(request.headers);
		headers.set('Cookie', cookie);
		return harness.fetch(`${url.pathname}${url.search}`, { headers });
	};

	const moduleUrl = `${pathToFileURL(resolve(projectRoot, 'dist/client/pagefind/pagefind.js')).href}?test=${Date.now()}-${Math.random()}`;
	try {
		const pagefind = await import(moduleUrl);
		await pagefind.options({ basePath: new URL('/pagefind/', harnessUrl).toString() });
		const result = await pagefind.search(query);
		const firstResult = result.results[0] ? await result.results[0].data() : undefined;
		await pagefind.destroy();
		return { result, firstResult };
	} catch (error) {
		throw new Error(`${error.message}\nPagefind requested: ${requestedUrls.join(', ')}`, { cause: error });
	} finally {
		globalThis.fetch = originalFetch;
	}
}

describe('production Worker test seam', { concurrency: false }, () => {
	before(async () => {
		harnessUrl = (await harness.listen()).url;
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

	test('serves disclosure and login skeletons without a session or observation request', async () => {
		const [home, login, accessDenied, cancelled, unavailable] = await Promise.all([
			harness.fetch('/'),
			harness.fetch('/login'),
			harness.fetch('/access-denied'),
			harness.fetch('/auth-cancelled'),
			harness.fetch('/discord-unavailable'),
		]);
		assert.equal(home.status, 200);
		assert.equal(login.status, 200);
		assert.equal(accessDenied.status, 200);
		assert.equal(cancelled.status, 200);
		assert.equal(unavailable.status, 200);
		assert.equal(home.headers.get('set-cookie'), null);
		assert.equal(login.headers.get('set-cookie'), null);
		assert.equal(accessDenied.headers.get('set-cookie'), null);

		const homeBody = await home.text();
		assert.match(homeBody, /通过 6 个道馆可以把缓冲区缩短一定时间/u);
		assert.doesNotMatch(homeBody, /缓冲区缩短 144h/u);
		assert.match(homeBody, /HMAC-SHA256/u);
		assert.match(homeBody, /活跃业务记录最多保留 90 天/u);
		assert.match(homeBody, /最多可能额外保留 7 天/u);
		assert.match(homeBody, /请通过社区联系/u);
		assert.match(homeBody, /AGPL-3\.0-or-later/u);
		assert.match(homeBody, /CC BY-NC 4\.0/u);
		assert.doesNotMatch(homeBody, /api\/fingerprint/u);

		const loginBody = await login.text();
		const noticeIndex = loginBody.indexOf('登录前请先了解');
		const loginButtonIndex = loginBody.indexOf('使用 Discord 登录');
		assert.ok(noticeIndex >= 0 && noticeIndex < loginButtonIndex, 'The notice must precede the OAuth button.');
		assert.match(loginBody, /首页隐私说明/u);
		assert.doesNotMatch(loginBody, /type="checkbox"/u);

		assert.match(await accessDenied.text(), /您不在类脑 ODYSSEIA 服务器，请先加入。/u);
		assert.match(await cancelled.text(), /Discord 授权未完成，无法验证您的访问资格。/u);
		assert.match(await unavailable.text(), /暂时无法连接 Discord，请稍后重试。/u);
	});

	test('starts a constrained Discord OAuth flow with a short-lived protected state cookie', async () => {
		const start = await beginOAuth('/docs/tutorials/discord-and-odysseia/?source=login#search-terms');

		assert.equal(start.authorizationUrl.origin, 'https://discord.com');
		assert.equal(start.authorizationUrl.pathname, '/oauth2/authorize');
		assert.equal(start.authorizationUrl.searchParams.get('client_id'), TEST_DISCORD_CLIENT_ID);
		assert.equal(start.authorizationUrl.searchParams.get('redirect_uri'), TEST_DISCORD_REDIRECT_URI);
		assert.equal(start.authorizationUrl.searchParams.get('response_type'), 'code');
		assert.equal(start.authorizationUrl.searchParams.get('scope'), 'identify guilds');
		assert.ok(start.state.length >= 43, 'OAuth state must contain at least 256 bits of encoded randomness.');
		assert.equal(start.authorizationUrl.searchParams.has('bot'), false);
		assert.equal(start.authorizationUrl.searchParams.has('applications.commands'), false);
		assert.equal(start.response.headers.get('cache-control'), 'no-store');

		const stateCookie = responseCookie(start.response, 'dojo_oauth_state');
		assert.match(stateCookie, /HttpOnly/u);
		assert.match(stateCookie, /Secure/u);
		assert.match(stateCookie, /SameSite=Lax/u);
		assert.match(stateCookie, /Path=\//u);
		assert.match(stateCookie, /Max-Age=600/u);
	});

	test('issues a fixed session after identity and paginated Guild membership verification', async () => {
		const env = await createAuthActivityTable();
		const firstPage = Array.from({ length: 200 }, (_, index) => ({ id: String(index + 1) }));
		const start = await beginOAuth('/docs/tutorials/discord-and-odysseia/?source=login#search-terms');

		const response = await withDiscordResponder(
			memberResponder({ guildPages: [firstPage, [{ id: TEST_DISCORD_GUILD_ID }]] }),
			async (requests) => {
				const callback = await finishOAuth(start, { code: 'fixture-authorization-code' });
				const guildRequests = requests.filter((request) => new URL(request.url).pathname.endsWith('/users/@me/guilds'));
				assert.equal(guildRequests.length, 2);
				assert.equal(new URL(guildRequests[1].url).searchParams.get('after'), '200');
				return callback;
			}
		);

		assert.equal(response.status, 302);
		assert.equal(locationPath(response), '/docs/tutorials/discord-and-odysseia/?source=login#search-terms');
		assert.equal(response.headers.get('cache-control'), 'no-store');

		const sessionCookie = responseCookie(response, 'dojo_session');
		assert.match(sessionCookie, /HttpOnly/u);
		assert.match(sessionCookie, /Secure/u);
		assert.match(sessionCookie, /SameSite=Lax/u);
		assert.match(sessionCookie, /Path=\//u);
		assert.match(sessionCookie, /Max-Age=691200/u);
		const claims = decodeJwt(cookieValue(sessionCookie));
		assert.equal(claims.discordUserId, '123456789012345678');
		assert.equal(claims.discordUsername, 'fixture-member');
		assert.equal(typeof claims.sessionNonce, 'string');
		assert.ok(claims.sessionNonce.length >= 43);
		assert.equal(typeof claims.guildVerifiedAt, 'number');
		assert.equal(claims.exp - claims.iat, 691200);

		const clearedState = responseCookie(response, 'dojo_oauth_state');
		assert.match(clearedState, /Max-Age=0/u);

		const storedActivity = await env.DB.prepare(
			'SELECT discord_user_id, discord_username_snapshot, last_successful_oauth_at FROM auth_activity'
		).first();
		assert.deepEqual(storedActivity?.discord_user_id, '123456789012345678');
		assert.deepEqual(storedActivity?.discord_username_snapshot, 'fixture-member');
		assert.match(storedActivity?.last_successful_oauth_at ?? '', /^\d{4}-\d{2}-\d{2}T/u);
		assert.doesNotMatch(JSON.stringify(storedActivity), /test-discord-access-token|dojo_session|test-session-secret/u);
	});

	test('rejects missing or mismatched OAuth state before any Discord request', async () => {
		const start = await beginOAuth();
		await withDiscordResponder(
			async () => {
				throw new Error('Discord must not be reached for an invalid state.');
			},
			async (requests) => {
				const missing = await harness.fetch('/api/auth/callback?code=fixture-authorization-code', {
					redirect: 'manual',
					headers: { Cookie: start.stateCookie },
				});
				assert.equal(missing.status, 400);
				assert.equal(missing.headers.get('cache-control'), 'no-store');
				assert.match(responseCookie(missing, 'dojo_oauth_state'), /Max-Age=0/u);

				const mismatched = await finishOAuth(start, {
					code: 'fixture-authorization-code',
					state: 'wrong-state',
				});
				assert.equal(mismatched.status, 400);
				assert.match(responseCookie(mismatched, 'dojo_oauth_state'), /Max-Age=0/u);
				assert.equal(requests.length, 0);
			}
		);
	});

	test('distinguishes a declined authorization, a non-member, and a Discord failure', async () => {
		const declinedStart = await beginOAuth();
		const declined = await finishOAuth(declinedStart, { error: 'access_denied' });
		assert.equal(declined.status, 302);
		assert.equal(locationPath(declined), '/auth-cancelled');

		const nonMemberStart = await beginOAuth();
		const nonMember = await withDiscordResponder(
			memberResponder({ guildPages: [[]] }),
			() => finishOAuth(nonMemberStart, { code: 'fixture-authorization-code' })
		);
		assert.equal(nonMember.status, 302);
		assert.equal(locationPath(nonMember), '/access-denied');
		assert.match(responseCookie(nonMember, 'dojo_session'), /Max-Age=0/u);

		const failedStart = await beginOAuth();
		const failed = await withDiscordResponder(
			async (request) => {
				assert.equal(new URL(request.url).pathname, '/api/v10/oauth2/token');
				return new Response('Discord is unavailable', { status: 503 });
			},
			() => finishOAuth(failedStart, { code: 'fixture-authorization-code' })
		);
		assert.equal(failed.status, 302);
		assert.equal(locationPath(failed), '/discord-unavailable');
	});

	test('treats malformed Guild payloads as Discord failures instead of non-membership', async () => {
		for (const guildPage of [[{}], ['not-a-guild']]) {
			const start = await beginOAuth();
			const response = await withDiscordResponder(
				memberResponder({ guildPages: [guildPage] }),
				() => finishOAuth(start, { code: 'fixture-authorization-code' })
			);

			assert.equal(response.status, 302);
			assert.equal(locationPath(response), '/discord-unavailable');
		}
	});

	test('falls back to the tutorial root for unsafe OAuth return targets', async () => {
		await createAuthActivityTable();
		for (const unsafeReturnTo of [
			'//example.invalid/steal',
			'https://example.invalid/steal',
			'/docs/other/',
			'/public/',
		]) {
			const start = await beginOAuth(unsafeReturnTo);
			const response = await withDiscordResponder(
				memberResponder(),
				() => finishOAuth(start, { code: 'fixture-authorization-code' })
			);
			assert.equal(locationPath(response), '/docs/tutorials/', unsafeReturnTo);
		}
	});

	test('keeps a verified member signed in when only the OAuth activity upsert fails', async () => {
		const env = await worker.getEnv();
		await env.DB.prepare('DROP TABLE IF EXISTS auth_activity').run();
		const start = await beginOAuth();
		harness.clearLogs();
		const response = await withDiscordResponder(
			memberResponder(),
			() => finishOAuth(start, { code: 'fixture-authorization-code' })
		);
		assert.equal(response.status, 302);
		assert.equal(locationPath(response), '/docs/tutorials/');
		assert.ok(responseCookies(response).some((cookie) => cookie.startsWith('dojo_session=')));
		const errors = harness
			.getLogs()
			.filter((log) => log.level === 'error')
			.map((log) => log.message);
		assert.deepEqual(errors, ['Unable to record OAuth activity.']);
		assert.doesNotMatch(errors.join('\n'), /test-discord-access-token|dojo_session|test-session-secret|123456789012345678/u);
	});

	test('clears the fixed session cookie at logout', async () => {
		const response = await harness.fetch('/api/auth/logout', {
			redirect: 'manual',
			headers: { Cookie: await signedSessionCookie() },
		});
		assert.equal(response.status, 302);
		assert.equal(locationPath(response), '/');
		const cookie = responseCookie(response, 'dojo_session');
		assert.match(cookie, /HttpOnly/u);
		assert.match(cookie, /Secure/u);
		assert.match(cookie, /SameSite=Lax/u);
		assert.match(cookie, /Path=\//u);
		assert.match(cookie, /Max-Age=0/u);
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

	test('keeps the native Starlight reading experience available to authenticated readers', async () => {
		const headers = { Cookie: await signedSessionCookie() };
		const [tutorialIndex, extensionIndex, tutorial, extension, outdated, resourcePage] = await Promise.all([
			harness.fetch('/docs/tutorials/', { headers }),
			harness.fetch('/docs/extensions/', { headers }),
			harness.fetch('/docs/tutorials/discord-and-odysseia/', { headers }),
			harness.fetch('/docs/extensions/account-safety/', { headers }),
			harness.fetch('/docs/extensions/legacy-interface/', { headers }),
			harness.fetch('/docs/tutorials/sillytavern-api/', { headers }),
		]);
		assert.equal(tutorialIndex.status, 200);
		assert.equal(extensionIndex.status, 200);
		assert.equal(tutorial.status, 200);
		assert.equal(extension.status, 200);
		assert.equal(outdated.status, 200);
		assert.equal(resourcePage.status, 200);

		const tutorialIndexBody = await tutorialIndex.text();
		assert.match(tutorialIndexBody, /基础教程.*答题范围/u);
		const extensionIndexBody = await extensionIndex.text();
		assert.match(extensionIndexBody, /扩展阅读.*不.*答题范围/u);

		const tutorialBody = await tutorial.text();
		assert.match(tutorialBody, /<html lang="zh-CN"/u);
		assert.match(tutorialBody, /<nav class="sidebar/u);
		assert.match(tutorialBody, /基础教程/u);
		assert.match(tutorialBody, /扩展阅读/u);
		assert.match(tutorialBody, /aria-current="page"/u);
		assert.match(tutorialBody, /right-sidebar/u);
		assert.match(tutorialBody, /rel="prev"/u);
		assert.match(tutorialBody, /rel="next"/u);
		assert.match(tutorialBody, /class="sl-anchor-link"/u);
		assert.match(tutorialBody, /<details>/u);
		assert.match(tutorialBody, /<summary>可选：进一步了解<\/summary>/u);
		assert.match(tutorialBody, /starlight-menu-button/u);
		assert.match(tutorialBody, /starlight-theme-select/u);
		assert.match(tutorialBody, /data-content-category="tutorial"/u);
		assert.equal([...tutorialBody.matchAll(/<h1(?:\s|>)/gu)].length, 1);
		assert.doesNotMatch(tutorialBody, /基础教程属于答题范围/u);

		const extensionBody = await extension.text();
		assert.match(extensionBody, /data-content-category="extension"/u);
		assert.equal([...extensionBody.matchAll(/<h1(?:\s|>)/gu)].length, 1);
		assert.doesNotMatch(extensionBody, /扩展阅读不属于答题范围/u);

		const stylesheets = [...tutorialBody.matchAll(/<link[^>]+href="([^"]+\.css)"/gu)].map((match) => match[1]);
		assert.ok(stylesheets.length > 0, 'The reading page must load a stylesheet.');
		const stylesheet = (await Promise.all(stylesheets.map(async (path) => (await harness.fetch(path)).text()))).join('\n');
		assert.match(stylesheet, /--sl-content-width\s*:\s*min\(66rem,\s*92vw\)/u);
		assert.match(stylesheet, /\.pagination-links\s*\{\s*max-inline-size\s*:\s*45rem/u);
		assert.match(stylesheet, /overflow-wrap\s*:\s*anywhere/u);

		const outdatedBody = await outdated.text();
		assert.match(outdatedBody, /data-outdated-notice/u);
		assert.match(outdatedBody, /本文部分内容可能已经过时，请结合当前界面和最新说明阅读。/u);

		const resourceBody = await resourcePage.text();
		assert.match(resourceBody, /src="\/protected\/tutorial-images\/fixture-api-settings\.svg"/u);
		assert.match(resourceBody, /href="\/protected\/attachments\/fixture-reading-checklist\.txt"/u);
		assert.doesNotMatch(resourceBody, /_astro\/[^"']*fixture-api-settings/u);
		assert.match(resourceBody, /（图）/u);
	});

	test('protects the Pagefind bundle and returns fixture matches for Chinese, product, acronym, and details terms', async () => {
		const anonymous = await harness.fetch('/pagefind/pagefind.js');
		assert.equal(anonymous.status, 401);
		assert.equal(anonymous.headers.get('cache-control'), 'no-store');

		const cookie = await signedSessionCookie();
		const authenticated = await harness.fetch('/pagefind/pagefind.js', { headers: { Cookie: cookie } });
		assert.equal(authenticated.status, 200);
		assert.equal(authenticated.headers.get('cache-control'), 'private, no-store, max-age=0');

		for (const query of ['道馆', 'SillyTavern', 'API', 'fixture fragment']) {
			const { result, firstResult } = await searchPagefind(query, cookie);
			assert.ok(result.results.length > 0, `Expected Pagefind fixture results for ${query}.`);
			assert.match(new URL(firstResult?.url ?? '/', harnessUrl).pathname, /^\/docs\/(?:tutorials|extensions)\//u);
		}
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

	test('rejects an expired token before protected documents are fetched', async () => {
		const cookie = await signedSessionCookie({ expirationTime: Math.floor(Date.now() / 1_000) - 60 });
		const response = await harness.fetch('/docs/tutorials/discord-and-odysseia/', {
			redirect: 'manual',
			headers: { Cookie: cookie },
		});

		assert.equal(response.status, 302);
		assert.equal(locationPath(response), '/login?returnTo=%2Fdocs%2Ftutorials%2Fdiscord-and-odysseia%2F');
		assert.equal(response.headers.get('cache-control'), 'no-store');
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
