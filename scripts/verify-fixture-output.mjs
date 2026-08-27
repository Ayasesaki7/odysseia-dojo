import { access, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(scriptPath), '..');
const outputRoot = resolve(projectRoot, 'dist/client');

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
const outputInventory = {
	protectedDocumentHtml: generatedPaths.filter(
		(path) => /^docs\/(?:tutorials|extensions)(?:\/|$)/u.test(path) && path.endsWith('.html')
	).length,
	pagefindAssets: generatedPaths.filter((path) => path.startsWith('pagefind/')).length,
	protectedTutorialImages: generatedPaths.filter((path) => path.startsWith('protected/tutorial-images/')).length,
	protectedAttachments: generatedPaths.filter((path) => path.startsWith('protected/attachments/')).length,
};

if (!generatedPaths.some((path) => path.startsWith('pagefind/fragment/'))) {
	throw new Error('Pagefind fragments were not generated from the fixture corpus.');
}

const forbiddenOutput = generatedPaths.filter((path) =>
	/(^|\/)(?:archive|question_banks)(?:\/|$)/u.test(path) ||
	/(?:^|\/)(?:sitemap[^/]*\.xml|rss(?:\.xml)?|atom(?:\.xml)?|feed(?:\.xml)?)(?:$|\/)/iu.test(path)
);
if (forbiddenOutput.length > 0) {
	throw new Error(`Fixture build output contains forbidden derived paths: ${forbiddenOutput.join(', ')}`);
}

const unprotectedJsonOutput = generatedPaths.filter((path) => path.endsWith('.json') && !path.startsWith('pagefind/'));
if (unprotectedJsonOutput.length > 0) {
	throw new Error(`Fixture build output contains unprotected JSON artifacts: ${unprotectedJsonOutput.join(', ')}`);
}

console.log(
	`Fixture build inventory: ${outputInventory.protectedDocumentHtml} protected document HTML files, ` +
		`${outputInventory.pagefindAssets} Pagefind assets, ${outputInventory.protectedTutorialImages} protected tutorial images, and ` +
		`${outputInventory.protectedAttachments} protected attachments; no unprotected JSON, feed, archive, or question-bank artifacts.`
);
