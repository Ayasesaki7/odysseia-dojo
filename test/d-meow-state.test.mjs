import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
	createDMeowSequence,
	dMeowTextParts,
	dMeowPlainText,
	isDMeowReadingPage,
	D_MEOW_BRAND,
	D_MEOW_LOGOUT,
} from '../src/lib/d-meow-state.js';

function feed(sequence, text, options = {}) {
	return [...text].map((key) => sequence.feed({ key, ...options }));
}

test('only the full secret triggers; no partial or overlapping duplicate triggers', () => {
	const sequence = createDMeowSequence();
	assert.deepEqual(feed(sequence, 'durvis'), [false, false, false, false, false, true]);
	assert.deepEqual(feed(sequence, 'is'), [false, false]);
});
test('the secret is case insensitive and can be used again to restore the skin', () => {
	const sequence = createDMeowSequence();
	assert.equal(feed(sequence, 'DURVIS').at(-1), true);
	assert.equal(feed(sequence, 'durvis').at(-1), true);
});
test('a wrong character cancels the sequence and a fresh d starts it again', () => {
	const sequence = createDMeowSequence();
	assert.ok(feed(sequence, 'durxvis').every((value) => !value));
	assert.equal(feed(sequence, 'ddurvis').at(-1), true);
});
test('a pause of more than two seconds clears the partial sequence', () => {
	let now = 100;
	const sequence = createDMeowSequence({ now: () => now });
	feed(sequence, 'dur');
	now += 2001;
	assert.ok(feed(sequence, 'vis').every((value) => !value));
	assert.equal(feed(sequence, 'durvis').at(-1), true);
});
for (const reason of ['editable', 'modifier', 'repeat', 'composing']) {
	test(`${reason} input never triggers or completes the shortcut`, () => {
		const sequence = createDMeowSequence();
		assert.ok(feed(sequence, 'durvis', { [reason]: true }).every((value) => !value));
		feed(sequence, 'dur');
		sequence.feed({ key: 'v', [reason]: true });
		assert.ok(feed(sequence, 'is').every((value) => !value));
	});
}
test('focus loss and nonletter keys clear partial sequences', () => {
	const sequence = createDMeowSequence();
	feed(sequence, 'dur');
	sequence.reset();
	assert.ok(feed(sequence, 'vis').every((value) => !value));
	feed(sequence, 'dur');
	sequence.feed({ key: 'Tab' });
	assert.ok(feed(sequence, 'vis').every((value) => !value));
});
test('plain brand spelling, capitalized variants and Greek alias have exact output', () => {
	for (const input of ['类脑 Odysseia', '类脑 ODYSSEIA', '类脑ΟΔΥΣΣΕΙΑ'])
		assert.equal(dMeowPlainText(input), D_MEOW_BRAND);
	assert.equal(dMeowPlainText('类脑社区的教程。'), '旅程社区的教程。');
	assert.equal(dMeowPlainText('Made by KKTsN with 💖'), 'Made by KKTsN with 💖');
});
test('tokens preserve surrounding copy and distinguish annotated name from Greek wordmark', () => {
	assert.deepEqual(dMeowTextParts('认识类脑 Odysseia。'), [
		{ text: '认识', kind: 'text' },
		{ text: '旅程', kind: 'name' },
		{ text: ' ', kind: 'text' },
		{ text: 'ΟΡΙΖΟΝΤΑΣ', kind: 'greek' },
		{ text: '。', kind: 'text' },
	]);
	assert.equal(dMeowPlainText(''), '');
	assert.equal(dMeowPlainText('旅程 ΟΡΙΖΟΝΤΑΣ'), D_MEOW_BRAND);
});
test('reading context includes the entire docs shell and never public login pages', () => {
	for (const path of ['/docs', '/docs/', '/docs/tutorials/', '/docs/extensions/account-safety/'])
		assert.equal(isDMeowReadingPage(path), true, path);
	for (const path of ['/', '/login', '/closed', '/docs-preview/', '/api/auth/logout'])
		assert.equal(isDMeowReadingPage(path), false, path);
});
test('reading brands become one correction token with no trailing Greek alias', () => {
	for (const text of ['类脑 Odysseia', '类脑 ODYSSEIA', '类脑ΟΔΥΣΣΕΙΑ', '类脑']) {
		assert.deepEqual(dMeowTextParts(text, { reading: true }), [{ text: '旅程', kind: 'name' }]);
	}
	assert.equal(dMeowPlainText('类脑 Odysseia'), D_MEOW_BRAND, 'Homepage keeps its own branding.');
});
test('reading standalone aliases also use the correction instead of the homepage wordmark', () => {
	for (const text of ['Odysseia', 'ODYSSEIA', 'ΟΔΥΣΣΕΙΑ'])
		assert.deepEqual(dMeowTextParts(text, { reading: true }), [{ text: '旅程', kind: 'name' }]);
});
test('reading replacements preserve surrounding heading, navigation and prose copy', () => {
	assert.deepEqual(dMeowTextParts('Discord 与类脑 Odysseia：认识类脑社区。', { reading: true }), [
		{ text: 'Discord 与', kind: 'text' },
		{ text: '旅程', kind: 'name' },
		{ text: '：认识', kind: 'text' },
		{ text: '旅程', kind: 'name' },
		{ text: '社区。', kind: 'text' },
	]);
});
test('reading accessible attributes and browser titles use the corrected plain name', () => {
	assert.equal(dMeowPlainText('类脑 Odysseia - 道馆挑战', { reading: true }), '类脑 - 道馆挑战');
	assert.equal(dMeowPlainText('Discord 与类脑 Odysseia', { reading: true }), 'Discord 与类脑');
	assert.equal(dMeowPlainText('Made by KKTsN with 💖', { reading: true }), 'Made by KKTsN with 💖');
});
test('logout reuses the existing route, which clears the HttpOnly session and returns home', async () => {
	assert.equal(D_MEOW_LOGOUT, '/api/auth/logout');
	const route = await readFile(new URL('../src/pages/api/auth/logout.ts', import.meta.url), 'utf8');
	assert.match(route, /oauthRedirect\('\/', \[clearSessionCookie\(\)\]\)/);
});
test('theme implementation does not rewrite source, links, forms or code blocks', async () => {
	const source = await readFile(new URL('../src/lib/d-meow.ts', import.meta.url), 'utf8');
	const branding = await readFile(new URL('../src/lib/d-meow-branding.js', import.meta.url), 'utf8');
	assert.match(branding, /code, pre, kbd, samp, textarea, input, select/);
	assert.match(source, /\.sl-markdown-content/);
	assert.match(branding, /node\('s', '', '旅程'\)/);
	assert.match(source, /location\.replace\(D_MEOW_LOGOUT\)/);
	assert.doesNotMatch(source + branding, /\.innerHTML\s*=|document\.write|setAttribute\(['"]href|dojo_session=/);
});

test('homepage and reading companions omit the old caption and defeated mascot but retain the cutout and pause control', async () => {
	const source = await readFile(new URL('../src/lib/d-meow.ts', import.meta.url), 'utf8');
	const css = await readFile(new URL('../src/styles/d-meow.css', import.meta.url), 'utf8');
	assert.doesNotMatch(source, /戳不动的发言人|d-meow-caption/);
	const widget = source.slice(source.indexOf('function createWidget('), source.indexOf('function defeatedMascot('));
	assert.doesNotMatch(widget, /d-meow-defeated|\/mascot\/angry\.webp/);
	assert.match(widget, /if \(includeSideArt\) append\(figure, takeoverArt\(\)\)/);
	assert.match(source, /d-meow-takeover-cutout\.webp/);
	assert.match(source, /暂停摆手/);
	assert.match(css, /html\[data-dojo-theme='d-meow'\] \.public-hero > \.mascot\s*\{\s*display: none;/);
	assert.match(css, /\.d-meow-side-art[\s\S]*pointer-events: none/);
	const asset = await readFile(new URL('../public/mascot/d-meow-takeover-cutout.webp', import.meta.url));
	assert.equal(asset.toString('ascii', 0, 4), 'RIFF');
	assert.equal(asset.toString('ascii', 8, 12), 'WEBP');
	assert.ok(asset.includes(Buffer.from('ALPH')), 'Cutout must have a real alpha channel.');
});
test('reading corrections are page-scoped, equally sized and explicitly struck through', async () => {
	const source = await readFile(new URL('../src/lib/d-meow.ts', import.meta.url), 'utf8');
	const css = await readFile(new URL('../src/styles/d-meow.css', import.meta.url), 'utf8');
	assert.match(source, /const reading = isDMeowReadingPage\(location.pathname\)/);
	assert.match(source, /branding.apply\(\{ reading \}\)/);
	assert.doesNotMatch(source, /text.parentElement\?\.closest\('\.sl-markdown-content'\)/);
	assert.match(css, /\.d-meow-correction s\s*\{[^}]*text-decoration-line: line-through;/);
	assert.match(css, /\.d-meow-original\s*\{[^}]*font: inherit;[^}]*font-size: 1em;/);
});
test('broadcast retains the original fallen mascot with its caption below a bounded image stage', async () => {
	const source = await readFile(new URL('../src/lib/d-meow.ts', import.meta.url), 'utf8');
	const css = await readFile(new URL('../src/styles/d-meow.css', import.meta.url), 'utf8');
	assert.match(source, /const victor = createWidget\(false\)/);
	assert.match(source, /append\(scene, defeatedMascot\(\), victor\)/);
	assert.match(source, /append\(figure, stage, node\('figcaption', '', '……我记住了。'\)\)/);
	assert.match(css, /\.d-meow-broadcast-scene\s*\{\s*display: grid;/);
	assert.doesNotMatch(css.match(/\.d-meow-broadcast-scene\s*\{[^}]*\}/)?.[0] ?? '', /\bheight:/);
	assert.match(css, /\.d-meow-defeated-art\s*\{[^}]*aspect-ratio: 4 \/ 3;/);
	assert.doesNotMatch(css.match(/\.d-meow-defeated figcaption\s*\{[^}]*\}/)?.[0] ?? '', /position:/);
	assert.match(css, /\.d-meow-side-art\s*\{[^}]*right: calc\(100% \+ 14px\);/);
});
