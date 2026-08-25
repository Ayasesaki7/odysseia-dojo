# 类脑 Odysseia - 道馆挑战

This independent public repository contains the website program, its content schema,
non-sensitive fixtures, and public validation. It never stores real tutorials,
protected resources, archives, question banks, private content credentials, or
production Secrets.

## Requirements

- Node.js 24
- npm 12

Install only this repository's website dependencies:

```sh
npm ci
```

## Content assembly

The assembly module has exactly two stable command interfaces:

```sh
npm run content:fixtures
npm run content:local
```

`content:fixtures` removes any current runtime input and copies the tracked
`fixtures/` corpus into Git-ignored `src/content/docs/` and `public/protected/`.
Use it before public development, checks, builds, tests, CI, or any Preview.

`content:local` is intentionally limited to the trusted sibling layout
`dojo-sites/{odysseia-dojo,odysseia-dojo-content}` and rejects CI. It links only
the private repository's tutorial, extension, protected-image, and attachment
roots into those same ignored runtime locations. It has no argument or selector
for `archive/`, `question_banks/`, private configuration, or private dependencies.
It is for a local trusted preview only; it is not a deployment or remote-Preview
command.

After assembling an input, start the normal development server without replacing
it:

```sh
npm run dev
```

See [`docs/content-assembly.md`](docs/content-assembly.md) for the allowlist and
operational checks.

## Public validation

```sh
npm run test
npm run check
npm run build
npm run test:worker
npm run validate
```

`check` and `build` always reassemble fixtures. The production build validation
checks stable fixture URLs, protected fixture assets, and generated Pagefind
fragments, while rejecting archive, question-bank, sitemap, and RSS outputs.
`test:worker` starts the generated Worker with its real Static Assets and
isolated D1 bindings, then exercises the deployed boundary with fixtures. See
[`docs/worker-test-seam.md`](docs/worker-test-seam.md) for the fresh-checkout
command and the test-only Discord outbound boundary.

The fixture corpus is deliberately non-sensitive. It contains tutorial and
extension examples, Chinese and English search terms, an outdated page, optional
`<details>` content, and representative protected image and attachment paths.

## License boundary

The website program in this repository is licensed under
[AGPL-3.0-or-later](LICENSE). Real tutorial text and resources are not in this
repository. Their CC BY-NC 4.0 and third-party attribution boundaries are
published by the site when those user-facing pages are implemented.
