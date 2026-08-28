import { OBSERVATION_PAYLOAD_VERSION } from './observation-contract.js';

export { OBSERVATION_PAYLOAD_VERSION } from './observation-contract.js';
export const OBSERVATION_LOCAL_SUCCESS_TTL_MS = 30_000;

const LOCAL_SUCCESS_KEY = `dojo.observation.local-success.v${OBSERVATION_PAYLOAD_VERSION}`;

function requiredString(value, field, maximumLength) {
	if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
		throw new Error(`${field} must be a non-empty string within its allowed length.`);
	}
	return value;
}

function optionalString(value, field, maximumLength) {
	if (value === undefined || value === null) return undefined;
	return requiredString(value, field, maximumLength);
}

export function allowlistedObservationPayload(signals) {
	if (typeof signals !== 'object' || signals === null || Array.isArray(signals)) {
		throw new Error('Browser signals must be an object.');
	}

	const payload = {
		payloadVersion: OBSERVATION_PAYLOAD_VERSION,
		browserFingerprint: requiredString(signals.browserFingerprint, 'browserFingerprint', 512),
	};
	for (const [signal, field, maximumLength] of [
		['canvasHash', 'canvasHash', 512],
		['webglHash', 'webglHash', 512],
		['platform', 'platform', 256],
		['timezone', 'timezone', 128],
		['screenResolution', 'screenResolution', 32],
		['language', 'language', 64],
	]) {
		const value = optionalString(signals[signal], field, maximumLength);
		if (value !== undefined) payload[field] = value;
	}

	if (signals.fingerprintConfidence !== undefined && signals.fingerprintConfidence !== null) {
		if (
			typeof signals.fingerprintConfidence !== 'number' ||
			!Number.isFinite(signals.fingerprintConfidence) ||
			signals.fingerprintConfidence < 0 ||
			signals.fingerprintConfidence > 100
		) {
			throw new Error('fingerprintConfidence must be a number from 0 to 100.');
		}
		payload.fingerprintConfidence = signals.fingerprintConfidence;
	}

	return payload;
}

function hasRecentLocalSuccess(storage, now) {
	if (!storage) return false;
	try {
		const storedAt = storage.getItem(LOCAL_SUCCESS_KEY);
		if (storedAt === null) return false;
		const recordedAt = Number(storedAt);
		return Number.isFinite(recordedAt) && recordedAt <= now && now - recordedAt < OBSERVATION_LOCAL_SUCCESS_TTL_MS;
	} catch {
		return false;
	}
}

function recordLocalSuccess(storage, now) {
	if (!storage) return;
	try {
		storage.setItem(LOCAL_SUCCESS_KEY, String(now));
	} catch {
		// Browser storage is an optional request-suppression hint, not an authority.
	}
}

function notify(onState, state) {
	try {
		onState(state);
	} catch {
		// A rendering failure must not turn a completed observation into a retry.
	}
}

export function createObservationController({ collect, post, storage, now = () => Date.now(), onState = (_state) => {} }) {
	let inFlight;

	async function run(force) {
		const timestamp = now();
		if (!force && hasRecentLocalSuccess(storage, timestamp)) {
			notify(onState, 'available');
			return;
		}

		try {
			const payload = allowlistedObservationPayload(await collect());
			await post(payload);
			recordLocalSuccess(storage, timestamp);
			notify(onState, 'recorded');
		} catch {
			notify(onState, 'retry');
		}
	}

	function attempt(force) {
		if (inFlight) return inFlight;
		inFlight = run(force).finally(() => {
			inFlight = undefined;
		});
		return inFlight;
	}

	return {
		start: () => attempt(false),
		retry: () => attempt(true),
	};
}
