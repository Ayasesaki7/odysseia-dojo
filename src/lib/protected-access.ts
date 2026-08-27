import { verifySession } from './session';

type ProtectedRequestKind = 'document' | 'resource';

const MAX_PATH_DECODE_PASSES = 4;

function canonicalPathname(request: Request): string {
	let pathname = new URL(request.url).pathname;

	for (let pass = 0; pass < MAX_PATH_DECODE_PASSES; pass += 1) {
		const decoded = decodeURIComponent(pathname);
		if (decoded === pathname) {
			const segments = [];
			for (const segment of decoded.replaceAll('\\', '/').split('/')) {
				if (!segment || segment === '.') continue;
				if (segment === '..') {
					segments.pop();
					continue;
				}
				segments.push(segment);
			}
			return `/${segments.join('/')}`;
		}
		pathname = decoded;
	}

	throw new Error('Path encoding exceeded the safe decoding limit.');
}

function protectedRequestKind(request: Request): ProtectedRequestKind | undefined {
	const pathname = canonicalPathname(request);
	if (/^\/docs\/(?:tutorials|extensions)(?:\/|$)/u.test(pathname)) return 'document';
	if (/^\/pagefind(?:\/|$)/u.test(pathname)) return 'resource';
	if (/^\/protected\/(?:tutorial-images|attachments)(?:\/|$)/u.test(pathname)) return 'resource';
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

async function rejectUnauthenticatedProtectedRequest(
	request: Request,
	sessionSecret: string,
	kind: ProtectedRequestKind | undefined
): Promise<Response | undefined> {
	if (!kind) return undefined;

	try {
		await verifySession(request, sessionSecret);
	} catch {
		return rejectedProtectedRequest(request, kind);
	}
}

function privateProtectedResponse(kind: ProtectedRequestKind | undefined, response: Response): Response {
	if (!kind) return response;

	const headers = new Headers(response.headers);
	headers.set('Cache-Control', 'private, no-store, max-age=0');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function unavailableProtectedRequest(): Response {
	return new Response('Protected content is temporarily unavailable.', {
		status: 503,
		headers: { 'Cache-Control': 'no-store' },
	});
}

export async function applyProtectedAccessPolicy(
	request: Request,
	sessionSecret: string,
	continueRequest: () => Promise<Response>
): Promise<Response> {
	let kind: ProtectedRequestKind | undefined;
	try {
		kind = protectedRequestKind(request);
	} catch {
		return unavailableProtectedRequest();
	}

	const rejection = await rejectUnauthenticatedProtectedRequest(request, sessionSecret, kind);
	if (rejection) return rejection;

	try {
		return privateProtectedResponse(kind, await continueRequest());
	} catch (error) {
		if (kind) return unavailableProtectedRequest();
		throw error;
	}
}
