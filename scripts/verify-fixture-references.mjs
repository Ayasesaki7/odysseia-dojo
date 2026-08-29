import { lstat, readdir, readFile } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unified } from 'unified';
import remarkMdx from 'remark-mdx';
import remarkParse from 'remark-parse';

const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = resolve(dirname(scriptPath), '..');
const fixtureOrigin = 'https://fixture.invalid';
const documentExtensions = new Set(['.md', '.mdx']);
const markdownParser = unified().use(remarkParse).use(remarkMdx);

function errorFor(label) {
	return new Error(`Fixture reference validation failed: ${label}.`);
}

async function findDocumentFiles(root) {
	const files = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		const path = resolve(root, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await findDocumentFiles(path)));
		} else if (entry.isFile() && documentExtensions.has(extname(entry.name))) {
			files.push(path);
		}
	}
	return files;
}

function documentRoute(documentRoot, documentPath) {
	const segments = relative(documentRoot, documentPath)
		.replaceAll('\\', '/')
		.replace(/\.(?:md|mdx)$/u, '')
		.split('/')
		.map((segment) => segment.replace(/^\d+-/u, ''));
	if (segments.at(-1) === 'index') segments.pop();
	return `/${['docs', ...segments].join('/')}/`;
}

function visit(node, callback) {
	callback(node);
	for (const child of node.children ?? []) visit(child, callback);
}

function referenceTargets(markdown) {
	const targets = [];
	const tree = markdownParser.parse(markdown);
	const definitions = new Map();
	visit(tree, (node) => {
		if (node.type === 'definition') definitions.set(node.identifier, node.url);
	});
	visit(tree, (node) => {
		if (node.type === 'link' || node.type === 'image') targets.push(node.url);
		if (node.type === 'linkReference' || node.type === 'imageReference') {
			const target = definitions.get(node.identifier);
			if (!target) throw errorFor('Markdown reference has no definition');
			targets.push(target);
		}
		if (Array.isArray(node.attributes)) {
			for (const attribute of node.attributes) {
				if (attribute.type === 'mdxJsxExpressionAttribute') {
					throw errorFor('fixture MDX reference is not static');
				}
				if (attribute.type !== 'mdxJsxAttribute' || !['href', 'src'].includes(attribute.name)) continue;
				if (typeof attribute.value !== 'string') {
					throw errorFor('fixture MDX reference is not static');
				}
				targets.push(attribute.value);
			}
		}
	});
	return targets;
}

function fixtureUrl(target, sourceRoute) {
	let url;
	try {
		url = new URL(target, `${fixtureOrigin}${sourceRoute}`);
	} catch {
		throw errorFor('fixture reference is not a valid URL');
	}
	return url.origin === fixtureOrigin ? url : undefined;
}

function asDocumentRoute(url) {
	if (!url.pathname.startsWith('/docs/')) return undefined;

	const segments = url.pathname.split('/').filter(Boolean);
	const lastSegment = segments.at(-1);
	if (lastSegment === 'index.html') {
		segments.pop();
	} else if (lastSegment && /\.(?:md|mdx)$/iu.test(lastSegment)) {
		segments[segments.length - 1] = lastSegment.replace(/\.(?:md|mdx)$/iu, '');
		for (let index = 1; index < segments.length; index += 1) {
			segments[index] = segments[index].replace(/^\d+-/u, '');
		}
		if (segments.at(-1) === 'index') segments.pop();
	}
	return `/${segments.join('/')}/`;
}

async function assertProtectedResourceExists(url, publicRoot) {
	if (!url.pathname.startsWith('/protected/')) return;

	let entry;
	try {
		entry = await lstat(resolve(publicRoot, decodeURIComponent(url.pathname).slice(1)));
	} catch {
		throw errorFor('protected resource reference is missing');
	}
	if (!entry.isFile() || entry.isSymbolicLink()) {
		throw errorFor('protected resource reference is not a file');
	}
}

export async function verifyFixtureReferences({ projectRoot = defaultProjectRoot, report = true } = {}) {
	const documentRoot = resolve(projectRoot, 'src/content/docs');
	const publicRoot = resolve(projectRoot, 'public');
	const documentFiles = await findDocumentFiles(documentRoot);
	const documentRoutes = new Set();
	for (const documentPath of documentFiles) {
		const route = documentRoute(documentRoot, documentPath);
		if (documentRoutes.has(route)) throw errorFor('duplicate stable document URL');
		documentRoutes.add(route);
	}

	for (const documentPath of documentFiles) {
		const sourceRoute = documentRoute(documentRoot, documentPath);
		const markdown = await readFile(documentPath, 'utf8');
		for (const target of referenceTargets(markdown)) {
			const url = fixtureUrl(target, sourceRoute);
			if (!url) continue;

			const targetRoute = asDocumentRoute(url);
			if (targetRoute && !documentRoutes.has(targetRoute)) {
				throw errorFor('internal document link targets no known fixture document');
			}
			await assertProtectedResourceExists(url, publicRoot);
		}
	}

	if (report) {
		console.log(
			`Fixture reference validation: ${documentFiles.length} fixture documents have resolvable internal links and protected resources.`,
		);
	}
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
	verifyFixtureReferences().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
