import assert from 'node:assert/strict';
import test from 'node:test';

import { assertProductionPublicBuildConfig, publicSourceRevisionUrl } from '../src/lib/public-build-config.mjs';

test('fixture and local builds do not require production public URLs', () => {
	assert.doesNotThrow(() => assertProductionPublicBuildConfig({}));
});

test('production builds require a canonical origin, public GitHub repository URL, and full public commit SHA', () => {
	assert.throws(
		() => assertProductionPublicBuildConfig({ DEPLOYMENT_MODE: 'production' }),
		/PUBLIC_CANONICAL_URL must be set/u,
	);
	assert.throws(
		() =>
			assertProductionPublicBuildConfig({
				DEPLOYMENT_MODE: 'production',
				PUBLIC_CANONICAL_URL: 'https://example.com',
				PUBLIC_SOURCE_REPOSITORY_URL: 'https://github.com/example/odysseia-dojo',
			}),
		/non-placeholder HTTPS URL/u,
	);
	assert.throws(
		() =>
			assertProductionPublicBuildConfig({
				DEPLOYMENT_MODE: 'production',
				PUBLIC_CANONICAL_URL: 'https://odysseia-dojo.github.io',
				PUBLIC_SOURCE_REPOSITORY_URL: 'https://github.com/example/odysseia-dojo/issues',
			}),
		/HTTPS GitHub repository URL/u,
	);
	assert.throws(
		() =>
			assertProductionPublicBuildConfig({
				DEPLOYMENT_MODE: 'production',
				PUBLIC_CANONICAL_URL: 'https://odysseia-dojo.github.io',
				PUBLIC_SOURCE_REPOSITORY_URL: 'https://github.com/example/odysseia-dojo-content',
				PUBLIC_SOURCE_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
			}),
		/public odysseia-dojo GitHub repository URL/u,
	);
	assert.doesNotThrow(() =>
		assertProductionPublicBuildConfig({
			DEPLOYMENT_MODE: 'production',
			PUBLIC_CANONICAL_URL: 'https://odysseia-dojo.github.io',
			PUBLIC_SOURCE_REPOSITORY_URL: 'https://github.com/example/odysseia-dojo',
			PUBLIC_SOURCE_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
		}),
	);
	assert.throws(
		() =>
			assertProductionPublicBuildConfig({
				DEPLOYMENT_MODE: 'production',
				PUBLIC_CANONICAL_URL: 'https://odysseia-dojo.github.io',
				PUBLIC_SOURCE_REPOSITORY_URL: 'https://github.com/example/odysseia-dojo',
				PUBLIC_SOURCE_COMMIT_SHA: '0123456',
			}),
		/PUBLIC_SOURCE_COMMIT_SHA must be a full lowercase Git commit SHA/u,
	);
	assert.throws(
		() =>
			assertProductionPublicBuildConfig({
				DEPLOYMENT_MODE: 'production',
				PUBLIC_CANONICAL_URL: 'https://odysseia-dojo.github.io',
			}),
		/PUBLIC_SOURCE_REPOSITORY_URL must be set/u,
	);
});

test('production source links pin the public repository to the configured commit', () => {
	assert.equal(publicSourceRevisionUrl({}), undefined);
	assert.throws(
		() =>
			publicSourceRevisionUrl({
				PUBLIC_SOURCE_REPOSITORY_URL: 'https://github.com/example/odysseia-dojo-content',
				PUBLIC_SOURCE_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
			}),
		/public odysseia-dojo GitHub repository URL/u,
	);
	assert.equal(
		publicSourceRevisionUrl({
			PUBLIC_SOURCE_REPOSITORY_URL: 'https://github.com/example/odysseia-dojo',
			PUBLIC_SOURCE_COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
		}),
		'https://github.com/example/odysseia-dojo/tree/0123456789abcdef0123456789abcdef01234567',
	);
});
