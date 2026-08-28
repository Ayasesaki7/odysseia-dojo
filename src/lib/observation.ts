import { HASH_KEY_VERSION, hashObservationValue, networkPrefix, normalizeIp } from './observation-logic.js';
import { OBSERVATION_PAYLOAD_VERSION } from './observation-contract.js';
import { verifySession } from './session';

export { OBSERVATION_PAYLOAD_VERSION } from './observation-contract.js';

const CLIENT_PAYLOAD_FIELDS = new Set([
	'payloadVersion',
	'browserFingerprint',
	'canvasHash',
	'webglHash',
	'platform',
	'timezone',
	'screenResolution',
	'language',
	'fingerprintConfidence',
]);

interface ObservationPayload {
	browserFingerprint: string;
	canvasHash: string | null;
	webglHash: string | null;
	platform: string | null;
	timezone: string | null;
	screenResolution: string | null;
	language: string | null;
	fingerprintConfidence: number | null;
}

interface TrustedNetworkContext {
	ip: string;
	ipPrefix: string;
	country: string | null;
	asn: number | null;
}

function noStoreResponse(status: number): Response {
	return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
}

function requiredString(value: unknown, maximumLength: number): string {
	if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
		throw new Error('Invalid observation payload.');
	}
	return value;
}

function optionalString(value: unknown, maximumLength: number): string | null {
	if (value === undefined || value === null) return null;
	return requiredString(value, maximumLength);
}

async function parseObservationPayload(request: Request): Promise<ObservationPayload> {
	if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
		throw new Error('Invalid observation payload.');
	}

	const value: unknown = await request.json();
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new Error('Invalid observation payload.');
	}

	const payload = value as Record<string, unknown>;
	if (Object.keys(payload).some((field) => !CLIENT_PAYLOAD_FIELDS.has(field))) {
		throw new Error('Invalid observation payload.');
	}
	if (payload.payloadVersion !== OBSERVATION_PAYLOAD_VERSION) {
		throw new Error('Unsupported observation payload version.');
	}

	const screenResolution = optionalString(payload.screenResolution, 32);
	if (screenResolution && !/^\d{1,5}x\d{1,5}$/u.test(screenResolution)) {
		throw new Error('Invalid observation payload.');
	}

	const confidence = payload.fingerprintConfidence;
	if (
		confidence !== undefined &&
		confidence !== null &&
		(typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100)
	) {
		throw new Error('Invalid observation payload.');
	}

	return {
		browserFingerprint: requiredString(payload.browserFingerprint, 512),
		canvasHash: optionalString(payload.canvasHash, 512),
		webglHash: optionalString(payload.webglHash, 512),
		platform: optionalString(payload.platform, 256),
		timezone: optionalString(payload.timezone, 128),
		screenResolution,
		language: optionalString(payload.language, 64),
		fingerprintConfidence: confidence ?? null,
	};
}

function trustedNetworkContext(request: Request): TrustedNetworkContext {
	const ip = normalizeIp(request.headers.get('cf-connecting-ip') ?? '');
	const metadata = request.cf as { country?: unknown; asn?: unknown } | undefined;
	const country = typeof metadata?.country === 'string' && /^(?:[A-Z]{2}|T1)$/u.test(metadata.country) ? metadata.country : null;
	const asn =
		typeof metadata?.asn === 'number' && Number.isSafeInteger(metadata.asn) && metadata.asn >= 0
			? metadata.asn
			: null;

	return { ip, ipPrefix: networkPrefix(ip), country, asn };
}

async function optionalHash(secret: string, scope: 'canvas' | 'webgl' | 'user-agent', value: string | null): Promise<string | null> {
	return value ? hashObservationValue(secret, scope, value) : null;
}

export async function recordFingerprintObservation(
	request: Request,
	env: Pick<DojoEnvironment, 'ANTICHEAT_HASH_SECRET' | 'DB' | 'SESSION_SECRET'>
): Promise<Response> {
	let session;
	try {
		session = await verifySession(request, env.SESSION_SECRET);
	} catch {
		return noStoreResponse(401);
	}

	let payload: ObservationPayload;
	try {
		payload = await parseObservationPayload(request);
	} catch {
		return noStoreResponse(400);
	}

	let network: TrustedNetworkContext;
	try {
		network = trustedNetworkContext(request);
	} catch {
		return noStoreResponse(503);
	}

	try {
		const userAgent = request.headers.get('user-agent');
		const [sessionIdHash, browserFingerprintHash, canvasHash, webglHash, userAgentHash, ipHash, ipPrefixHash] = await Promise.all([
			hashObservationValue(env.ANTICHEAT_HASH_SECRET, 'session-id', session.sessionNonce),
			hashObservationValue(env.ANTICHEAT_HASH_SECRET, 'browser-fingerprint', payload.browserFingerprint),
			optionalHash(env.ANTICHEAT_HASH_SECRET, 'canvas', payload.canvasHash),
			optionalHash(env.ANTICHEAT_HASH_SECRET, 'webgl', payload.webglHash),
			optionalHash(env.ANTICHEAT_HASH_SECRET, 'user-agent', userAgent),
			hashObservationValue(env.ANTICHEAT_HASH_SECRET, 'ip', network.ip),
			hashObservationValue(env.ANTICHEAT_HASH_SECRET, 'ip-prefix', network.ipPrefix),
		]);

		await env.DB
			.prepare(
				`INSERT INTO fingerprint_observations (
					id, discord_user_id, discord_username_snapshot, session_id_hash,
					browser_fingerprint_hash, canvas_hash, webgl_hash, user_agent_hash,
					platform, timezone, screen_resolution, language, fingerprint_confidence,
					ip_hash, ip_prefix_hash, country, asn, payload_version, hash_key_version, captured_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(session_id_hash) DO NOTHING`
			)
			.bind(
				crypto.randomUUID(),
				session.discordUserId,
				session.discordUsername,
				sessionIdHash,
				browserFingerprintHash,
				canvasHash,
				webglHash,
				userAgentHash,
				payload.platform,
				payload.timezone,
				payload.screenResolution,
				payload.language,
				payload.fingerprintConfidence,
				ipHash,
				ipPrefixHash,
				network.country,
				network.asn,
				OBSERVATION_PAYLOAD_VERSION,
				HASH_KEY_VERSION,
				new Date().toISOString()
			)
			.run();
	} catch {
		return noStoreResponse(503);
	}

	return noStoreResponse(204);
}
