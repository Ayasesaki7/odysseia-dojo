import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
	assertFixtureCiWorkflow,
	assertFixtureCommands,
	assertNoForbiddenFixtureEnvironment,
	verifyPublicFixtureBoundary,
} from '../scripts/verify-public-fixture-boundary.mjs';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, '..');
const runFile = promisify(execFile);

async function makeBoundaryProject(t) {
	const root = await mkdtemp(resolve(tmpdir(), 'odysseia-dojo-public-boundary-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(resolve(root, '.github/workflows'), { recursive: true });
	await Promise.all([
		copyFile(resolve(projectRoot, 'package.json'), resolve(root, 'package.json')),
		copyFile(resolve(projectRoot, 'wrangler.jsonc'), resolve(root, 'wrangler.jsonc')),
		copyFile(
			resolve(projectRoot, '.github/workflows/public-fixture-ci.yml'),
			resolve(root, '.github/workflows/public-fixture-ci.yml'),
		),
	]);
	await runFile('git', ['init', '--quiet', root]);
	return root;
}

test('public fixture boundary accepts the checked-in public tree', async () => {
	await verifyPublicFixtureBoundary({ projectRoot });
});

test('public fixture boundary rejects injected production configuration without echoing values', () => {
	assert.throws(
		() => assertNoForbiddenFixtureEnvironment({ SESSION_SECRET: 'F08_PRODUCTION_SECRET_CANARY' }),
		(error) => {
			assert.match(error.message, /SESSION_SECRET/u);
			assert.doesNotMatch(error.message, /F08_PRODUCTION_SECRET_CANARY/u);
			return true;
		},
	);
});

test('public fixture boundary rejects workflows that request repository secrets', () => {
	assert.throws(
		() => assertFixtureCiWorkflow('jobs:\n  validate:\n    env:\n      TOKEN: ${{ secrets.DEPLOY_TOKEN }}\n'),
		/secret context/u,
	);
});

test('public fixture boundary rejects workflows that can operate on D1', () => {
	assert.throws(
		() => assertFixtureCiWorkflow('jobs:\n  validate:\n    steps:\n      - run: wrangler d1 execute'),
		/D1 command/u,
	);
});

test('public fixture boundary rejects a command that assembles fixtures after work', () => {
	const scripts = Object.fromEntries(
		['format', 'lint', 'test', 'check', 'build', 'test:worker', 'verify:fixture-boundary', 'validate', 'preview'].map(
			(command) => [command, 'npm run content:fixtures && true'],
		),
	);
	scripts.build = 'astro build && npm run content:fixtures';

	assert.throws(() => assertFixtureCommands({ scripts }), /build must directly reassemble fixtures/u);
});

test('public fixture boundary rejects Git-tracked runtime content without naming it', async (t) => {
	const root = await makeBoundaryProject(t);
	const trackedRuntimeFile = resolve(root, 'src/content/docs/tutorials/should-not-track.md');
	await mkdir(resolve(trackedRuntimeFile, '..'), { recursive: true });
	await writeFile(trackedRuntimeFile, 'fixture sentinel', 'utf8');
	await runFile('git', ['-C', root, 'add', 'src/content/docs/tutorials/should-not-track.md']);

	await assert.rejects(verifyPublicFixtureBoundary({ projectRoot: root, environment: {} }), (error) => {
		assert.match(error.message, /Git tracks materialized runtime content/u);
		assert.doesNotMatch(error.message, /should-not-track/u);
		return true;
	});
});

test('public fixture boundary rejects a runtime symlink without naming it', async (t) => {
	const root = await makeBoundaryProject(t);
	const externalRoot = resolve(root, 'external-content');
	await mkdir(externalRoot);
	await mkdir(resolve(root, 'src/content/docs'), { recursive: true });
	await symlink(externalRoot, resolve(root, 'src/content/docs/tutorials'), 'dir');

	await assert.rejects(verifyPublicFixtureBoundary({ projectRoot: root, environment: {} }), (error) => {
		assert.match(error.message, /fixture runtime paths contain a symlink/u);
		assert.doesNotMatch(error.message, /external-content/u);
		return true;
	});
});
