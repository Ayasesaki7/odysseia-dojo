import { access, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), '..');
const outputRoot = resolve(projectRoot, 'dist');

async function walk(root) {
	const entries = await readdir(root, { withFileTypes: true });
	const paths = [];
	for (const entry of entries) {
		const entryPath = resolve(root, entry.name);
		if (entry.isDirectory()) {
			paths.push(...(await walk(entryPath)));
		} else {
			paths.push(relative(outputRoot, entryPath));
		}
	}
	return paths;
}

async function assertExists(path) {
	try {
		await access(path);
	} catch {
		throw new Error(`Expected fixture build output is missing: ${relative(projectRoot, path)}`);
	}
}

for (const expectedPath of [
	'docs/tutorials/index.html',
	'docs/tutorials/discord-and-odysseia/index.html',
	'docs/extensions/legacy-interface/index.html',
	'protected/tutorial-images/fixture-api-settings.svg',
	'protected/attachments/fixture-reading-checklist.txt',
]) {
	await assertExists(resolve(outputRoot, expectedPath));
}

const generatedPaths = await walk(outputRoot);
if (!generatedPaths.some((path) => path.startsWith('pagefind/fragment/'))) {
	throw new Error('Pagefind fragments were not generated from the fixture corpus.');
}

const forbiddenOutput = generatedPaths.filter((path) =>
	/(^|\/)(?:archive|question_banks)(?:\/|$)/u.test(path) || /(?:^|\/)(?:sitemap[^/]*\.xml|rss(?:\.xml)?)(?:$|\/)/iu.test(path)
);
if (forbiddenOutput.length > 0) {
	throw new Error(`Fixture build output contains forbidden derived paths: ${forbiddenOutput.join(', ')}`);
}

console.log('Fixture build contains stable docs routes, protected fixture assets, and Pagefind fragments only.');
