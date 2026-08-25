# Worker test seam

Run the production-shaped local Worker check from a fresh public checkout:

```sh
npm ci
npm run test:worker
```

`test:worker` first assembles the tracked fixture corpus and runs `astro build`.
It then starts Wrangler's supported `createTestHarness()` against the generated
`dist/server/wrangler.json`. The generated configuration loads the deployable
Worker entrypoint, Cloudflare Static Assets with `run_worker_first`, and an
isolated local D1 binding. No real tutorial material, deployment secret, or
external Discord request is needed.

The black-box tests use only HTTP requests through that harness. They cover an
anonymous public page and static asset, protected document and resource routes,
accepted, tampered, and expired sessions, the Discord OAuth start/callback/
logout routes, return-target validation, distinct failure states, and D1 OAuth
activity effects. Authenticated reading checks also exercise the native
Starlight navigation and page features. The Pagefind check loads the generated
bundle against the same Worker URL, verifies its bundle is protected, and
searches fixture Chinese, product, acronym, and `<details>` terms. The test
signer and its fixed secret live only under `test/support/`; production code
only receives configured secrets.

## Discord boundary

Wrangler's test harness sends Worker outbound `fetch()` calls through the Node
test process's `globalThis.fetch`. The OAuth tests replace that function with a
strict local responder, so they model member, non-member, Guild pagination,
refusal, and failure responses without network access. Harness runtime logs and
the isolated D1 binding prove that access tokens, Cookies, Secrets, and full
Discord responses do not persist or appear in the fail-open activity-write log.
