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
an accepted test-only signed session, a tampered session, the provisional
dynamic authentication entrypoint, the scheduled handler, and D1 availability.
The test signer and its fixed secret live only under `test/support/`; production
code only verifies the configured `SESSION_SECRET`.

## Discord boundary

Wrangler's test harness sends Worker outbound `fetch()` calls through the Node
test process's `globalThis.fetch`. Future Discord tests replace that function
with a strict local responder before starting a harness, so they can model
member, non-member, pagination, refusal, and failure responses without network
access. `worker-harness.test.mjs` proves this with a test-only Worker probe; it
does not add OAuth behavior to the deployed site.
