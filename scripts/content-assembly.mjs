import { cp, lstat, mkdir, readdir, realpath, rm, symlink } from 'node:fs/promises';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
export const projectRoot = resolve(dirname(scriptPath), '..');

const materializableRootDefinitions = Object.freeze([
	{
		path: 'src/content/docs/tutorials',
		label: 'tutorials',
	},
	{
		path: 'src/content/docs/extensions',
		label: 'extensions',
	},
	{
		path: 'public/protected/tutorial-images',
		label: 'tutorial images',
	},
	{
		path: 'public/protected/attachments',
		label: 'attachments',
	},
]);

const runtimeRoots = Object.freeze(['src/content/docs', 'public/protected']);

function isPathWithin(parent, child) {
	const pathFromParent = relative(parent, child);
	return pathFromParent === '' || (!pathFromParent.startsWith(`..${sep}`) && pathFromParent !== '..');
}

async function assertDirectory(path, label) {
	let entry;
	try {
		entry = await lstat(path);
	} catch {
		throw new Error(`${label} is missing: ${path}`);
	}

	if (!entry.isDirectory() || entry.isSymbolicLink()) {
		throw new Error(`${label} must be a real directory: ${path}`);
	}
}

async function assertExactLayout(root, expectedNames, label) {
	await assertDirectory(root, label);
	const entries = await readdir(root, { withFileTypes: true });
	const names = new Set(entries.map((entry) => entry.name));
	const missing = expectedNames.filter((name) => !names.has(name));
	const unexpected = [...names].filter((name) => !expectedNames.includes(name));

	if (missing.length || unexpected.length) {
		throw new Error(
			`${label} must contain only ${expectedNames.join(', ')}; ` +
				`missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}`
		);
	}

	for (const name of expectedNames) {
		await assertDirectory(resolve(root, name), `${label}/${name}`);
	}
}

async function assertNoSymlinks(root, label) {
	const entries = await readdir(root, { withFileTypes: true });
	for (const entry of entries) {
		const entryPath = resolve(root, entry.name);
		if (entry.isSymbolicLink()) {
			throw new Error(`${label} must not contain symlinks: ${entryPath}`);
		}
		if (entry.isDirectory()) await assertNoSymlinks(entryPath, label);
	}
}

async function assertFixtureSources(root) {
	const fixtureRoot = resolve(root, 'fixtures');
	const fixtureSourceRoot = resolve(fixtureRoot, 'src');
	const fixtureContentRoot = resolve(fixtureSourceRoot, 'content');
	const docsRoot = resolve(fixtureContentRoot, 'docs');
	const fixturePublicRoot = resolve(fixtureRoot, 'public');
	const protectedRoot = resolve(fixturePublicRoot, 'protected');

	await assertExactLayout(fixtureRoot, ['src', 'public'], 'fixture root');
	await assertExactLayout(fixtureSourceRoot, ['content'], 'fixture source root');
	await assertExactLayout(fixtureContentRoot, ['docs'], 'fixture content root');
	await assertExactLayout(docsRoot, ['tutorials', 'extensions'], 'fixture docs root');
	await assertExactLayout(fixturePublicRoot, ['protected'], 'fixture public root');
	await assertExactLayout(
		protectedRoot,
		['tutorial-images', 'attachments'],
		'fixture protected-resource root'
	);
	await assertNoSymlinks(fixtureRoot, 'fixtures');

	return fixtureRoot;
}

async function assertLocalSources(contentRoot) {
	const canonicalContentRoot = await realpath(contentRoot);
	const docsRoot = resolve(canonicalContentRoot, 'src/content/docs');
	const protectedRoot = resolve(canonicalContentRoot, 'public/protected');

	if (!isPathWithin(canonicalContentRoot, docsRoot) || !isPathWithin(canonicalContentRoot, protectedRoot)) {
		throw new Error('The private content roots must remain inside the trusted content repository.');
	}

	await assertExactLayout(docsRoot, ['tutorials', 'extensions'], 'private docs root');
	await assertExactLayout(
		protectedRoot,
		['tutorial-images', 'attachments'],
		'private protected-resource root'
	);

	for (const rootDefinition of materializableRootDefinitions) {
		const source = resolve(canonicalContentRoot, rootDefinition.path);
		const canonicalSource = await realpath(source);
		if (!isPathWithin(canonicalContentRoot, canonicalSource)) {
			throw new Error(`Allowed ${rootDefinition.label} source resolves outside the private repository.`);
		}
		await assertNoSymlinks(canonicalSource, `private ${rootDefinition.label}`);
	}

	return canonicalContentRoot;
}

async function clearRuntimeRoots(root) {
	for (const runtimeRoot of runtimeRoots) {
		await rm(resolve(root, runtimeRoot), { recursive: true, force: true });
	}
}

async function materializeFixtureSources(root, fixtureRoot) {
	for (const rootDefinition of materializableRootDefinitions) {
		const source = resolve(fixtureRoot, rootDefinition.path);
		const destination = resolve(root, rootDefinition.path);
		await mkdir(dirname(destination), { recursive: true });
		await cp(source, destination, { recursive: true, force: true });
	}
}

async function materializeLocalSources(root, contentRoot) {
	for (const rootDefinition of materializableRootDefinitions) {
		const source = resolve(contentRoot, rootDefinition.path);
		const destination = resolve(root, rootDefinition.path);
		await mkdir(dirname(destination), { recursive: true });
		await symlink(source, destination, process.platform === 'win32' ? 'junction' : 'dir');
	}
}

/**
 * Internal materialization seam used by the two stable npm commands and by
 * focused tests. Callers cannot supply an arbitrary list of content roots.
 */
export async function materializeContent(mode, options = {}) {
	const root = resolve(options.projectRoot ?? projectRoot);
	if (!['fixtures', 'local'].includes(mode)) {
		throw new Error(`Unsupported content source: ${mode}`);
	}

	const sourceRoot =
		mode === 'fixtures'
			? await assertFixtureSources(root)
			: await assertLocalSources(options.privateContentRoot);

	await clearRuntimeRoots(root);
	if (mode === 'fixtures') {
		await materializeFixtureSources(root, sourceRoot);
	} else {
		await materializeLocalSources(root, sourceRoot);
	}
}

function trustedPrivateContentRoot(root) {
	const workspaceRoot = dirname(root);
	if (process.env.CI) {
		throw new Error('content:local is unavailable in CI; use content:fixtures instead.');
	}
	if (root !== projectRoot || basename(root) !== 'odysseia-dojo') {
		throw new Error('content:local must run from the checked-out public repository.');
	}
	if (basename(workspaceRoot) !== 'dojo-sites') {
		throw new Error('content:local is restricted to the trusted dojo-sites workspace.');
	}
	return resolve(workspaceRoot, 'odysseia-dojo-content');
}

async function main() {
	const [mode, ...extraArguments] = process.argv.slice(2);
	if (!mode || extraArguments.length > 0) {
		throw new Error('Usage: node scripts/content-assembly.mjs <fixtures|local>');
	}

	const options = mode === 'local' ? { privateContentRoot: trustedPrivateContentRoot(projectRoot) } : {};
	await materializeContent(mode, options);
	console.log(`Materialized ${mode} content into Git-ignored runtime paths.`);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
	main().catch((error) => {
		console.error(error.message);
		process.exitCode = 1;
	});
}
