# Documentation workflows

Use this page when a change could make developer documentation stale. Each
maintained fact has one owner: update that authority first, then update a
navigator only when its route changes. These maps record current source, not
unimplemented designs or project status.

## Choose the writeback owner

| Changed fact | Update the owning authority | Relevant evidence |
| --- | --- | --- |
| Repository layout, public or trusted-local content flow, request flow, build flow, or the current-source boundary | [Code-map overview](code-map/overview.md) | Read the changed source owner and traverse the [developer navigator](README.md) to the updated map. |
| Worker-first handling, protected-access interface, protected response behavior, Session/Cookie owner, OAuth route, `auth_activity`, or deployed Worker seam | [Request and access map](code-map/request-access.md) | Use the focused Worker-boundary evidence selected by the changed interface; see the [Worker test seam](../worker-test-seam.md) for its procedure. |
| npm command, script, artifact verifier, migration, generated configuration, or test harness owner | [Tooling map](code-map/tooling.md) | Run the affected command or focused test when behavior changes; keep executable spelling in [`package.json`](../../package.json). |
| Content-assembly allowlist, mode, replacement behavior, or trusted-local procedure | [Content assembly contract](../content-assembly.md) | Use the content-assembly tests. Update a code map only if its owner, stable entrypoint, or navigation fact changes. |
| Worker-harness procedure or Discord outbound-test boundary | [Worker test seam](../worker-test-seam.md) | Use the Worker-harness test. Update a code map only if its owner, stable entrypoint, or navigation fact changes. |
| A developer-document route or page responsibility | This [navigator](README.md) or the [code-map selector](code-map/README.md), plus the relevant leaf | Resolve every changed route from the public [README](../../README.md). |

Create a new map leaf only when current source gives it a concrete owner and
stable entrypoint. A future implementation must establish those facts before a
map can own them.

## Documentation-only integrity check

For a documentation-only change, validate navigation and authority rather than
running unrelated software behavior:

1. Resolve every introduced or changed repository-relative Markdown link and
   target heading.
2. Read the changed route through the public [README](../../README.md), this
   navigator, and its relevant map or operational page.
3. Search maintained documentation for duplicated or superseded authority.
4. Check changed text for trailing whitespace and final newlines, then run
   `git diff --check`.

When behavior changes as well, add the focused evidence for the changed
interface or seam; documentation validation does not replace it.
