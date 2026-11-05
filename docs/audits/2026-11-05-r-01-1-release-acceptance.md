# R-01.1 final release acceptance audit

November 5, 2026. Repository: `main`, `f032b8ef2e850ba32cfeb4a2c577a709023e23a1`.

## Verdict: BLOCKED for formal release acceptance

The R-01.1 production/security review found no confirmed regression. All 25
previously unexecuted PostgreSQL tests now pass on an explicitly owned,
disposable PostgreSQL 16.15 instance. Two test-evidence issues still prevent an
unconditional release acceptance:

1. The normal worker freshness test is red on both current and unchanged
   baseline source because its fixture mixes wall-clock observations with fixed
   historical evaluation dates. This is a pre-existing test-fixture defect.
2. The PostgreSQL candidate test uses concurrent Promise.all calls through one
   repository/pool, without the approved plan's explicit independent-client
   readiness/start barrier. Passing it does not prove that exact condition.

No test was weakened, no production code was modified, and no correction was
implemented in this audit. The narrowly scoped corrections proposed below need
separate authorization. This verdict does not authorize R-01.2.

## 1. Worker failure: exact classification and cause

Failing test:
`apps/worker/src/quality/workflow.test.ts`, "schedules next freshness boundary
reevaluation and updates freshness upon reevaluation".

Exact first failing assertion, line 313:

```ts
expect(updatedEval?.qualityFreshnessBucket).toBe('stale');
```

Actual value: `recent`.

The fixture creates its source observation and raw `updated_at` with
`Date.now() - 5 * DAY_MS` (lines 92–114), while the test evaluates at fixed
`2026-08-30T10:00:00Z`, then 35 days later (`2026-10-04T10:00:00Z`, lines
272–306). At the audit's real calendar time, the source timestamp is later than
both evaluation times. `qualityFreshnessAnchor` chooses the source update date
(`packages/intelligence/src/quality/engine.ts:122`); the worker clamps negative
age to zero (`apps/worker/src/quality/workflow.ts:172`). Zero days is `recent`.
The unchanged freshness bucket/input fingerprint prevents the expected new
stale revision. This explains the observed value rather than treating the
assertion as a dependency/startup timeout.

Controlled reproduction changed only the external diagnostic clock, not any
repository file. A temporary Vitest setup used Date-only fake timers frozen
at `2026-08-30T10:00:00.000Z`; ordinary timers remained real. Its observation
anchor becomes August 25, so October 4 is 40 days later and correctly `stale`.

| Source | Real wall clock | External fixed-clock diagnostic |
| --- | --- | --- |
| Current R-01.1 | Fails at line 313: recent vs stale | Passes unchanged test |
| Unchanged baseline | Same failure | Passes unchanged test |

Each command selected the single failing test; the six other tests in that file
were not executed in these diagnostic runs. No claim that the normal worker
suite is green follows from the fixed-clock experiment.

Baseline integrity was checked: all 369 tracked files in the separate baseline
copy matched `git show HEAD:<path>`. The worker and quality-engine source have
no Git diff. The implementation copy matched all 45 handed-off files. Both
copies had no personal .env files, and tests created disposable SQLite fixtures.

Classification: **pre-existing, reproducible, calendar-dependent test-fixture
defect; not an R-01.1 regression and not intermittent dependency/tool startup
instability**. The behavior changes with the fixture's calendar relationship;
the two-source/two-clock comparison isolates that variable. No worker production
logic correction is supported by this evidence.

### Separate proposal A — test fixture correction (not implemented)

Scope: `apps/worker/src/quality/workflow.test.ts` only. Give fixture construction
and evaluation one explicit reference clock. Prefer Date-only fake timers set
before fixture creation and restore real timers during cleanup, or pass an
explicit shared timestamp into every relevant fixture write. Keep the original
recent-to-stale, scheduling, supersession, and findings assertions.

Acceptance: the focused test, all seven quality-workflow tests, and the normal
worker/full workspace suites pass with a coherent fixture clock, without
changing worker/engine behavior or loosening assertions. This proposal requires
explicit approval before a repository edit.

## 2. PostgreSQL acceptance: 25 passed, zero skipped

The suite is `packages/database/src/postgres-real-deep-verification.test.ts`.
It requires PostgreSQL 16 and a local `TEST_POSTGRES_URL` database whose name
starts with `rolevia_test`. It drops/recreates public and drizzle schemas per
case. The fresh-migration case also connects to the same server's `/postgres`
maintenance database and creates/drops `rolevia_test_fresh_<pid>`. Therefore,
a name-prefix check alone is insufficient permission to use a shared server.
An entirely owned temporary cluster was used here.

Docker was available and already contained `postgres:16-alpine`; no image was
pulled and no package/service was installed. The audit created:

- Container `rolevia-r011-release-audit-1329a9c38b18`, labelled with its unique
  audit ownership token.
- Image `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685`.
- New database `rolevia_test_r011_1329a9c38b18` and fresh test-only role
  `rolevia_audit`, with a generated password that is not retained in this report.
- Loopback-only published port `127.0.0.1:61946`; tmpfs-only data/runtime mounts,
  no bind mounts or persistent volumes, and a read-only container root.

Before any test DDL, container identity/image/ownership/storage/port were
verified, then SQL confirmed the exact database, role, and server version
`160015`. Deliberately wrong credentials were rejected with `28P01`; the valid
fresh credentials worked. Only that generated URL was forwarded as
TEST_POSTGRES_URL into a whitelisted Node 24 test process. Application/personal
DATABASE_URL and .env values were not inherited or read.

Result: **25 passed, 0 failed, 0 skipped**, test command exit 0, 3.93 seconds
including startup/imports (3.07 seconds executing tests). These cover candidate
initialization/replay/reopen, cross-source identity, migrations/upgrades,
task claim/lease races, optimistic application updates, auth registration
rollback, evaluation/decision lineage, source ingestion/ownership, worker
pipeline, projections/parity, public identity recovery, tokens/reset/OAuth,
and pool cleanup. One grouped case also verifies SQLite migration continuity.

The owned container was removed successfully after the tests; the temporary
credential env file was deleted. No existing database/container was used.
There is now **no PostgreSQL availability/execution blocker**. CI was not run by
this local audit; its configured service remains a separate check.

### Separate proposal B — strengthen committed PG acceptance (not implemented)

At `postgres-real-deep-verification.test.ts:124`, eight Promise.all calls through
one repository/pool can exercise concurrency, but do not establish the
explicit independent-client synchronized-start requirement in plan line 130.
This is an acceptance-coverage gap, not evidence of a broken INSERT.
The current case verifies identity/timestamps/count/reopen, not populated
associated-record retention on PostgreSQL.

Scope: the existing PostgreSQL test file only. Pre-establish independent
clients/handles, verify distinct backend sessions, release them from an
explicit readiness barrier, and assert one candidate with identical returned
timestamps. Add a populated candidate and unrelated-record preservation/reopen
case. Keep the disposable-cluster safety guard. No dependency, production code,
or migration changes are needed. Obtain approval before editing, then run
these cases and the full 25-case suite on a new owned cluster.

## 3. Security and regression evidence

Fresh audit runs, isolated environments and disposable fixtures:

| Check | Result |
| --- | --- |
| Local API + cloud/auth security suites | 49 passed (28 local, 13 auth-security, 8 public-auth) |
| SQLite candidate persistence/concurrency/reopen | 3 passed, including four separately started Node processes and an IPC start barrier |
| Web auth/gate/shell regressions | 14 passed |
| PostgreSQL deep suite | 25 passed, zero skips |
| Worker failing test, current + baseline | Both fail with real clock; both pass under diagnostic fixed clock |

Reconfirmed boundaries:

- Setup defaults off; strict true/false parsing rejects malformed opt-in.
- Configured server identity alone selects the candidate. Body/query identity
  injection and browser-ID mismatch are rejected; local setup does not mint
  users, sessions or candidate grants.
- Raw socket loopback, exact origin, valid single loopback Host/port, and no
  Forwarded/Via/X-Forwarded-* are required. Storage lookup/initialization is
  short-circuited for disabled/forbidden requests. GET does not initialize.
- Cloud/production setup returns 404 even with opt-in and authenticated cloud
  credentials. Existing cookie-origin, session and candidate ownership checks
  remain exercised by the security regressions.
- SQLite first-write contention, replay, committed-insert/read-failure recovery,
  and reopening pass. Existing/unrelated records are preserved by API tests.
  PostgreSQL conflict/replay/reopen passes subject to the barrier coverage gap.
- API-mode identity resolves before product data; old demo sessions cannot select
  the personal candidate. No seed fallback occurs on personal API failure.
- Demo-to-personal guidance is static; there is no runtime mode-switch handler.
  Mode comes from immutable launch configuration and a separate relaunch.

The previous 21 real API/SQLite browser scenarios at 1440/768/360 and 25 passing
seed browser regressions (one existing skip) were not rerun in this focused
audit. Their source files remain byte-identical to the verified implementation
copy, and the prior evidence remains available. The prior browser scenarios
cover actual API restart, retained claims/opportunities/applications and the
explicit demo transition. Fresh API/repository/web checks above supplement that
evidence; they are not represented as a new full browser run or a new green
full-release test run.

A header-stripping trusted local proxy remains indistinguishable from a direct
local client. The accepted deployment boundary is trusted direct-loopback
local development, default off; the setup listener must not be published or
tunnelled. No network/cloud onboarding or authentication guarantee was added.

## 4. All 45 files reviewed and failed-install residue audit

The independent read-only reviewer inspected every manifest file, its diff or
new content, and the 36-step plan. Accounting before this new audit report:

- 45 R-01.1 implementation paths: 28 tracked modifications and 17 untracked/new
  paths; 16 production/source, 13 tests, 10 harness/config/workflow/package,
  and 6 documentation paths.
- No tracked changes outside that manifest. The extra untracked
  `docs/audits/2026-11-03-r-01-1-preimplementation-blockers.md` is an existing
  preparation artifact and excluded from suggested implementation staging.
- This audit adds only this Markdown report. No implementation file, dependency,
  schema, database, migration, personal configuration, index, commit or push
  is modified by the audit.

No unexpected/unrelated implementation change, personal opportunity record,
secret, generated build, image/trace/log, SQLite file or temporary dependency
layout was found in the change set. Targeted private-key/AWS/GitHub/OpenAI
secret-signature checks also returned no matches; this is supporting evidence,
not a claim of universal secret detection.

Every package dependency/devDependency/peerDependency/runtime declaration
matches HEAD. Root package.json adds only the acceptance script. There are no
lockfile, migration, worker production, API/worker entrypoint, or
ProductDataProvider changes. No R-01.2 capture or unrelated feature exists.

Coherent file-map deviations: the fixture/orchestrator is under scripts/ rather
than the proposed e2e/support path; parity is in the existing deep PostgreSQL
suite; a dedicated personal-overview test covers the existing surfaces; README
removes a redundant manual migration step because local startup already applies
existing migrations. These do not alter the accepted architecture. The missing
PG barrier means the historical checked checklist must not be read as proof of
full plan fidelity. Step 11 now has passing local PG execution; CI and step 36's
normal full-green release gate remain outstanding.

The historical failed pnpm commands explicitly logged recreation of
`/private/tmp/rolevia-verification-slwnyvyu/node_modules`, then failed with
ENOTFOUND through pnpm's `runDepsStatusCheck` automatic install. They were not
successful verification. No network reinstall retry was made. That temporary
layout was archived and links to existing installed contents restored.

Additional evidence collected now:

- **15,219 of 15,219** dependency file SHA-256 hashes recorded before those
  attempts still match in the original checkout; none missing or changed.
- The original pnpm-lock.yaml matches its pre-recovery SHA-256 exactly.
- Original `.modules.yaml`, workspace-state metadata and the virtual-store
  lockfile retain September 6 modification times, preceding the November
  attempts. All dependency declarations remain unchanged.

No lasting original-repository dependency alteration was found. There was no
complete pre-incident hash inventory of every ignored file, so the audit cannot
retrospectively prove byte identity for all unrecorded ignored metadata. The
bounded limitation is retained rather than asserting a universal clean-room
proof. No remediation/reinstall is recommended from the evidence available.

## 5. Remaining risks and required next decisions

1. Approve the worker test-only fixture correction and rerun the normal worker
   and full workspace checks. Until then, default tests remain red.
2. Approve the PG test-only barrier/preservation coverage correction, then rerun
   it and the full suite on a new isolated cluster. Passing the current suite
   does not remove this plan-specific regression-coverage gap.
3. Keep the direct trusted-loopback operational restriction; this local setup
   is not a remotely exposed identity service.
4. CI and full browser/release checks were not newly executed in this audit.
   No production deployment, personal database, shared service or R-01.2
   workflow was exercised.

These are separate correction proposals only. **Stop here for user review.**

## 6. Complete implementation change manifest

```text
.env.example
.github/workflows/ci.yml
README.md
apps/api/src/app.ts
apps/api/src/auth-security.test.ts
apps/api/src/auth.ts
apps/api/src/local-workspace.test.ts
apps/api/src/local-workspace.ts
apps/web/e2e/local-workspace.spec.ts
apps/web/e2e/product.spec.ts
apps/web/src/app/AppShell.tsx
apps/web/src/app/AuthProvider.test.tsx
apps/web/src/app/AuthProvider.tsx
apps/web/src/app/AuthenticatedApplication.tsx
apps/web/src/app/LocalWorkspaceGate.test.tsx
apps/web/src/app/LocalWorkspaceGate.tsx
apps/web/src/app/PublicApplication.test.tsx
apps/web/src/app/PublicApplication.tsx
apps/web/src/features/today/PersonalWorkspace.test.tsx
apps/web/src/features/today/TodayPage.tsx
apps/web/src/styles.css
apps/web/tsconfig.node.json
apps/web/vite.workspace.config.ts
docs/development/setup.md
docs/implementation/r-01-1-progress.md
docs/implementation/r-01-1-report.md
docs/product/project-status.md
docs/superpowers/plans/2026-11-03-r-01-1-real-workspace-setup.md
package.json
packages/api-client/src/client.test.ts
packages/api-client/src/client.ts
packages/config/src/browser.ts
packages/config/src/config.test.ts
packages/config/src/server.ts
packages/database/src/candidate-workspace-repository.test.ts
packages/database/src/postgres-real-deep-verification.test.ts
packages/database/src/repositories/candidate-repository.ts
packages/schemas/src/index.ts
packages/schemas/src/workspace.test.ts
packages/schemas/src/workspace.ts
playwright.config.ts
playwright.workspace.config.ts
scripts/test-workspace.mjs
scripts/workspace-fixture.ts
tsconfig.json
```

## 7. User-owned Git commands (not executed)

The release verdict remains BLOCKED. If you choose to checkpoint the reviewed
implementation and audit before the separate test corrections, the exact
scoped commands below exclude the older preparation-only audit artifact.
Review staged content before committing; this checkpoint is not a declaration
of release acceptance. No push or release-tag command is recommended here.

```bash
cd /Users/mavery/Documents/Codex-workspace/Open-career-agent
git status --short
git diff --check
git diff --stat
git add -- \
  .env.example \
  .github/workflows/ci.yml \
  README.md \
  apps/api/src/app.ts \
  apps/api/src/auth-security.test.ts \
  apps/api/src/auth.ts \
  apps/api/src/local-workspace.test.ts \
  apps/api/src/local-workspace.ts \
  apps/web/e2e/local-workspace.spec.ts \
  apps/web/e2e/product.spec.ts \
  apps/web/src/app/AppShell.tsx \
  apps/web/src/app/AuthProvider.test.tsx \
  apps/web/src/app/AuthProvider.tsx \
  apps/web/src/app/AuthenticatedApplication.tsx \
  apps/web/src/app/LocalWorkspaceGate.test.tsx \
  apps/web/src/app/LocalWorkspaceGate.tsx \
  apps/web/src/app/PublicApplication.test.tsx \
  apps/web/src/app/PublicApplication.tsx \
  apps/web/src/features/today/PersonalWorkspace.test.tsx \
  apps/web/src/features/today/TodayPage.tsx \
  apps/web/src/styles.css \
  apps/web/tsconfig.node.json \
  apps/web/vite.workspace.config.ts \
  docs/development/setup.md \
  docs/implementation/r-01-1-progress.md \
  docs/implementation/r-01-1-report.md \
  docs/product/project-status.md \
  docs/superpowers/plans/2026-11-03-r-01-1-real-workspace-setup.md \
  package.json \
  packages/api-client/src/client.test.ts \
  packages/api-client/src/client.ts \
  packages/config/src/browser.ts \
  packages/config/src/config.test.ts \
  packages/config/src/server.ts \
  packages/database/src/candidate-workspace-repository.test.ts \
  packages/database/src/postgres-real-deep-verification.test.ts \
  packages/database/src/repositories/candidate-repository.ts \
  packages/schemas/src/index.ts \
  packages/schemas/src/workspace.test.ts \
  packages/schemas/src/workspace.ts \
  playwright.config.ts \
  playwright.workspace.config.ts \
  scripts/test-workspace.mjs \
  scripts/workspace-fixture.ts \
  tsconfig.json \
  docs/audits/2026-11-05-r-01-1-release-acceptance.md
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "feat(workspace): add guarded local workspace setup"
```

No staging, commit or push command was executed. The index remains unchanged.
