interface QuizEligibilityRequest {
	discordUserId: string;
}

const ELIGIBILITY_WINDOW_MILLISECONDS = 8 * 24 * 60 * 60 * 1_000;

type QuizEligibilityEnvironment = Pick<DojoEnvironment, 'DB'> &
	Partial<Pick<DojoEnvironment, 'QUIZ_ELIGIBILITY_API_KEY'>>;

interface TimingSafeSubtleCrypto extends SubtleCrypto {
	timingSafeEqual(left: BufferSource, right: BufferSource): boolean;
}

function errorResponse(status: number): Response {
	return Response.json({ error: 'request_rejected' }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function apiKeysMatch(provided: string, configured: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const subtle = crypto.subtle as TimingSafeSubtleCrypto;
	const [providedDigest, configuredDigest] = await Promise.all([
		subtle.digest('SHA-256', encoder.encode(provided)),
		subtle.digest('SHA-256', encoder.encode(configured)),
	]);
	return subtle.timingSafeEqual(providedDigest, configuredDigest);
}

function bearerCredential(request: Request): string {
	return /^Bearer ([^\s]+)$/iu.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
}

function validConfiguredApiKey(value: unknown): value is string {
	if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) return false;

	try {
		const base64 = value
			.replaceAll('-', '+')
			.replaceAll('_', '/')
			.padEnd(Math.ceil(value.length / 4) * 4, '=');
		return atob(base64).length >= 32;
	} catch {
		return false;
	}
}

export function quizEligibilityWindow(now: number): { earliest: string; latest: string } {
	return {
		earliest: new Date(now - ELIGIBILITY_WINDOW_MILLISECONDS).toISOString(),
		latest: new Date(now).toISOString(),
	};
}

async function parseQuizEligibilityRequest(request: Request): Promise<QuizEligibilityRequest | undefined> {
	let value: unknown;
	try {
		value = await request.json();
	} catch {
		return undefined;
	}

	if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
	const payload = value as Record<string, unknown>;
	if (Object.keys(payload).length !== 1 || !Object.hasOwn(payload, 'discordUserId')) return undefined;
	if (typeof payload.discordUserId !== 'string' || !/^[0-9]{17,20}$/u.test(payload.discordUserId)) return undefined;

	return { discordUserId: payload.discordUserId };
}

function eligibilityResponse(eligible: boolean): Response {
	return Response.json(eligible ? { eligible: true } : { eligible: false, reason: 'fingerprint_missing' }, {
		headers: { 'Cache-Control': 'no-store' },
	});
}

export async function checkQuizEligibility(request: Request, env: QuizEligibilityEnvironment): Promise<Response> {
	if (request.method !== 'POST') return errorResponse(405);
	if (!validConfiguredApiKey(env.QUIZ_ELIGIBILITY_API_KEY)) return errorResponse(503);

	try {
		if (!(await apiKeysMatch(bearerCredential(request), env.QUIZ_ELIGIBILITY_API_KEY))) {
			return errorResponse(401);
		}
	} catch {
		return errorResponse(503);
	}

	const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
	if (contentType !== 'application/json') return errorResponse(415);
	const payload = await parseQuizEligibilityRequest(request);
	if (!payload) return errorResponse(400);
	const window = quizEligibilityWindow(Date.now());
	let observation: { captured_at: string } | null;
	try {
		observation = await env.DB.prepare(
			`SELECT captured_at
				 FROM fingerprint_observations
				 WHERE discord_user_id = ?1 AND captured_at >= ?2 AND captured_at <= ?3
				 ORDER BY captured_at DESC
				 LIMIT 1`,
		)
			.bind(payload.discordUserId, window.earliest, window.latest)
			.first<{ captured_at: string }>();
	} catch {
		return errorResponse(503);
	}

	return eligibilityResponse(observation !== null);
}
