const placeholderHosts = new Set(['example.com', 'example.org', 'example.net', 'localhost']);

function isPlaceholderHost(hostname) {
	return (
		placeholderHosts.has(hostname) ||
		hostname.endsWith('.example') ||
		hostname.endsWith('.invalid') ||
		hostname.endsWith('.test') ||
		hostname.endsWith('.localhost')
	);
}

function requiredHttpsUrl(value, name) {
	if (!value) throw new Error(`${name} must be set for a production build.`);

	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${name} must be an absolute HTTPS URL.`);
	}

	if (url.protocol !== 'https:' || isPlaceholderHost(url.hostname)) {
		throw new Error(`${name} must be a non-placeholder HTTPS URL.`);
	}

	return url;
}

export function assertProductionPublicBuildConfig(environment = process.env) {
	if (environment.DEPLOYMENT_MODE !== 'production') return;

	const canonicalUrl = requiredHttpsUrl(environment.PUBLIC_CANONICAL_URL, 'PUBLIC_CANONICAL_URL');
	if (canonicalUrl.pathname !== '/' || canonicalUrl.search || canonicalUrl.hash) {
		throw new Error('PUBLIC_CANONICAL_URL must be an origin URL without a path, query, or fragment.');
	}

	const sourceCommitUrl = requiredHttpsUrl(environment.PUBLIC_SOURCE_COMMIT_URL, 'PUBLIC_SOURCE_COMMIT_URL');
	if (!/(?:^|\/)commit\/([0-9a-f]{40})(?:$|[/?#])/iu.test(sourceCommitUrl.pathname)) {
		throw new Error('PUBLIC_SOURCE_COMMIT_URL must identify a complete 40-character public commit SHA.');
	}
}
