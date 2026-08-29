import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(testDirectory, '..');

async function readProjectFile(path) {
	return readFile(resolve(projectRoot, path), 'utf8');
}

test('public commands and GitHub Actions CI always use fixture-only validation', async () => {
	const packageJson = JSON.parse(await readProjectFile('package.json'));
	for (const command of [
		'format',
		'lint',
		'test',
		'check',
		'build',
		'test:worker',
		'verify:fixture-boundary',
		'verify:fixture-references',
		'validate',
		'preview',
	]) {
		assert.match(
			packageJson.scripts[command] ?? '',
			/^npm run content:fixtures(?:\s*&&|\s*$)/u,
			`${command} must reassemble fixtures before it does work.`,
		);
	}
	let previousStep = -1;
	for (const command of [
		'verify:fixture-boundary',
		'format',
		'lint',
		'test',
		'check',
		'verify:fixture-references',
		'build',
		'test:worker',
	]) {
		const step = packageJson.scripts.validate.indexOf(`npm run ${command}`);
		assert.ok(step > previousStep, `validate must run ${command} in the public validation sequence.`);
		previousStep = step;
	}
	for (const testFile of [
		'public-fixture-ci',
		'public-fixture-boundary',
		'fixture-output-isolation',
		'fixture-reference-validation',
	]) {
		assert.match(packageJson.scripts.test, new RegExp(`test/${testFile}\\.test\\.mjs`, 'u'));
	}

	const workflow = await readProjectFile('.github/workflows/public-fixture-ci.yml');
	assert.match(workflow, /^name: Public fixture CI$/mu);
	assert.match(workflow, /^on:\n[\s\S]*?^\s{2}pull_request:/mu);
	assert.match(workflow, /^on:\n[\s\S]*?^\s{2}push:/mu);
	assert.match(workflow, /^permissions:\n\s{2}contents: read$/mu);
	assert.match(workflow, /uses: actions\/checkout@v6/u);
	assert.match(workflow, /persist-credentials: false/u);
	assert.match(workflow, /uses: actions\/setup-node@v7/u);
	assert.match(workflow, /node-version: 24/u);
	assert.match(workflow, /cache: npm/u);
	assert.match(workflow, /npm ci/u);
	assert.match(workflow, /npm run validate/u);
	assert.doesNotMatch(
		workflow,
		/(?:content:local|odysseia-dojo-content|secrets\.|wrangler\s+deploy|npm\s+run\s+deploy)/iu,
	);
});
