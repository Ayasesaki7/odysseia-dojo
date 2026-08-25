import { assertProductionPublicBuildConfig } from '../src/lib/public-build-config.mjs';

try {
	assertProductionPublicBuildConfig();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
