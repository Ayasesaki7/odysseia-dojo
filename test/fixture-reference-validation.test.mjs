import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { verifyFixtureReferences } from '../scripts/verify-fixture-references.mjs';

async function makeFixtureReferenceProject(t) {
	const projectRoot = await mkdtemp(resolve(tmpdir(), 'odysseia-dojo-fixture-references-'));
	t.after(() => rm(projectRoot, { recursive: true, force: true }));

	await Promise.all([
		mkdir(resolve(projectRoot, 'src/content/docs/tutorials'), { recursive: true }),
		mkdir(resolve(projectRoot, 'public/protected/tutorial-images'), { recursive: true }),
		mkdir(resolve(projectRoot, 'public/protected/attachments'), { recursive: true }),
	]);
	await Promise.all([
		writeFile(
			resolve(projectRoot, 'src/content/docs/tutorials/00-index.md'),
			'[Fixture guide](/docs/tutorials/fixture-guide/)\n',
			'utf8',
		),
		writeFile(
			resolve(projectRoot, 'src/content/docs/tutorials/01-fixture-guide.md'),
			'![Fixture image](/protected/tutorial-images/fixture.svg)\n[Fixture attachment](/protected/attachments/fixture.txt)\n',
			'utf8',
		),
		writeFile(resolve(projectRoot, 'public/protected/tutorial-images/fixture.svg'), '<svg />\n', 'utf8'),
		writeFile(resolve(projectRoot, 'public/protected/attachments/fixture.txt'), 'fixture attachment\n', 'utf8'),
	]);

	return projectRoot;
}

test('fixture reference validation rejects a missing internal document target without echoing it', async (t) => {
	const projectRoot = await makeFixtureReferenceProject(t);
	await writeFile(
		resolve(projectRoot, 'src/content/docs/tutorials/00-index.md'),
		'[Missing fixture guide](/docs/tutorials/F08_MISSING_DOCUMENT_TARGET/)\n',
		'utf8',
	);

	await assert.rejects(verifyFixtureReferences({ projectRoot, report: false }), (error) => {
		assert.match(error.message, /internal document link targets no known fixture document/u);
		assert.doesNotMatch(error.message, /F08_MISSING_DOCUMENT_TARGET/u);
		return true;
	});
});

test('fixture reference validation rejects duplicate stable document URLs without echoing them', async (t) => {
	const projectRoot = await makeFixtureReferenceProject(t);
	await Promise.all([
		writeFile(resolve(projectRoot, 'src/content/docs/tutorials/01-F08_DUPLICATE_SLUG.md'), 'fixture\n', 'utf8'),
		writeFile(resolve(projectRoot, 'src/content/docs/tutorials/F08_DUPLICATE_SLUG.md'), 'fixture\n', 'utf8'),
	]);

	await assert.rejects(verifyFixtureReferences({ projectRoot, report: false }), (error) => {
		assert.match(error.message, /duplicate stable document URL/u);
		assert.doesNotMatch(error.message, /F08_DUPLICATE_SLUG/u);
		return true;
	});
});

test('fixture reference validation rejects a missing protected image without echoing it', async (t) => {
	const projectRoot = await makeFixtureReferenceProject(t);
	await writeFile(
		resolve(projectRoot, 'src/content/docs/tutorials/01-fixture-guide.md'),
		'![Missing fixture image](/protected/tutorial-images/F08_MISSING_IMAGE.svg)\n',
		'utf8',
	);

	await assert.rejects(verifyFixtureReferences({ projectRoot, report: false }), (error) => {
		assert.match(error.message, /protected resource reference is missing/u);
		assert.doesNotMatch(error.message, /F08_MISSING_IMAGE/u);
		return true;
	});
});

test('fixture reference validation rejects an image outside the protected tutorial-image path without echoing it', async (t) => {
	const projectRoot = await makeFixtureReferenceProject(t);
	await writeFile(
		resolve(projectRoot, 'src/content/docs/tutorials/01-fixture-guide.md'),
		'![Unprotected fixture image](/F08_UNPROTECTED_IMAGE.svg)\n',
		'utf8',
	);

	await assert.rejects(verifyFixtureReferences({ projectRoot, report: false }), (error) => {
		assert.match(error.message, /fixture image must use a protected tutorial-image path/u);
		assert.doesNotMatch(error.message, /F08_UNPROTECTED_IMAGE/u);
		return true;
	});
});

test('fixture reference validation rejects a missing reference-style document target without echoing it', async (t) => {
	const projectRoot = await makeFixtureReferenceProject(t);
	await writeFile(
		resolve(projectRoot, 'src/content/docs/tutorials/00-index.md'),
		'[Missing fixture guide][missing-guide]\n\n[missing-guide]: /docs/tutorials/F08_REFERENCE_DOCUMENT_TARGET/\n',
		'utf8',
	);

	await assert.rejects(verifyFixtureReferences({ projectRoot, report: false }), (error) => {
		assert.match(error.message, /internal document link targets no known fixture document/u);
		assert.doesNotMatch(error.message, /F08_REFERENCE_DOCUMENT_TARGET/u);
		return true;
	});
});

test('fixture reference validation resolves source-relative Markdown document links', async (t) => {
	const projectRoot = await makeFixtureReferenceProject(t);
	await writeFile(
		resolve(projectRoot, 'src/content/docs/tutorials/00-index.md'),
		'[Fixture guide](./01-fixture-guide.md)\n',
		'utf8',
	);

	await assert.doesNotReject(verifyFixtureReferences({ projectRoot, report: false }));
});

test('fixture reference validation rejects a missing static MDX resource reference without echoing it', async (t) => {
	const projectRoot = await makeFixtureReferenceProject(t);
	await writeFile(
		resolve(projectRoot, 'src/content/docs/tutorials/01-fixture-guide.md'),
		'<img src="/protected/tutorial-images/F08_MISSING_MDX_IMAGE.svg" alt="Missing fixture image" />\n',
		'utf8',
	);

	await assert.rejects(verifyFixtureReferences({ projectRoot, report: false }), (error) => {
		assert.match(error.message, /protected resource reference is missing/u);
		assert.doesNotMatch(error.message, /F08_MISSING_MDX_IMAGE/u);
		return true;
	});
});

test('fixture reference validation rejects dynamic MDX reference attributes it cannot inspect', async (t) => {
	const projectRoot = await makeFixtureReferenceProject(t);
	await writeFile(
		resolve(projectRoot, 'src/content/docs/tutorials/01-fixture-guide.md'),
		'<img {...fixtureImageProps} />\n',
		'utf8',
	);

	await assert.rejects(verifyFixtureReferences({ projectRoot, report: false }), /fixture MDX reference is not static/u);
});
