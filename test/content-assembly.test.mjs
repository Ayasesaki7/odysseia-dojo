import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, lstat, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { materializeContent } from '../scripts/content-assembly.mjs';

const allowedRoots = [
	'src/content/docs/tutorials',
	'src/content/docs/extensions',
	'public/protected/tutorial-images',
	'public/protected/attachments',
];

const testDirectory = dirname(fileURLToPath(import.meta.url));
const publicProjectRoot = resolve(testDirectory, '..');
const astroCli = resolve(publicProjectRoot, 'node_modules/astro/bin/astro.mjs');
const assemblyCli = resolve(publicProjectRoot, 'scripts/content-assembly.mjs');

async function makeTree(root, paths) {
	for (const path of paths) {
		const file = resolve(root, path, '.keep');
		await mkdir(resolve(file, '..'), { recursive: true });
		await writeFile(file, path, 'utf8');
	}
}

async function makeFixtureProject() {
	const root = await mkdtemp(resolve(tmpdir(), 'odysseia-dojo-fixture-'));
	await makeTree(root, allowedRoots.map((path) => `fixtures/${path}`));
	return root;
}

async function waitForPage(url, expectedText) {
	const deadline = Date.now() + 15_000;
	let lastError;
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, { cache: 'no-store' });
			const body = await response.text();
			if (response.ok && body.includes(expectedText)) return;
			lastError = new Error(`Expected ${expectedText} from ${url}.`);
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
	}
	throw lastError;
}

async function runAssemblyCli(arguments_, environment = process.env) {
	const child = spawn(process.execPath, [assemblyCli, ...arguments_], {
		cwd: publicProjectRoot,
		env: environment,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const output = [];
	child.stdout.on('data', (chunk) => output.push(chunk.toString()));
	child.stderr.on('data', (chunk) => output.push(chunk.toString()));
	const [exitCode] = await once(child, 'close');
	return { exitCode, output: output.join('') };
}

async function availablePort() {
	const server = createServer();
	await new Promise((resolveListen, rejectListen) => {
		server.once('error', rejectListen);
		server.listen(0, '127.0.0.1', resolveListen);
	});
	const address = server.address();
	if (!address || typeof address === 'string') throw new Error('Could not reserve a local test port.');
	await new Promise((resolveClose) => server.close(resolveClose));
	return address.port;
}

test('fixtures replace a local materialization with tracked fixture files', async () => {
	const root = await makeFixtureProject();
	const privateRoot = resolve(root, 'private-content');
	await makeTree(privateRoot, allowedRoots);
	await materializeContent('local', { projectRoot: root, privateContentRoot: privateRoot });

	await materializeContent('fixtures', { projectRoot: root });

	const tutorialFile = resolve(root, 'src/content/docs/tutorials/.keep');
	assert.equal(await readFile(tutorialFile, 'utf8'), 'fixtures/src/content/docs/tutorials');
	assert.equal((await lstat(resolve(root, 'src/content/docs/tutorials'))).isSymbolicLink(), false);
	assert.equal((await lstat(resolve(root, 'public/protected/attachments'))).isSymbolicLink(), false);
});

test('local materialization links only the four allowlisted private roots', async () => {
	const root = await makeFixtureProject();
	const privateRoot = resolve(root, 'private-content');
	await makeTree(privateRoot, allowedRoots);
	await mkdir(resolve(privateRoot, 'archive'), { recursive: true });
	await mkdir(resolve(privateRoot, 'question_banks'), { recursive: true });
	await writeFile(resolve(privateRoot, 'package.json'), '{"private":true}', 'utf8');

	await materializeContent('local', { projectRoot: root, privateContentRoot: privateRoot });

	for (const allowedRoot of allowedRoots) {
		assert.equal((await lstat(resolve(root, allowedRoot))).isSymbolicLink(), true);
	}
	await assert.rejects(lstat(resolve(root, 'src/content/docs/archive')));
	await assert.rejects(lstat(resolve(root, 'public/protected/question_banks')));
});

test('fixture assembly rejects linked fixture input and unknown source selectors', async () => {
	const root = await makeFixtureProject();
	const linkedSource = resolve(root, 'fixture-link-source');
	await mkdir(linkedSource);
	await symlink(linkedSource, resolve(root, 'fixtures/src/content/docs/tutorials/linked'), 'dir');

	await assert.rejects(materializeContent('fixtures', { projectRoot: root }), /must not contain symlinks/u);
	await assert.rejects(materializeContent('archive', { projectRoot: root }), /Unsupported content source/u);
});

test('the public CLI rejects CI local mode and forbidden content selectors', async () => {
	const localInCi = await runAssemblyCli(['local'], { ...process.env, CI: 'true' });
	assert.notEqual(localInCi.exitCode, 0);
	assert.match(localInCi.output, /content:local is unavailable in CI/u);

	const archive = await runAssemblyCli(['archive']);
	assert.notEqual(archive.exitCode, 0);
	assert.match(archive.output, /Unsupported content source: archive/u);
});

test('Astro/Vite serves and refreshes a linked local content directory', { timeout: 20_000 }, async (t) => {
	await mkdir(resolve(publicProjectRoot, '.tmp'), { recursive: true });
	const project = await mkdtemp(resolve(publicProjectRoot, '.tmp/astro-link-'));
	const source = await mkdtemp(resolve(tmpdir(), 'odysseia-dojo-link-source-'));
	const port = await availablePort();
	const pageUrl = `http://127.0.0.1:${port}/`;

	await mkdir(resolve(project, 'src/pages'), { recursive: true });
	await writeFile(
		resolve(project, 'src/pages/index.astro'),
		"---\nimport message from '../linked/message.txt?raw';\n---\n<html><body>{message}</body></html>\n",
		'utf8'
	);
	await writeFile(resolve(source, 'message.txt'), 'first-linked-content', 'utf8');
	await symlink(source, resolve(project, 'src/linked'), 'dir');

	const server = spawn(process.execPath, [astroCli, 'dev', '--host', '127.0.0.1', '--port', String(port)], {
		cwd: project,
		stdio: ['ignore', 'pipe', 'pipe'],
	});
	const serverOutput = [];
	server.stdout.on('data', (chunk) => serverOutput.push(chunk.toString()));
	server.stderr.on('data', (chunk) => serverOutput.push(chunk.toString()));
	t.after(async () => {
		if (server.exitCode === null) {
			server.kill('SIGTERM');
			await once(server, 'exit').catch(() => undefined);
		}
		await rm(project, { recursive: true, force: true });
		await rm(source, { recursive: true, force: true });
	});

	try {
		await waitForPage(pageUrl, 'first-linked-content');
		await writeFile(resolve(source, 'message.txt'), 'updated-linked-content', 'utf8');
		await waitForPage(pageUrl, 'updated-linked-content');
	} catch (error) {
		error.message += `\nAstro/Vite output:\n${serverOutput.join('')}`;
		throw error;
	}
});
