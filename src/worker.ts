import { handle } from '@astrojs/cloudflare/handler';

import { verifySession } from './lib/session';

type ProtectedRequestKind = 'document' | 'resource';

function protectedRequestKind(pathname: string): ProtectedRequestKind | undefined {
	if (/^\/docs\/(?:tutorials|extensions)(?:\/|$)/u.test(pathname)) return 'document';
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

export default {
	async fetch(request, env, context) {
		const requestUrl = new URL(request.url);

		if (requestUrl.pathname === '/api/auth/discord') {
			return new Response('Discord authentication is not configured yet.', {
				status: 501,
				headers: { 'Cache-Control': 'no-store' },
			});
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
