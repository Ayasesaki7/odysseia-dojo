import { handle } from '@astrojs/cloudflare/handler';

import { removeExpiredActivity } from './lib/data-retention';
import { applyProtectedAccessPolicy } from './lib/protected-access';
import { checkQuizEligibility } from './lib/quiz-eligibility';

const QUIZ_ELIGIBILITY_PATH = '/api/internal/quiz-eligibility';

export default {
	async fetch(request, env, context) {
		if (new URL(request.url).pathname === QUIZ_ELIGIBILITY_PATH) {
			return checkQuizEligibility(request, env);
		}
		return applyProtectedAccessPolicy(request, env.SESSION_SECRET, () => handle(request, env, context));
	},

	async scheduled(controller, env) {
		await removeExpiredActivity(env.DB, controller.scheduledTime);
	},
} satisfies ExportedHandler<Env>;
