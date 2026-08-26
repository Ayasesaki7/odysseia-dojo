import { handle } from '@astrojs/cloudflare/handler';

import { applyProtectedAccessPolicy } from './lib/protected-access';

export default {
	async fetch(request, env, context) {
		return applyProtectedAccessPolicy(request, env.SESSION_SECRET, () => handle(request, env, context));
	},

	async scheduled(_controller, _env, context) {
		context.waitUntil(Promise.resolve());
	},
} satisfies ExportedHandler<Env>;
