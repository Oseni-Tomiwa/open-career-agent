# R-01.1 implementation report

November 4, 2026. Base: `main` at `f032b8e`.

## Outcome and acceptance verdict

R-01.1 — Real Workspace Setup is implemented. Scoped SQLite/API/browser
acceptance passes. The full repository release gate is **not completely green**:
one worker freshness test fails identically on untouched baseline source, and
real PostgreSQL cases have not executed locally. The approved seven-stage
roadmap and broader/focused prototypes remain unchanged. R-01.2 is not started.

No personal .env/database was read or mutated. Existing migrations ran only
against owned disposable test databases. No migrations, dependency versions,
lockfile, personal configuration, staging, commits, or pushes are included.

## Implemented behavior

- Strict, default-off `LOCAL_WORKSPACE_SETUP_ENABLED` server configuration.
  GET/POST `/local-workspace` is available only in trusted direct-loopback
  development operation; cloud/production/network configurations return 404.
- The auth boundary checks the exact route before cloud credentials or any
  candidate persistence. Raw socket loopback, single valid loopback Host/API
  port, exact Origin, and absence of Forwarded/Via/X-Forwarded-* are enforced.
  POST requires Origin; same-origin command-line GET may omit it. CORS
  preflight never initializes identity. Unsupported methods cannot initialize.
- GET returns SETUP_REQUIRED or READY without creating data. POST accepts only
  `{}`, ignores no extra fields, and derives identity only from the server.
  Body/query identity injection is rejected before schema stripping/coercion.
  Replies use no-store. Storage errors are sanitized 503 responses, not first-run.
- `CandidateRepository.ensureCandidate` uses one primary-key-conflict-safe
  INSERT followed by a read. Replays and concurrent processes preserve the
  original identity/timestamps. A read failure after INSERT may follow a commit;
  retry recovers. No cross-operation rollback guarantee is claimed.
- Shared client transport validates strict responses/calendar dates, omits
  credentials, never calls the credential provider, discards caller/default
  authentication headers and rejects redirects. Ordinary cloud transport is
  retained.
- Development/API UI resolves identity before product data, ignores old demo
  sessions, and treats a browser candidate ID only as an optional compatibility
  assertion. Mismatch blocks entry. Cloud identity/grants remain unchanged;
  the separate self-hosted browser mode retains its fixed-ID requirement.
- First-run, pending, success, returning, empty, unavailable, disabled,
  unauthorized and failed-setup/retry paths are explicit. No personal-mode
  failure falls back to seed records. Demo-to-personal use requires a separate
  configured relaunch; no demo import/runtime mode switch exists.
- Empty workspaces show zero records and existing Career Profile/Search
  Preferences links. No manual capture, intelligence, deadlines or follow-up
  feature was added. Existing populated candidates reopen unchanged; setup does
  not establish record provenance or clear old sample data.

A local proxy stripping every forwarding header is indistinguishable from a
direct loopback client. This listener must not be published, tunnelled or
proxied; default-off and hard cloud/production rejection remain the boundary.

## Verification

All checks used the owned source copy `/tmp/rolevia-verification-slwnyvyu`,
without personal environment files. Tool commands had bounded runtimes and a
whitelisted environment; Node 24 was explicitly selected. pnpm checks after
the incident below used invocation-scoped
`pnpm_config_verify_deps_before_run=false`. Browser acceptance used only
installed binaries, an `envDir:false` build and owned ports/temporary SQLite.

| Check | Actual result |
| --- | --- |
| Formatting | Passed |
| Ten workspace typechecks | Passed |
| Root fixture/Playwright TypeScript configuration | Passed |
| ESLint | Passed: 0 errors, 11 existing Fast Refresh warnings |
| Shared-package/API/worker/web builds | Passed; ordinary web build reported its existing chunk-size warning |
| Schema tests | 13 passed |
| Config tests | 9 passed |
| Domain tests | 13 passed |
| API client final suite | 22 passed |
| SQLite/database suite | 154 passed; 25 real PostgreSQL cases skipped after parity addition |
| Sources | 20 passed |
| Intelligence | 178 passed |
| Web unit/component suite | 91 passed |
| API final suite | 76 passed, including cloud/auth security regressions |
| Worker | 62 passed, 1 failed |
| Existing seed browser suite | 25 passed, 1 existing skip |
| Final workspace browser suite | 21 passed across 1440/768/360 pixels |

The worker failure is
`apps/worker/src/quality/workflow.test.ts:313`, “schedules next freshness boundary
reevaluation and updates freshness upon reevaluation”: expected `stale`, got
`recent`. A second isolated copy of the unchanged checkout reproduced the same
failure. Its fixed August evaluation times interact with current observation
times; no worker fix/test change was added in this milestone. The full workspace
test command exited 1 and is not represented as passing.

No disposable PostgreSQL URL/service was configured. The new concurrent/replay/
reopen parity case is in the existing guarded suite; CI must execute it. A local
skip does not establish PostgreSQL runtime parity. Safari/Firefox and real
production/cloud deployments were not browser-tested; cloud boundaries were
covered by isolated API/web regression fixtures.

SQLite evidence includes four separate processes released by a barrier, two
browser tabs both observing first-run before concurrent POSTs, repeated setup,
post-commit confirmation failure/retry, reopen/API restart, and an independent
worker-style handle reading the same fixture database. Populated browser
fixtures retain a claim, opportunity, discovery match and application, all
visible through existing surfaces without setup POSTs. No worker scan is run
or worker-health claim made.

Browser checks cover no horizontal overflow, keyboard setup/confirmation/retry,
focus visibility and placement, disabled pending actions, aria-busy/status/
alert messaging, truthful errors, empty data, existing navigation destinations,
and light/dark themes. Thirty screenshots are retained with the detailed logs
under the chat artifact directory `rolevia-r-01-1-implementation`.

## Environment recovery and failed checks

Earlier dependency recovery restored the core compiler/linter baseline.
Browser test startup then exposed an exact dataless read in jsdom → Undici.
Bounded reads made 86 existing files (approximately 1.42 MB) resident; no
reinstall/version/configuration change was needed for that recovery.

Two standard pnpm script attempts unexpectedly invoked pnpm 11's default
`verify-deps-before-run=install` behavior on the disposable copy's mismatched
metadata. Those install attempts failed with ENOTFOUND. They were not an
approved reinstall, were not retried with network access, and do not count as
verification. Only the disposable dependency layout was affected: it was
archived, then temporary links to the already installed packages were restored.
Original checkout source/lockfile/dependency versions remained unchanged.
The acceptance runner was changed to direct existing binaries so it cannot
trigger that pnpm behavior. No personal pnpm configuration was edited.

Initial cold-start timeouts, wrong-cwd migration test failures, fixture bugs,
and interim type/lint failures were corrected or diagnosed before the final
results above. Exact command/exit/duration logs preserve these failures; no
unexecuted or timed-out check is counted as a pass.

## Reproduction commands

Run normal repository checks only in an isolated copy without personal .env
files; do not redirect application DATABASE_URL into test configuration.
Installed dependencies and Node 24 are prerequisites. These commands do not
install packages:

```bash
pnpm_config_verify_deps_before_run=false pnpm typecheck
pnpm_config_verify_deps_before_run=false pnpm lint
pnpm_config_verify_deps_before_run=false pnpm format:check
pnpm_config_verify_deps_before_run=false pnpm test
pnpm_config_verify_deps_before_run=false pnpm build
pnpm_config_verify_deps_before_run=false pnpm test:e2e
node scripts/test-workspace.mjs
```

`pnpm test` currently reproduces the baseline worker failure. PostgreSQL needs
the existing guarded local disposable `TEST_POSTGRES_URL` service/CI job, never
an application or personal database URL. No such service was started here.

## Review and remaining work

Independent read-only review found no material implementation/security defect.
Its populated-record acceptance finding was corrected and browser-verified.
Plan steps 11 and 36 remain open as complete release gates due PostgreSQL
execution and the baseline worker failure. Thirty-four other steps are recorded
as verified; this is not permission to bypass the remaining release checks.

The next roadmap stage is R-01.2 capture, requiring separate user authorization
and any required prototype approval. No new stage is begun here.

## Changed files and Git handoff

The exact reviewed manifest and suggested staging commands follow below.
Final transfer: 45 R-01.1 files were byte-verified against the isolated source copy. Git diff whitespace checks passed. All transferred files are unstaged. Existing unrelated audit/preparation
artifacts remain the user's. The manifest intentionally excludes dependency
layouts, build output, SQLite fixtures, logs and screenshots.

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

Only the user should execute the following after reviewing the known release-gate limitations and the diff:

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
  tsconfig.json
git diff --cached --check
git diff --cached
git commit -m "feat(workspace): add guarded local workspace setup"
```

No push is recommended while the remaining release gates are open. These are
suggestions only; no staging, commit, or push command was executed.
