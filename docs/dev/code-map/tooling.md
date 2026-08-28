# Tooling map

[`package.json`](../../../package.json) is authoritative for executable command
spelling. This map routes a maintainer from a task to the current script,
artifact, migration, and harness owners without duplicating the operational
contracts they use.

## Commands and script owners

| Task | npm entrypoint | Source owner | Prerequisite or next authority |
| --- | --- | --- | --- |
| Install the website toolchain | `npm ci` | [`package.json`](../../../package.json) engines and lockfile | Use the Node.js and npm versions stated in the public [README](../../../README.md). |
| Populate public runtime content | `npm run content:fixtures` | [`scripts/content-assembly.mjs`](../../../scripts/content-assembly.mjs) | Read the [content assembly contract](../../content-assembly.md). |
| Populate trusted-local runtime content | `npm run content:local` | [`scripts/content-assembly.mjs`](../../../scripts/content-assembly.mjs) | Use only the trusted-local workflow in the [content assembly contract](../../content-assembly.md). |
| Serve or preview an assembled site | `npm run dev` or `npm run preview` | [`package.json`](../../../package.json) and [`astro.config.mjs`](../../../astro.config.mjs) | Assemble an input first; `preview` builds before serving. |
| Check fixture assembly, public configuration, and browser-observation logic | `npm run test` | [`test/content-assembly.test.mjs`](../../../test/content-assembly.test.mjs), [`test/public-build-config.test.mjs`](../../../test/public-build-config.test.mjs), [`test/observation-logic.test.mjs`](../../../test/observation-logic.test.mjs), and [`test/observation-client.test.mjs`](../../../test/observation-client.test.mjs) | The script first assembles fixtures. |
| Run Astro and content-schema checks | `npm run check` | [`astro.config.mjs`](../../../astro.config.mjs) and [`src/content.config.ts`](../../../src/content.config.ts) | The script first assembles fixtures. |
| Build and inspect fixture artifacts | `npm run build` | [`scripts/validate-public-build-config.mjs`](../../../scripts/validate-public-build-config.mjs) and [`scripts/verify-fixture-output.mjs`](../../../scripts/verify-fixture-output.mjs) | The script assembles fixtures, builds, then validates generated output. |
| Exercise the deployable Worker boundary | `npm run test:worker` | [`test/worker-harness.test.mjs`](../../../test/worker-harness.test.mjs) | The script builds first; follow the [Worker test seam](../../worker-test-seam.md). |
| Run the maintained public validation set | `npm run validate` | [`package.json`](../../../package.json) | Combines the fixture tests, check, build, and Worker harness. |

## Generated artifacts, migration, and harness

| Concern | Current owner | Stable entrypoint |
| --- | --- | --- |
| Fixture artifact inventory | [`scripts/verify-fixture-output.mjs`](../../../scripts/verify-fixture-output.mjs) | Reads generated `dist/client/` after `npm run build`. |
| Production public-build configuration | [`scripts/validate-public-build-config.mjs`](../../../scripts/validate-public-build-config.mjs) and [`src/lib/public-build-config.mjs`](../../../src/lib/public-build-config.mjs) | Invoked by `npm run build` before Astro builds. |
| D1 migration discovery | [`wrangler.jsonc`](../../../wrangler.jsonc), [`migrations/0001_create_auth_activity.sql`](../../../migrations/0001_create_auth_activity.sql), and [`migrations/0002_create_fingerprint_observations.sql`](../../../migrations/0002_create_fingerprint_observations.sql) | Wrangler's configured `migrations_dir`; there is no separate npm migration script. |
| Local D1 migration application in the Worker seam | [`test/worker-harness.test.mjs`](../../../test/worker-harness.test.mjs), `worker.applyD1Migrations('DB')` | Runs inside the isolated test harness. |
| Generated deployable Worker configuration | Astro's Cloudflare build via [`astro.config.mjs`](../../../astro.config.mjs) | `dist/server/wrangler.json`, consumed by `createTestHarness()`. |

When a command name, script owner, generated-artifact check, migration owner,
or harness entrypoint changes, update this map. Update an operational page only
when its maintained procedure or contract changes.
