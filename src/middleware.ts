import { env } from 'cloudflare:workers';
import { defineMiddleware } from 'astro:middleware';

import { applyProtectedAccessPolicy } from './lib/protected-access';

export const onRequest = defineMiddleware(async (context, next) => {
	if (context.isPrerendered) return next();

	return applyProtectedAccessPolicy(context.request, env.SESSION_SECRET, () => next());
});
