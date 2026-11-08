import { OBSERVATION_PAYLOAD_VERSION } from './observation-contract.js';

export { OBSERVATION_PAYLOAD_VERSION } from './observation-contract.js';

const RECORDED_SESSION_KEY = `dojo.observation.recorded-session.v${OBSERVATION_PAYLOAD_VERSION}`;

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

function hasRecordedSession(storage, sessionMarker) {
	if (!storage || !sessionMarker) return false;
	try {
		return storage.getItem(RECORDED_SESSION_KEY) === sessionMarker;
	} catch {
		return false;
	}
}

function recordSession(storage, sessionMarker) {
	if (!storage || !sessionMarker) return;
	try {
		storage.setItem(RECORDED_SESSION_KEY, sessionMarker);
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

export function createObservationController({ collect, post, storage, sessionMarker, onState = (_state) => {} }) {
	let inFlight;

	async function run(force) {
		if (!force && hasRecordedSession(storage, sessionMarker)) {
			notify(onState, 'already-recorded');
			return;
		}

		try {
			const payload = allowlistedObservationPayload(await collect());
			await post(payload);
			recordSession(storage, sessionMarker);
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
