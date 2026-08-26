import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';

import {
	isProtectedRequest,
	privateProtectedResponse,
	rejectUnauthenticatedProtectedRequest,
	unavailableProtectedRequest,
} from './lib/protected-access';

export const onRequest = defineMiddleware(async (context, next) => {
	if (context.isPrerendered) return next();

	const rejection = await rejectUnauthenticatedProtectedRequest(context.request, env.SESSION_SECRET);
	if (rejection) return rejection;

	try {
		return privateProtectedResponse(context.request, await next());
	} catch (error) {
		if (isProtectedRequest(context.request)) return unavailableProtectedRequest();
		throw error;
	}
});
