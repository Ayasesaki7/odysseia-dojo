import { handle } from '@astrojs/cloudflare/handler';

import {
	isProtectedRequest,
	privateProtectedResponse,
	rejectUnauthenticatedProtectedRequest,
	unavailableProtectedRequest,
} from './lib/protected-access';

export default {
	async fetch(request, env, context) {
		const rejection = await rejectUnauthenticatedProtectedRequest(request, env.SESSION_SECRET);
		if (rejection) return rejection;

		try {
			return privateProtectedResponse(request, await handle(request, env, context));
		} catch (error) {
			if (isProtectedRequest(request)) return unavailableProtectedRequest();
			throw error;
		}
	},

	async scheduled(_controller, _env, context) {
		context.waitUntil(Promise.resolve());
	},
} satisfies ExportedHandler<Env>;
