import { clearOAuthStateCookie } from './discord-oauth';
import { clearSessionCookie } from './session';

export function oauthRedirect(location: string, cookies: string[] = []): Response {
	const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
	for (const cookie of cookies) headers.append('Set-Cookie', cookie);
	return new Response(null, { status: 302, headers });
}

export function invalidOAuthState(): Response {
	return new Response('Authentication verification failed.', {
		status: 400,
		headers: {
			'Cache-Control': 'no-store',
			'Set-Cookie': clearOAuthStateCookie(),
		},
	});
}

export function unavailableOAuth(): Response {
	return oauthRedirect('/discord-unavailable', [clearOAuthStateCookie()]);
}

export function deniedOAuth(): Response {
	return oauthRedirect('/access-denied', [clearOAuthStateCookie(), clearSessionCookie()]);
}

export function cancelledOAuth(): Response {
	return oauthRedirect('/auth-cancelled', [clearOAuthStateCookie(), clearSessionCookie()]);
}
