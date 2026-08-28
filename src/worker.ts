import { handle } from '@astrojs/cloudflare/handler';

import { removeExpiredActivity } from './lib/data-retention';
import { applyProtectedAccessPolicy } from './lib/protected-access';

export default {
	async fetch(request, env, context) {
		return applyProtectedAccessPolicy(request, env.SESSION_SECRET, () => handle(request, env, context));
	},

	async scheduled(controller, env) {
		await removeExpiredActivity(env.DB, controller.scheduledTime);
	},
} satisfies ExportedHandler<Env>;
