import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	createSiteClosure,
	parseSiteClosure,
	readSiteClosureCookie,
	serializeSiteClosure,
	siteClosureCookie,
	siteClosureView,
	SITE_CLOSURE_COOKIE,
	SITE_CLOSURE_MS,
} from '../src/lib/site-closure.js';

const now = 1_800_000_000_000;
const closure = createSiteClosure(now);
const cookie = `${SITE_CLOSURE_COOKIE}=${serializeSiteClosure(closure)}`;

test('closure lasts exactly 60 seconds after the original close deadline', () => {
	assert.equal(closure.reopensAt - closure.closesAt, SITE_CLOSURE_MS);
	assert.deepEqual(parseSiteClosure(serializeSiteClosure(closure), now), closure);
	assert.ok(parseSiteClosure(serializeSiteClosure(closure), closure.reopensAt - 1));
	assert.equal(parseSiteClosure(serializeSiteClosure(closure), closure.reopensAt), null);
});

test('accepts the pending 8-second countdown without restarting it', () => {
	const pending = createSiteClosure(now + 8000);
	assert.deepEqual(parseSiteClosure(serializeSiteClosure(pending), now), pending);
	assert.equal(siteClosureView(pending, '/', now).phase, 'pending');
	assert.equal(siteClosureView(pending, '/', now + 8000).redirect, '/closed');
});

test('malformed, oversized, expired and unbounded closure values cannot trap a browser', () => {
	for (const value of [
		null,
		'',
		'NaN.NaN',
		'1e12.2e12',
		'1.2.3',
		'-1.0',
		'999999999999999999.0',
		`${now}.${now + 999999}`,
		`${now + 8001}.${now + 8001 + SITE_CLOSURE_MS}`,
	]) {
		assert.equal(parseSiteClosure(value, now), null, String(value));
	}
	assert.equal(parseSiteClosure(serializeSiteClosure(createSiteClosure(now - 60_000)), now), null);
});

test('cookie is site-wide, bounded and secure over HTTPS without touching session cookies', () => {
	const encoded = siteClosureCookie(createSiteClosure(now + 8000), now, true);
	assert.match(encoded, /Path=\/; Max-Age=68; SameSite=Lax; Secure$/);
	assert.deepEqual(readSiteClosureCookie(`session=untouched; ${cookie}; other=value`, now), closure);
	assert.equal(readSiteClosureCookie(`prefix_${cookie}`, now), null);
	assert.match(siteClosureCookie(null, now), /^dojo_mascot_closure=; Path=\/; Max-Age=0; SameSite=Lax$/);
});

test('browser navigation keeps closure across home, login and tutorial refreshes', () => {
	for (const path of ['/', '/login', '/docs/tutorials/', '/docs/tutorials/index.html'])
		assert.equal(siteClosureView(closure, path, now).redirect, '/closed');
	assert.deepEqual(siteClosureView(closure, '/closed', now + 30_001), {
		phase: 'closed',
		redirect: null,
		remaining: 30,
	});
	assert.equal(siteClosureView(closure, '/closed/', now).redirect, null);
});

test('expiry and cancellation reopen the browser without an old redirect loop', () => {
	assert.equal(siteClosureView(closure, '/closed', closure.reopensAt).redirect, '/');
	assert.equal(siteClosureView(null, '/closed', now).redirect, '/');
	assert.equal(siteClosureView(null, '/docs/tutorials/', now).redirect, null);
	assert.equal(siteClosureView(createSiteClosure(now + 8000), '/closed', now).redirect, '/');
});
