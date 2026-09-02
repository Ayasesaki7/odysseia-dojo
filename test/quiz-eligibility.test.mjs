import assert from 'node:assert/strict';
import { timingSafeEqual } from 'node:crypto';
import { test } from 'node:test';

import { apiKeysMatch, quizEligibilityWindow } from '../src/lib/quiz-eligibility.ts';

test('quiz eligibility credentials compare fixed-length digests', async () => {
	const comparedLengths = [];
	const originalTimingSafeEqual = Object.getOwnPropertyDescriptor(crypto.subtle, 'timingSafeEqual');
	Object.defineProperty(crypto.subtle, 'timingSafeEqual', {
		configurable: true,
		value(left, right) {
			comparedLengths.push([left.byteLength, right.byteLength]);
			return timingSafeEqual(new Uint8Array(left), new Uint8Array(right));
		},
	});

	try {
		assert.equal(await apiKeysMatch('fixture-credential', 'fixture-credential'), true);
		assert.equal(await apiKeysMatch('short', 'fixture-credential'), false);
		assert.equal(await apiKeysMatch('a-much-longer-fixture-credential', 'fixture-credential'), false);
		assert.deepEqual(comparedLengths, [
			[32, 32],
			[32, 32],
			[32, 32],
		]);
	} finally {
		if (originalTimingSafeEqual) {
			Object.defineProperty(crypto.subtle, 'timingSafeEqual', originalTimingSafeEqual);
		} else {
			delete crypto.subtle.timingSafeEqual;
		}
	}
});

test('quiz eligibility window includes the exact eight-day cutoff and request time', () => {
	const now = Date.parse('2026-09-02T10:00:00.000Z');

	assert.deepEqual(quizEligibilityWindow(now), {
		earliest: '2026-08-25T10:00:00.000Z',
		latest: '2026-09-02T10:00:00.000Z',
	});
});
