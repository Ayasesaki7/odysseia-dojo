import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import * as outputVerifier from '../scripts/verify-fixture-output.mjs';

async function makeFixtureOutput(root) {
	for (const path of [
		'docs/tutorials/index.html',
		'docs/tutorials/discord-and-odysseia/index.html',
		'docs/tutorials/sillytavern-api/index.html',
		'docs/extensions/index.html',
		'docs/extensions/account-safety/index.html',
		'docs/extensions/legacy-interface/index.html',
		'protected/tutorial-images/fixture-api-settings.svg',
		'protected/attachments/fixture-reading-checklist.txt',
		'pagefind/fragment/fixture.pf_fragment',
	]) {
		const destination = resolve(root, path);
		await mkdir(resolve(destination, '..'), { recursive: true });
		await writeFile(destination, 'public fixture output', 'utf8');
	}
}

async function makeFixtureOutputRoots(t) {
	const root = await mkdtemp(resolve(tmpdir(), 'odysseia-dojo-fixture-output-'));
	t.after(() => rm(root, { recursive: true, force: true }));

	const outputRoot = resolve(root, 'client');
	const serverOutputRoot = resolve(root, 'server');
	await Promise.all([
		makeFixtureOutput(outputRoot),
		(async () => {
			await mkdir(serverOutputRoot, { recursive: true });
			await writeFile(resolve(serverOutputRoot, 'entry.mjs'), 'public fixture server output', 'utf8');
		})(),
	]);

	return { outputRoot, serverOutputRoot };
}

test('fixture output verification rejects a private-content canary without echoing it', async (t) => {
	const { outputRoot, serverOutputRoot } = await makeFixtureOutputRoots(t);

	await outputVerifier.verifyFixtureOutput({ outputRoot, serverOutputRoot, report: false });
	await writeFile(resolve(outputRoot, 'docs/tutorials/index.html'), 'F08_PRIVATE_CONTENT_CANARY', 'utf8');

	await assert.rejects(outputVerifier.verifyFixtureOutput({ outputRoot, serverOutputRoot, report: false }), (error) => {
		assert.match(error.message, /forbidden isolation marker/u);
		assert.doesNotMatch(error.message, /F08_PRIVATE_CONTENT_CANARY/u);
		return true;
	});
});

test('fixture output verification rejects an unexpected protected document without naming it', async (t) => {
	const { outputRoot, serverOutputRoot } = await makeFixtureOutputRoots(t);

	const unexpectedDocument = resolve(outputRoot, 'docs/tutorials/should-not-publish/index.html');
	await mkdir(resolve(unexpectedDocument, '..'), { recursive: true });
	await writeFile(unexpectedDocument, 'public fixture output', 'utf8');

	await assert.rejects(outputVerifier.verifyFixtureOutput({ outputRoot, serverOutputRoot, report: false }), (error) => {
		assert.match(error.message, /unexpected protected documents/u);
		assert.doesNotMatch(error.message, /should-not-publish/u);
		return true;
	});
});

test('fixture output verification rejects an expected output path that is a directory', async (t) => {
	const { outputRoot, serverOutputRoot } = await makeFixtureOutputRoots(t);

	const expectedDocument = resolve(outputRoot, 'docs/tutorials/index.html');
	await rm(expectedDocument);
	await mkdir(expectedDocument);

	await assert.rejects(outputVerifier.verifyFixtureOutput({ outputRoot, serverOutputRoot, report: false }), (error) => {
		assert.match(error.message, /Expected fixture build output is not a file/u);
		assert.doesNotMatch(error.message, /docs\/tutorials\/index\.html/u);
		return true;
	});
});

test('fixture output verification rejects a generated symlink without naming it', async (t) => {
	const { outputRoot, serverOutputRoot } = await makeFixtureOutputRoots(t);

	const expectedAsset = resolve(outputRoot, 'protected/attachments/fixture-reading-checklist.txt');
	const linkedOutput = resolve(outputRoot, 'linked-output.txt');
	await writeFile(linkedOutput, 'public fixture output', 'utf8');
	await rm(expectedAsset);
	await symlink(linkedOutput, expectedAsset);

	await assert.rejects(outputVerifier.verifyFixtureOutput({ outputRoot, serverOutputRoot, report: false }), (error) => {
		assert.match(error.message, /output contains a symlink/u);
		assert.doesNotMatch(error.message, /linked-output/u);
		return true;
	});
});

test('fixture output verification rejects a private repository reference without echoing it', async (t) => {
	const { outputRoot, serverOutputRoot } = await makeFixtureOutputRoots(t);
	await writeFile(resolve(outputRoot, 'docs/tutorials/index.html'), 'odysseia-dojo-content', 'utf8');

	await assert.rejects(outputVerifier.verifyFixtureOutput({ outputRoot, serverOutputRoot, report: false }), (error) => {
		assert.match(error.message, /private repository reference/u);
		assert.doesNotMatch(error.message, /odysseia-dojo-content/u);
		return true;
	});
});

test('fixture output verification scans deployable server artifacts without echoing a canary', async (t) => {
	const { outputRoot, serverOutputRoot } = await makeFixtureOutputRoots(t);
	await writeFile(resolve(serverOutputRoot, 'entry.mjs'), 'F08_PRIVATE_CONTENT_CANARY', 'utf8');

	await assert.rejects(outputVerifier.verifyFixtureOutput({ outputRoot, serverOutputRoot, report: false }), (error) => {
		assert.match(error.message, /forbidden isolation marker/u);
		assert.doesNotMatch(error.message, /F08_PRIVATE_CONTENT_CANARY/u);
		return true;
	});
});

test('fixture output verification rejects forbidden derived paths in server artifacts without naming them', async (t) => {
	const { outputRoot, serverOutputRoot } = await makeFixtureOutputRoots(t);
	const forbiddenArtifact = resolve(serverOutputRoot, 'archive/F08_FORBIDDEN_SERVER_ARTIFACT.mjs');
	await mkdir(resolve(forbiddenArtifact, '..'), { recursive: true });
	await writeFile(forbiddenArtifact, 'public fixture server output', 'utf8');

	await assert.rejects(outputVerifier.verifyFixtureOutput({ outputRoot, serverOutputRoot, report: false }), (error) => {
		assert.match(error.message, /forbidden derived paths/u);
		assert.doesNotMatch(error.message, /F08_FORBIDDEN_SERVER_ARTIFACT/u);
		return true;
	});
});
