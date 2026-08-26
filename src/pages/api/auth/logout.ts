import type { APIRoute } from 'astro';

import { oauthRedirect } from '../../../lib/oauth-responses';
import { clearSessionCookie } from '../../../lib/session';

export const prerender = false;

export const GET: APIRoute = () => oauthRedirect('/', [clearSessionCookie()]);
