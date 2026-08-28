import { env } from 'cloudflare:workers';
import type { APIRoute } from 'astro';

import { recordFingerprintObservation } from '../../lib/observation';

export const prerender = false;

export const POST: APIRoute = ({ request }) => recordFingerprintObservation(request, env);
