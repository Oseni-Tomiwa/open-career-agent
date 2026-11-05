# Rolevia project status

Updated November 4, 2026. This file records implementation evidence, not a claim
that the entire personal tracker is ready for everyday use.

The approved Personal Opportunity Tracker V1 prototype and seven-stage roadmap
remain the product baseline. R-01.1 is the only authorized implementation in
this change. Existing architecture and candidate/database schemas are reused.

| Stage | Scope | Status |
| --- | --- | --- |
| R-01.1 | Real Workspace Setup | Implemented; scoped acceptance verified, full release gate has the limitations below |
| R-01.2 | Opportunity capture | Planned; not authorized or started |
| R-01.3 | Applications | Planned; not started as a tracker milestone |
| R-01.4 | Follow-ups | Planned; not started |
| R-01.5 | Daily workspace | Planned; not started |
| R-01.6 | Reliability and recovery | Planned; not started |
| R-01.7 | End-to-end tracker acceptance | Planned; not started |

R-01.1 adds default-off, guarded local workspace status/initialization, durable
server-selected identity, first-run/returning/error UI, truthful personal empty
states, and explicit demo separation. Cloud authentication and candidate grants
remain separate. Local setup does not create a cloud account or grant.

Use the [setup guide](../development/setup.md) for a personal local launch.
A fresh candidate starts with zero opportunities/applications. Existing
candidates reopen without data changes; their records are not automatically
verified or cleared. Manual capture is deferred to R-01.2.

## Verification and outstanding work

- Ten workspace typechecks and builds passed in an isolated copy.
- Lint passed with zero errors and 11 existing Fast Refresh warnings.
- Real API/SQLite browser acceptance passed at 1440, 768, and 360 pixels,
  including concurrent first-run requests, retries, restart, and populated
  record retention. Seed browser regression passed with one existing skip.
- Full workspace tests have a worker freshness failure at
  `apps/worker/src/quality/workflow.test.ts:313`. The identical failure was
  reproduced on an untouched baseline copy. It was not changed in R-01.1.
- Real PostgreSQL tests were not executed locally: no disposable
  `TEST_POSTGRES_URL` was configured. The new parity case is included in the
  existing guarded PostgreSQL suite and must run in CI.
- No personal environment/database was used. Existing migrations were applied
  only inside disposable test fixtures. No dependency versions, configuration,
  lockfiles, or migrations were changed.

The scoped R-01.1 behavior is reviewable. A completely green release gate is
not claimed while the baseline worker failure and PostgreSQL execution remain
outstanding. Review the [execution record](../implementation/r-01-1-progress.md)
and implementation report before committing. No R-01.2 work is authorized.
