import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { DiscordOAuthError, startDiscordOAuth } from '../../../lib/discord-oauth';
import { unavailableOAuth } from '../../../lib/oauth-responses';

export const prerender = false;

export const GET: APIRoute = ({ request }) => {
	try {
		return startDiscordOAuth(request, env);
	} catch (error) {
		if (error instanceof DiscordOAuthError) return unavailableOAuth();
		throw error;
	}
};
