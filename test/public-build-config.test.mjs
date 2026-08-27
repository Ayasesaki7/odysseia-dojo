import assert from 'node:assert/strict';
import test from 'node:test';

import { assertProductionPublicBuildConfig } from '../src/lib/public-build-config.mjs';

test('fixture and local builds do not require production public URLs', () => {
	assert.doesNotThrow(() => assertProductionPublicBuildConfig({}));
});

test('production builds require a canonical origin and a public GitHub repository URL', () => {
	assert.throws(
		() => assertProductionPublicBuildConfig({ DEPLOYMENT_MODE: 'production' }),
		/PUBLIC_CANONICAL_URL must be set/u
	);
	assert.throws(
		() =>
			assertProductionPublicBuildConfig({
				DEPLOYMENT_MODE: 'production',
				PUBLIC_CANONICAL_URL: 'https://example.com',
				PUBLIC_SOURCE_REPOSITORY_URL: 'https://github.com/example/odysseia-dojo',
			}),
		/non-placeholder HTTPS URL/u
	);
	assert.throws(
		() =>
			assertProductionPublicBuildConfig({
				DEPLOYMENT_MODE: 'production',
				PUBLIC_CANONICAL_URL: 'https://odysseia-dojo.github.io',
				PUBLIC_SOURCE_REPOSITORY_URL: 'https://github.com/example/odysseia-dojo/issues',
			}),
		/HTTPS GitHub repository URL/u
	);
	assert.doesNotThrow(() =>
		assertProductionPublicBuildConfig({
			DEPLOYMENT_MODE: 'production',
			PUBLIC_CANONICAL_URL: 'https://odysseia-dojo.github.io',
			PUBLIC_SOURCE_REPOSITORY_URL: 'https://github.com/example/odysseia-dojo',
		})
	);
});
