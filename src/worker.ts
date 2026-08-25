import { handle } from '@astrojs/cloudflare/handler';

import {
	authenticateDiscordMember,
	clearOAuthStateCookie,
	consumeOAuthState,
	DiscordOAuthError,
	startDiscordOAuth,
} from './lib/discord-oauth';
import { clearSessionCookie, issueSession, sessionCookie, verifySession } from './lib/session';

type ProtectedRequestKind = 'document' | 'resource';

function protectedRequestKind(pathname: string): ProtectedRequestKind | undefined {
	if (/^\/docs\/(?:tutorials|extensions)(?:\/|$)/u.test(pathname)) return 'document';
	if (/^\/pagefind(?:\/|$)/u.test(pathname)) return 'resource';
	if (/^\/protected\/(?:tutorial-images|attachments)(?:\/|$)/u.test(pathname)) return 'resource';
}

function noStore(response: Response): Response {
	const headers = new Headers(response.headers);
	headers.set('Cache-Control', 'private, no-store, max-age=0');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function rejectedProtectedRequest(request: Request, kind: ProtectedRequestKind): Response {
	if (kind === 'resource') {
		return new Response('Authentication is required to access this resource.', {
			status: 401,
			headers: { 'Cache-Control': 'no-store' },
		});
	}

	const requestUrl = new URL(request.url);
	const loginUrl = new URL('/login', requestUrl.origin);
	loginUrl.searchParams.set('returnTo', `${requestUrl.pathname}${requestUrl.search}`);
	return new Response(null, {
		status: 302,
		headers: {
			Location: `${loginUrl.pathname}${loginUrl.search}`,
			'Cache-Control': 'no-store',
		},
	});
}

function unavailableProtectedRequest(): Response {
	return new Response('Protected content is temporarily unavailable.', {
		status: 503,
		headers: { 'Cache-Control': 'no-store' },
	});
}

function redirect(location: string, cookies: string[] = []): Response {
	const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
	for (const cookie of cookies) headers.append('Set-Cookie', cookie);
	return new Response(null, { status: 302, headers });
}

function invalidOAuthState(): Response {
	return new Response('Authentication verification failed.', {
		status: 400,
		headers: {
			'Cache-Control': 'no-store',
			'Set-Cookie': clearOAuthStateCookie(),
		},
	});
}

function unavailableOAuth(): Response {
	return redirect('/discord-unavailable', [clearOAuthStateCookie()]);
}

async function recordAuthActivity(env: Env, discordUserId: string, discordUsername: string): Promise<void> {
	await env.DB
		.prepare(
			`INSERT INTO auth_activity (discord_user_id, discord_username_snapshot, last_successful_oauth_at)
			 VALUES (?, ?, ?)
			 ON CONFLICT(discord_user_id) DO UPDATE SET
			 discord_username_snapshot = excluded.discord_username_snapshot,
			 last_successful_oauth_at = excluded.last_successful_oauth_at`
		)
		.bind(discordUserId, discordUsername, new Date().toISOString())
		.run();
}

async function handleOAuthCallback(request: Request, env: Env): Promise<Response> {
	const callbackUrl = new URL(request.url);
	const returnTo = consumeOAuthState(request, callbackUrl.searchParams.get('state'));
	if (!returnTo) return invalidOAuthState();

	if (callbackUrl.searchParams.has('error')) {
		const destination = callbackUrl.searchParams.get('error') === 'access_denied' ? '/auth-cancelled' : '/discord-unavailable';
		return redirect(destination, [clearOAuthStateCookie(), clearSessionCookie()]);
	}

	const code = callbackUrl.searchParams.get('code');
	if (!code) return unavailableOAuth();

	let authentication;
	try {
		authentication = await authenticateDiscordMember(code, env);
	} catch (error) {
		if (error instanceof DiscordOAuthError) return unavailableOAuth();
		throw error;
	}

	if (authentication.kind === 'not-member') {
		return redirect('/access-denied', [clearOAuthStateCookie(), clearSessionCookie()]);
	}

	try {
		await recordAuthActivity(env, authentication.identity.discordUserId, authentication.identity.discordUsername);
	} catch {
		console.error('Unable to record OAuth activity.');
	}

	let token: string;
	try {
		token = await issueSession(authentication.identity, env.SESSION_SECRET);
	} catch {
		return unavailableOAuth();
	}

	return redirect(returnTo, [sessionCookie(token), clearOAuthStateCookie()]);
}

export default {
	async fetch(request, env, context) {
		const requestUrl = new URL(request.url);

		if (requestUrl.pathname === '/api/auth/discord') {
			try {
				return startDiscordOAuth(request, env);
			} catch (error) {
				if (error instanceof DiscordOAuthError) return unavailableOAuth();
				throw error;
			}
		}

		if (requestUrl.pathname === '/api/auth/callback') {
			return handleOAuthCallback(request, env);
		}

		if (requestUrl.pathname === '/api/auth/logout') {
			return redirect('/', [clearSessionCookie()]);
		}

		const requestKind = protectedRequestKind(requestUrl.pathname);
		if (requestKind) {
			try {
				await verifySession(request, env.SESSION_SECRET);
			} catch {
				return rejectedProtectedRequest(request, requestKind);
			}
		}

		try {
			const response = await handle(request, env, context);
			return requestKind ? noStore(response) : response;
		} catch (error) {
			if (requestKind) return unavailableProtectedRequest();
			throw error;
		}
	},

	async scheduled(_controller, _env, context) {
		context.waitUntil(Promise.resolve());
	},
} satisfies ExportedHandler<Env>;
