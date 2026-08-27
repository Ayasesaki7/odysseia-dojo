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
anonymous public page and required `/_astro/` asset; canonical, trailing-slash,
`index.html`, and encoded protected document/resource aliases; actual Pagefind
bundle and fragment output; and protected images and attachments. They also
cover accepted, tampered, expired, forged, and malformed sessions;
authentication/classification/routing failures; private cache headers and an
authenticated-then-anonymous reuse attempt. The OAuth start/callback/logout,
return-target, distinct failure-state, and D1 OAuth-activity checks remain at
the same boundary. Authenticated reading checks also exercise the native
Starlight navigation and page features. The Pagefind check loads the generated
bundle against the same Worker URL and searches fixture Chinese, product,
acronym, and `<details>` terms. The test signer and its fixed secret live only
under `test/support/`; production code only receives configured secrets.

The OAuth routes and their D1 activity write are Astro `src/pages/api/**`
endpoints, while `src/middleware.ts` applies the shared Session policy to
Astro-rendered routes. The custom Worker remains intentionally narrow: with
`assets.run_worker_first`, it invokes that same policy before delegating
protected static-asset requests to the Astro Cloudflare handler. This is
necessary because the adapter returns matching `ASSETS` before Astro middleware
runs.

## Discord boundary

Wrangler's test harness sends Worker outbound `fetch()` calls through the Node
test process's `globalThis.fetch`. The OAuth tests replace that function with a
strict local responder, so they model member, non-member, Guild pagination,
refusal, and failure responses without network access. Harness runtime logs and
the isolated D1 binding prove that access tokens, Cookies, Secrets, and full
Discord responses do not persist or appear in the fail-open activity-write log.
