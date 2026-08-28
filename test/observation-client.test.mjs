import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	createObservationController,
	OBSERVATION_LOCAL_SUCCESS_TTL_MS,
	OBSERVATION_PAYLOAD_VERSION,
} from '../src/lib/observation-client.js';
import { THUMBMARK_OPTIONS } from '../src/lib/thumbmark-options.js';

function createStorage(initialValues = {}) {
	const values = new Map(Object.entries(initialValues));
	return {
		getItem(key) {
			return values.get(key) ?? null;
		},
		setItem(key, value) {
			values.set(key, value);
		},
	};
}

function fixtureSignals(overrides = {}) {
	return {
		browserFingerprint: 'fixture-browser-fingerprint',
		canvasHash: 'fixture-canvas-hash',
		webglHash: 'fixture-webgl-hash',
		platform: 'FixtureOS',
		timezone: 'Asia/Hong_Kong',
		screenResolution: '1920x1080',
		language: 'zh-CN',
		...overrides,
	};
}

test('keeps the locally bundled Thumbmark collector limited to approved components with logging disabled', () => {
	assert.deepEqual(THUMBMARK_OPTIONS, {
		include: ['canvas', 'webgl', 'system', 'screen', 'locales'],
		exclude: ['audio', 'fonts', 'hardware', 'math', 'permissions', 'plugins', 'speech', 'webrtc'],
		logging: false,
		stabilize: [],
	});
});

test('collects and posts only allowlisted browser signals, then reports a low-interruption success state', async () => {
	const postedPayloads = [];
	const states = [];
	const controller = createObservationController({
		collect: async () =>
			fixtureSignals({
				discordUserId: 'forged-discord-id',
				ip: '198.51.100.9',
				userAgent: 'forged-user-agent',
				capturedAt: '2000-01-01T00:00:00.000Z',
			}),
		post: async (payload) => postedPayloads.push(payload),
		storage: createStorage(),
		now: () => 10_000,
		onState: (state) => states.push(state),
	});

	await controller.start();

	assert.deepEqual(postedPayloads, [
		{
			payloadVersion: OBSERVATION_PAYLOAD_VERSION,
			browserFingerprint: 'fixture-browser-fingerprint',
			canvasHash: 'fixture-canvas-hash',
			webglHash: 'fixture-webgl-hash',
			platform: 'FixtureOS',
			timezone: 'Asia/Hong_Kong',
			screenResolution: '1920x1080',
			language: 'zh-CN',
		},
	]);
	assert.deepEqual(states, ['recorded']);
});

test('keeps reading non-blocking when signal collection fails', async () => {
	const states = [];
	const controller = createObservationController({
		collect: async () => {
			throw new Error('Fingerprinting is unavailable.');
		},
		post: async () => {
			throw new Error('Posting must not run after collection failure.');
		},
		storage: createStorage(),
		now: () => 10_000,
		onState: (state) => states.push(state),
	});

	await controller.start();
	assert.deepEqual(states, ['retry']);
});

test('exposes a neutral retry state after a failed write and retries with a fresh collection', async () => {
	let collections = 0;
	let posts = 0;
	const states = [];
	const controller = createObservationController({
		collect: async () => fixtureSignals({ browserFingerprint: `fixture-${++collections}` }),
		post: async () => {
			posts += 1;
			if (posts === 1) throw new Error('The observation endpoint is unavailable.');
		},
		storage: createStorage(),
		now: () => 10_000,
		onState: (state) => states.push(state),
	});

	await controller.start();
	await controller.retry();

	assert.equal(collections, 2);
	assert.equal(posts, 2);
	assert.deepEqual(states, ['retry', 'recorded']);
});

test('coalesces duplicate automatic attempts and leaves a localStorage hint non-authoritative', async () => {
	let posts = 0;
	const now = 10_000;
	const storage = createStorage();
	const initial = createObservationController({
		collect: async () => fixtureSignals(),
		post: async () => {
			posts += 1;
		},
		storage,
		now: () => now,
		onState: () => {},
	});

	await Promise.all([initial.start(), initial.start()]);
	assert.equal(posts, 1, 'Concurrent automatic attempts share one collection and post.');

	const states = [];
	const controller = createObservationController({
		collect: async () => fixtureSignals(),
		post: async () => {
			posts += 1;
		},
		storage,
		now: () => now,
		onState: (state) => states.push(state),
	});

	await controller.start();
	assert.equal(posts, 1, 'The recent hint may suppress only an automatic duplicate attempt.');
	assert.deepEqual(states, ['available']);

	await controller.retry();
	assert.equal(posts, 2, 'A retry must still reach the server despite a local hint.');
	assert.deepEqual(states, ['available', 'recorded']);
	assert.equal(OBSERVATION_LOCAL_SUCCESS_TTL_MS > 0, true);
});
