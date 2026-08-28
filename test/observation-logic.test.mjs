import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	HASH_KEY_VERSION,
	hashObservationValue,
	networkPrefix,
	normalizeIp,
	versionedHashInput,
} from '../src/lib/observation-logic.js';

const TEST_HASH_SECRET = '0123456789abcdef0123456789abcdef';

test('canonicalizes Cloudflare client IP addresses before deriving their network prefixes', () => {
	assert.equal(normalizeIp('203.000.113.045'), '203.0.113.45');
	assert.equal(networkPrefix('203.0.113.45'), '203.0.113.0/24');
	assert.equal(normalizeIp('2001:0DB8:0000:0000:0000:FF00:0042:8329'), '2001:db8::ff00:42:8329');
	assert.equal(networkPrefix('2001:db8::ff00:42:8329'), '2001:db8::/64');
	assert.equal(normalizeIp('::ffff:192.0.2.128'), '::ffff:c000:280');
});

test('rejects non-address values instead of treating forwarded-header lists as a client IP', () => {
	for (const value of ['', '203.0.113.45, 198.51.100.2', '2001:db8::not-hex', '300.0.0.1']) {
		assert.throws(() => normalizeIp(value), /valid IP address/u);
	}
});

test('uses domain-separated versioned HMAC inputs with fixed known vectors', async () => {
	assert.equal(HASH_KEY_VERSION, 1);
	assert.equal(versionedHashInput('ip', '203.0.113.45'), 'odysseia-dojo:observation:v1:ip:203.0.113.45');
	assert.equal(
		await hashObservationValue(TEST_HASH_SECRET, 'ip', '203.0.113.45'),
		'8e92c20dee08a0072490306807fd2e9caeee87f51fbe65b5899945bab3cc19a0'
	);
	assert.equal(
		await hashObservationValue(TEST_HASH_SECRET, 'ip-prefix', '203.0.113.0/24'),
		'bbf66f093fcad99656736f74a2b11247454720554e0aeabb62047587d9e8cf53'
	);
	assert.equal(
		await hashObservationValue(TEST_HASH_SECRET, 'browser-fingerprint', 'fixture-browser-fingerprint'),
		'80a34e9a54d59c71dffea5a98b9ff3be51e3c04486c048da6df8bfa86d49bcbc'
	);
	assert.equal(
		await hashObservationValue(TEST_HASH_SECRET, 'session-id', 'fixture-session-nonce'),
		'737c8395146c0e144af9791e2cce7ffe454ed77a948fb6734a7c89f7c5e1c06c'
	);
});
