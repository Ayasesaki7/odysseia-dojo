import assert from 'node:assert/strict';
import test from 'node:test';

import { assertProductionPublicBuildConfig } from '../src/lib/public-build-config.mjs';

test('fixture and local builds do not require production public URLs', () => {
	assert.doesNotThrow(() => assertProductionPublicBuildConfig({}));
});

test('production builds require a canonical origin and a full public commit URL', () => {
	assert.throws(
		() => assertProductionPublicBuildConfig({ DEPLOYMENT_MODE: 'production' }),
		/PUBLIC_CANONICAL_URL must be set/u
	);
	assert.throws(
		() =>
			assertProductionPublicBuildConfig({
				DEPLOYMENT_MODE: 'production',
				PUBLIC_CANONICAL_URL: 'https://example.com',
				PUBLIC_SOURCE_COMMIT_URL: 'https://github.com/example/odysseia-dojo/commit/0123456789abcdef0123456789abcdef01234567',
			}),
		/non-placeholder HTTPS URL/u
	);
	assert.throws(
		() =>
			assertProductionPublicBuildConfig({
				DEPLOYMENT_MODE: 'production',
				PUBLIC_CANONICAL_URL: 'https://odysseia-dojo.github.io',
				PUBLIC_SOURCE_COMMIT_URL: 'https://github.com/example/odysseia-dojo/commit/01234567',
			}),
		/40-character public commit SHA/u
	);
	assert.doesNotThrow(() =>
		assertProductionPublicBuildConfig({
			DEPLOYMENT_MODE: 'production',
			PUBLIC_CANONICAL_URL: 'https://odysseia-dojo.github.io',
			PUBLIC_SOURCE_COMMIT_URL: 'https://github.com/example/odysseia-dojo/commit/0123456789abcdef0123456789abcdef01234567',
		})
	);
});
