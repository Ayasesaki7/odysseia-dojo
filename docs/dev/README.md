# Developer documentation

This is the stable entry point for maintaining the public website repository.
It routes readers to the smallest current authority; indexes do not duplicate
the facts owned by their destination pages.

| What I need to do | Start here | What it owns |
| --- | --- | --- |
| Orient myself in the repository, its content inputs, request path, or build path | [Code-map overview](code-map/overview.md) | Current layout and cross-cutting flow ownership. |
| Change protected delivery, Sessions, Cookies, OAuth routes, `auth_activity`, or the deployed Worker seam | [Request and access map](code-map/request-access.md) | Worker-first request handling and access-related source owners. |
| Change browser observation collection, `/api/fingerprint`, per-Session D1 persistence, or its trust boundary | [Browser observation map](code-map/observation.md) | Current browser and server observation owners. |
| Run V1 D1 retention, a fixed investigation query, or a verified-account deletion | [Data retention and investigation runbook](../data-retention-and-investigation.md) | Account-admin procedure and the fixed SQL catalog. |
| Find an npm command, script, generated artifact check, migration, or test harness | [Tooling map](code-map/tooling.md) | Current command and tooling owners. |
| Run public CI, a fixture Preview, or the Win10-host/VM-LAN browser acceptance check | [Public fixture CI and Preview isolation](../public-fixture-ci.md) | Public CI procedure, isolation controls, and manual browser checklist. |
| Decide which documentation authority to update or how to validate a documentation change | [Documentation workflows](workflows.md) | Writeback routing and documentation-integrity evidence. |
| Work with fixture or trusted-local content input | [Content assembly contract](../content-assembly.md) | The authoritative operational content-assembly contract. |
| Run or change the production-shaped Worker check | [Worker test seam](../worker-test-seam.md) | The authoritative harness and Discord-boundary procedure. |

These maps describe checked-in source as it exists now. Product scope, ticket
state, and historical implementation evidence are maintained outside this
public repository.
