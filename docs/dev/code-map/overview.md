# Repository overview

Use this map to locate current owners before changing code. It records the
public repository's checked-in structure; operational procedures remain owned
by the linked documents.

## Responsibility map

| Area | Current owner | Responsibility |
| --- | --- | --- |
| Runtime site and route code | [`src/`](../../../src/) | Astro pages, shared libraries, middleware, Worker entrypoint, components, styles, and content schema. |
| Public input | [`fixtures/`](../../../fixtures/) | Tracked, non-sensitive content and protected-resource fixtures for public development and validation. |
| Content materialization | [`scripts/content-assembly.mjs`](../../../scripts/content-assembly.mjs) | The two public content-input modes and their fixed runtime destinations. The [content assembly contract](../../content-assembly.md) owns the operational rules. |
| Build configuration | [`package.json`](../../../package.json), [`astro.config.mjs`](../../../astro.config.mjs), and [`wrangler.jsonc`](../../../wrangler.jsonc) | Command wiring, Astro/Starlight configuration, Cloudflare Worker/static-asset configuration, and D1 migration discovery. |
| Build checks | [`scripts/validate-public-build-config.mjs`](../../../scripts/validate-public-build-config.mjs) and [`scripts/verify-fixture-output.mjs`](../../../scripts/verify-fixture-output.mjs) | Production public-link validation and fixture-build artifact inventory. |
| D1 schema | [`migrations/`](../../../migrations/) | Checked-in D1 migrations used by the Worker configuration and local harness. |
| Public validation | [`test/`](../../../test/) | Content-assembly, public-build configuration, and production-shaped Worker checks using fixtures. |
| Maintainer documentation | [`docs/`](../..) | Developer navigation plus the two operational documents linked from the [developer navigator](../README.md). |

## Content flow

For public development and CI, the tracked [`fixtures/`](../../../fixtures/)
corpus is materialized into Git-ignored runtime paths and then consumed by the
Astro/Starlight build. The content-assembly module is the only checked-in
owner of that transition.

Trusted-local work uses the same module to link the allowed roots from the
trusted sibling into those ignored runtime paths. This public repository has no
production materialization interface. The exact allowlist, replacement
behavior, and local-mode constraints are maintained in the
[content assembly contract](../../content-assembly.md).

## Request flow

The deployed request path starts at [`src/worker.ts`](../../../src/worker.ts),
which applies the shared policy before delegating to Astro's Cloudflare handler.
[`src/middleware.ts`](../../../src/middleware.ts) applies that same policy to
Astro-rendered routes. OAuth endpoint and Session ownership live below
[`src/pages/api/auth/`](../../../src/pages/api/auth/); the detailed owner and
test-seam map is [request and access](request-access.md).

## Build and validation flow

[`package.json`](../../../package.json) exposes the maintained npm entrypoints.
They assemble the public fixture input where required, run Astro's configured
Cloudflare build, and use the checked-in scripts to validate public build
configuration and generated fixture artifacts. The production-shaped Worker
test consumes the generated Worker configuration. The [tooling map](tooling.md)
owns the command-to-entrypoint route and prerequisites.

## Current source boundary

The only current D1 schema migration is
[`migrations/0001_create_auth_activity.sql`](../../../migrations/0001_create_auth_activity.sql).
It is used by the OAuth callback's `auth_activity` upsert in
[`src/pages/api/auth/callback.ts`](../../../src/pages/api/auth/callback.ts).
No browser-observation route, module, migration, or observation test seam is
implemented in the current source.
