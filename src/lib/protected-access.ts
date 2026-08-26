import { verifySession } from './session';

type ProtectedRequestKind = 'document' | 'resource';

function protectedRequestKind(pathname: string): ProtectedRequestKind | undefined {
	if (/^\/docs\/(?:tutorials|extensions)(?:\/|$)/u.test(pathname)) return 'document';
	if (/^\/pagefind(?:\/|$)/u.test(pathname)) return 'resource';
	if (/^\/protected\/(?:tutorial-images|attachments)(?:\/|$)/u.test(pathname)) return 'resource';
}

export function isProtectedRequest(request: Request): boolean {
	return protectedRequestKind(new URL(request.url).pathname) !== undefined;
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

export async function rejectUnauthenticatedProtectedRequest(
	request: Request,
	sessionSecret: string
): Promise<Response | undefined> {
	const kind = protectedRequestKind(new URL(request.url).pathname);
	if (!kind) return undefined;

	try {
		await verifySession(request, sessionSecret);
	} catch {
		return rejectedProtectedRequest(request, kind);
	}
}

export function privateProtectedResponse(request: Request, response: Response): Response {
	if (!isProtectedRequest(request)) return response;

	const headers = new Headers(response.headers);
	headers.set('Cache-Control', 'private, no-store, max-age=0');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export function unavailableProtectedRequest(): Response {
	return new Response('Protected content is temporarily unavailable.', {
		status: 503,
		headers: { 'Cache-Control': 'no-store' },
	});
}
