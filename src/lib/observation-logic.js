export const HASH_KEY_VERSION = 1;

const HASH_INPUT_PREFIX = 'odysseia-dojo:observation';
const HASH_SCOPES = new Set(['ip', 'ip-prefix', 'browser-fingerprint', 'canvas', 'webgl', 'user-agent', 'session-id']);
const encoder = new TextEncoder();

function invalidIpAddress() {
	throw new Error('Expected a valid IP address.');
}

function parseIpv4(value) {
	const parts = value.split('.');
	if (parts.length !== 4) return undefined;

	const octets = [];
	for (const part of parts) {
		if (!/^\d{1,3}$/u.test(part)) return undefined;
		const octet = Number(part);
		if (!Number.isInteger(octet) || octet < 0 || octet > 255) return undefined;
		octets.push(octet);
	}
	return octets;
}

function parseIpv6(value) {
	if (!value.includes(':') || /(?:\[|\]|%)/u.test(value)) return undefined;

	let hostname;
	try {
		hostname = new URL(`http://[${value}]/`).hostname;
	} catch {
		return undefined;
	}

	if (!hostname.startsWith('[') || !hostname.endsWith(']')) return undefined;
	const canonical = hostname.slice(1, -1).toLowerCase();
	const parts = canonical.split('::');
	if (parts.length > 2) return undefined;

	const left = parts[0] ? parts[0].split(':') : [];
	const right = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
	const missing = 8 - left.length - right.length;
	if (missing < 0 || (parts.length === 1 && missing !== 0)) return undefined;

	const words = [...left, ...Array(missing).fill('0'), ...right];
	if (words.length !== 8) return undefined;

	const parsedWords = [];
	for (const word of words) {
		if (!/^[\da-f]{1,4}$/u.test(word)) return undefined;
		parsedWords.push(Number.parseInt(word, 16));
	}
	return parsedWords;
}

function formatIpv6(words) {
	const values = words.map((word) => word.toString(16));
	let bestStart = -1;
	let bestLength = 0;

	for (let index = 0; index < values.length; ) {
		if (values[index] !== '0') {
			index += 1;
			continue;
		}

		const start = index;
		while (index < values.length && values[index] === '0') index += 1;
		const length = index - start;
		if (length > bestLength) {
			bestStart = start;
			bestLength = length;
		}
	}

	if (bestLength < 2) return values.join(':');

	const before = values.slice(0, bestStart).join(':');
	const after = values.slice(bestStart + bestLength).join(':');
	if (!before && !after) return '::';
	if (!before) return `::${after}`;
	if (!after) return `${before}::`;
	return `${before}::${after}`;
}

export function normalizeIp(value) {
	if (typeof value !== 'string') invalidIpAddress();
	const candidate = value.trim();
	if (!candidate || candidate.includes(',')) invalidIpAddress();

	const ipv4 = parseIpv4(candidate);
	if (ipv4) return ipv4.join('.');

	const ipv6 = parseIpv6(candidate);
	if (ipv6) return formatIpv6(ipv6);

	invalidIpAddress();
}

export function networkPrefix(value) {
	const normalized = normalizeIp(value);
	const ipv4 = parseIpv4(normalized);
	if (ipv4) return `${ipv4.slice(0, 3).join('.')}.0/24`;

	const ipv6 = parseIpv6(normalized);
	if (!ipv6) invalidIpAddress();
	return `${formatIpv6([...ipv6.slice(0, 4), 0, 0, 0, 0])}/64`;
}

export function versionedHashInput(scope, value) {
	if (!HASH_SCOPES.has(scope)) throw new Error('Unsupported observation hash scope.');
	if (typeof value !== 'string' || value.length === 0) throw new Error('Observation hash values must be non-empty strings.');
	return `${HASH_INPUT_PREFIX}:v${HASH_KEY_VERSION}:${scope}:${value}`;
}

export async function hashObservationValue(secret, scope, value) {
	const keyBytes = encoder.encode(secret);
	if (keyBytes.byteLength < 32) throw new Error('ANTICHEAT_HASH_SECRET must contain at least 32 bytes.');

	const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(versionedHashInput(scope, value)));
	return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
