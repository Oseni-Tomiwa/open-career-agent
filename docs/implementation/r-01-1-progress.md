# R-01.1 execution record

Plan: docs/superpowers/plans/2026-11-03-r-01-1-real-workspace-setup.md

- User authorized R-01.1 implementation and the validated focused UI on November 3, 2026. No staging, commits, pushes, new dependencies, or migrations authorized.
- Task 0 complete: dependency availability recovered; 10 workspace typechecks, lint (0 errors/11 warnings), and 68 isolated unit tests passed. UI browser review passed 27 viewport/state cases. Evidence remains in the chat visualization directory.
- Execution workspace: /tmp/rolevia-verification-slwnyvyu (no personal .env/data).
- Ruling: use this existing isolated source copy, preserving the user's Git ownership; transfer only reviewed R-01.1 source changes as unstaged working-tree files. No Git worktree/branch or commit operations.
- Ruling: task bookkeeping is recorded here rather than commit-oriented skill helper scripts, which conflict with user Git restrictions.
- Pre-flight interfaces: Task 1 workspace contracts/ensureCandidate feed Task 2 routes/client; Task 2 READY identity feeds Task 3 gate; Task 3 gate feeds Task 4 truthful overview and Task 5 browser acceptance. Server identity remains authoritative. No conflicting interface identified.
- Current task: R-01.1 handoff; implementation and scoped acceptance are complete, with release-gate limitations recorded below.

## Checkpoint 1 — persistence/contracts

- Added strict workspace schemas and idempotent `ensureCandidate`; schema tests 3/3, SQLite-focused tests 3/3 including four-process barrier race, reopen, and post-insert read failure replay.
- Database suite from its required package working directory: 154 passing, 24 real-PostgreSQL cases skipped (no TEST_POSTGRES_URL). The initial root-cwd run failed 17 existing persistence cases because `./migrations` was relative to the wrong directory; no production correction was needed.
- PostgreSQL parity case added to the existing disposable-service suite; execution remains a CI/local-service requirement, not claimed as passing.

## Checkpoint 2 — guarded API/client (in progress)

- Added default-off opt-in, exact local-route auth hook, raw loopback/Host/Origin/proxy-header guard, strict body/query checks, no-store status/create routes, sanitized storage failures, and credential-free typed client.
- First green: all 69 API tests, including existing cloud auth, passed; client 21/21 passed. Additional duplicate-Host and authenticated-cloud cases are being verified.
- API cold startup timed out once at 90s; subsequent direct import/create/inject evidence and 69-test run completed. No timeout was counted as a passing check.
- A typecheck detected an overbroad edit in deleteSearchTarget; restored its existing credential behavior before final checks. New test fixture issues (undefined header/null injection/statusCode name) corrected without weakening behavior assertions.
- Browser-test startup remains blocked in jsdom → undici by an observed dataless dependency read. Existing dependency contents are being made resident with bounded, read-only operations under the prior recovery authorization. No reinstall/config/version/lockfile changes.

## Checkpoint 3 — browser identity and first run

- The jsdom/Undici blocker was resolved through bounded reads of 86 existing runtime files (approximately 1.42 MB) across its dependency closure. No package was installed for that recovery.
- Added LocalWorkspaceGate before ProductDataProvider, resolved server identity with null local session, explicit local-entry callback, optional browser compatibility assertion, cancellation, StrictMode safety, pending-action protection, confirmation focus, and actionable error states.
- Seed/cloud passthrough retained; local API mode ignores stale demo sessions. Memoized candidate-bound repositories remount when source/mode/identity changes.
- Focused gate/auth/shell/overview tests passed. Full web suite: 91 passing. The existing shortcut regression assertion was updated to the intentional explicit demo label; shortcut behavior remains covered.

## Checkpoint 4 — honest workspace and mode communication

- Added real empty overview with zero opportunities/applications, no invented priorities/activity, existing Profile/Search Preferences links, and capture explicitly deferred.
- Demo instructions require a separate configured relaunch and leave the demo active. API errors remain errors, with retry, rather than seeded/empty success.
- Desktop/tablet/mobile browser checks verified focus, keyboard setup, responsive layout, existing navigation links, success/errors and theme behavior. Screenshot inspection found low-contrast identity/exit text on the existing dark rail; corrected those selectors for the personal entry/exit flow.

## Verification-environment incident

- Two package-script verification attempts unexpectedly triggered pnpm 11's default dependency-status auto-install in the disposable copy. Both installs failed with ENOTFOUND. They are failures, not successful verification or an approved reinstall.
- Original checkout source/lockfile/dependency versions remained unchanged. No network retry, reinstall, store repair, or personal configuration edit was performed. The failed temporary dependency layout was archived, and only temporary symlink connections to existing installed packages were restored.
- Inspection of the existing pnpm CLI confirmed `verify-deps-before-run` defaults to `install`. Subsequent package checks used invocation-scoped `pnpm_config_verify_deps_before_run=false` and Node 24. The committed acceptance runner invokes existing compiler/Vite/Playwright binaries directly and does not invoke pnpm/install.
- Temporary verification-only helper files/caches were moved outside the source copy before final formatting checks. No helper or dependency layout is part of the handoff.

## Checkpoint 5 — acceptance and review

- The real loopback API fixture creates its own unique temporary SQLite directory and never reads .env or accepts a caller's database path. It applies only existing migrations to that fixture. An independent handle verifies the worker's database identity without starting scans or claiming worker health.
- Initial acceptance: 18/18 browser tests at 1440/768/360. Independent review found no material implementation/security defect, but identified that the returning fixture contained only a candidate. Corrected it to contain existing claims, opportunity/snapshot/discovery match, and application; browser assertions now verify those records stay visible and unchanged without POST.
- A fixture-reporting omission initially failed the strengthened acceptance test; corrected the disposable inspection result and reran: 18/18 passed, including retained records. Added final loading/dark-theme scenarios for explicit browser verification.
- Existing seed regression: 25 passed, one skipped. Scope-specific API security, client, schema, SQLite persistence, web identity, navigation, profile, search, and empty-state regressions pass.
- Full workspace test run: one worker freshness failure (`recent` versus expected `stale`, workflow.test.ts:313), independently reproduced from unchanged baseline source in a second disposable copy. No worker production/test source was changed to hide this failure.
- Real PostgreSQL execution remains unperformed locally (25 cases skipped after the new parity case); CI's existing disposable service must execute it. Full-green release acceptance is not claimed.
- No R-01.2 work, personal database access, schema/migration/dependency changes, staging, commits, or pushes.

Final focused acceptance: 21/21 real API/SQLite browser tests passed, including loading indicators and dark-theme keyboard retry at all three widths. Final screenshots and detailed command logs are retained in the chat artifact directory under `rolevia-r-01-1-implementation`. The final API suite includes 76 passing tests; the client includes 22 passing tests after the explicit 400 mapping case.

Handoff: 45 R-01.1 files transferred into the original checkout and byte-verified. `git diff --check` passed. The pre-existing audit/preparation artifacts were preserved, and the index remains unstaged. The first-run guide uses existing automatic local startup migrations rather than a redundant manual migration command.
