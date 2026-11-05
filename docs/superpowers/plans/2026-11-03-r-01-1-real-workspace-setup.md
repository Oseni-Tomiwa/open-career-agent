# R-01.1 — Real Workspace Setup Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` after explicit implementation authorization. Steps use checkbox syntax. The user alone performs commits and pushes.

**Goal:** Open an empty, persistent personal workspace locally without manually inserting a candidate or mixing in fictional demo data.

**Architecture:** Preserve React/Vite → shared typed API client → Fastify → existing candidate repository. Add a development-only local setup boundary that resolves a server-selected candidate before mounting product data. Cloud identity remains authoritative and unchanged.

**Tech Stack:** Node 24.x, pnpm 11.17.0, TypeScript, TypeBox, Fastify, Drizzle, SQLite/PostgreSQL, React, Vitest, Playwright. No new dependencies.

**Spec:** Approved Tracker V1 prototype, seven-stage roadmap, and R-01.1 specification recovered from the November 3, 2026 “Mavery Engineering Framework” chat; its operative requirements are reproduced below. Existing architecture: `docs/adrs/ADR-007-rolevia-platform-architecture.md`, `docs/adrs/ADR-008-cloud-identity-authorization.md`, and `docs/architecture/persistence.md`.

**Status:** Proposed implementation details; production implementation is NOT authorized. This document is the only planned change made during planning.

## Global constraints and recovered scope

- Preserve the approved clickable prototype and seven-stage roadmap: R-01.1 setup; R-01.2 capture; R-01.3 applications; R-01.4 follow-ups; R-01.5 daily workspace; R-01.6 reliability/recovery; R-01.7 end-to-end acceptance.
- Broader Tracker V1 includes jobs, internships, freelance opportunities, fellowships, grants, and competitions/hackathons. None is added to the domain in this stage.
- Local-first, single-user setup; cloud deployment is deferred. No changes to intelligence, source adapters, application workflows, or task semantics.
- No dependency/version changes, schema migrations, personal-database test runs, automatic commits, or pushes.
- Setup creates only a candidate. Never seed claims, opportunities, applications, preferences, users, grants, sessions, or jobs.
- Demo and personal state remain separate. Empty API results stay empty; failed API requests stay errors.
- Local trusted identity is not password authentication and must not be described as cloud-grade security.
- User approval of this plan is required before implementation. Review any newly specified first-run/error UI states not demonstrated by the approved prototype before implementing those UI changes.

## Review focus

1. Concurrent requests, lost responses, and React StrictMode must not create duplicate candidates or rewrite timestamps (Tasks 1–3).
2. Wrong/missing Origin, forged Host/forwarded headers, non-loopback sockets, and cloud/production modes must not enable local setup (Task 2).
3. Stale demo sessions and browser-configured candidate IDs must not select another personal candidate (Task 3).
4. Invalid contracts, unavailable storage/API, and empty data must remain distinguishable, with retry and no seeded fallback (Tasks 2–4).
5. Browser reload, API restart, worker access, and existing populated candidates must preserve identity/data without initialization side effects (Tasks 1, 4–5).

## 1. Confirmed repository facts

Facts below were inspected locally; runtime behavior remains subject to the verification gate.

| Existing location/function | Reuse |
| --- | --- |
| `packages/database/src/repositories/candidate-repository.ts`: `createCandidate`, `getCandidate` | Candidate table access. Keep existing create semantics for existing callers; add a separate idempotent method. |
| `packages/database/src/schema.ts`, `schema-pg.ts`: `candidates` | Existing primary key and created/updated timestamps; no new table required. |
| `packages/database/src/schema-helper.ts`: `getTables` | Engine-specific table selection. |
| `packages/database/src/client.ts`: `openDatabase`, `databaseIsReady` | Existing handles and health checks; no database opening during planning. |
| `apps/api/src/app.ts`: `createApiApp`, `registerAuthBoundary` call | Register focused local routes through the same API. |
| `apps/api/src/auth.ts`: `registerAuthBoundary`, `getAuthenticatedPrincipal` | Preserve sessions, ownership, production guards; add a narrowly scoped setup-route guard before ordinary candidate checks. |
| `packages/config/src/server.ts`: `parseApiConfig` | Server-selected `trustedCandidateId`, environment, identity mode, bind address, web origin. |
| `packages/config/src/browser.ts`: `parseBrowserConfig` | Keep cloud rules and source selection; permit local development API mode without a browser candidate ID. |
| `packages/api-client/src/client.ts`: `RoleviaApiClient`, private `request` | Add schema-validated setup methods using existing errors and AbortSignal support. |
| `apps/web/src/app/AuthProvider.tsx`: `AuthProvider`; `authContext.ts`: `useAuth` | Cloud session flow and local entry routing. Browser sessionStorage is not local ownership authority. |
| `apps/web/src/app/AuthenticatedApplication.tsx`, `ProductDataProvider.tsx` | Resolve identity before constructing the personal API repository; reuse loading/error/retry behavior. |
| `apps/web/src/data/apiProductRepository.ts`: constructor, `getSnapshot` | Explicit resolved candidate; no seed fallback. |
| `apps/web/src/app/AppShell.tsx`, `components/EmptyState.tsx`, `features/today/TodayPage.tsx` | Existing shell, mode label location, and empty presentation. |
| `apps/api/src/main.ts`, `apps/worker/src/main.ts` | Both currently resolve the same root-relative SQLite configuration. Verify without changing startup/migration behavior. |

Current constraints: the browser requires a candidate ID for non-cloud API mode; the API does not initialize that local candidate. `createCandidate` is a plain insert. Public development sign-in fabricates a development session. Cloud registration creates identity through its separate verified-account flow. The existing Playwright configuration starts only the web preview, not a real API/database.

## 2. Proposed decisions and contracts

These decisions are proposals for review, not existing functionality.

### Candidate selection and initialization

- Use only `ApiConfig.trustedCandidateId`, already selected server-side. Do not accept a candidate ID/name in setup requests and do not list all candidates.
- A configured existing candidate is reopened, including its existing records. An absent candidate requires a deliberate Create personal workspace click.
- Exactly one row exists for the configured ID; unrelated pre-existing candidates are left untouched. This is not a global single-row invariant.
- Add `CandidateRepository.ensureCandidate(id: CandidateId, timestamp?: number): Promise<{ id: string; createdAt: Date; updatedAt: Date }>`.
- Insert using the existing primary key with `onConflictDoNothing({ target: candidates.id })`, then select and return the persisted row. Never update an existing candidate's timestamps. SQL uniqueness, not a preflight existence check, is the concurrency authority.
- The INSERT is the single atomic mutation. INSERT plus the subsequent SELECT is not claimed to be an atomic transaction: failure after a committed insert may return 503, and GET/replayed POST recovers the same row. There is no multi-row initialization requiring a transaction. Do not introduce an async callback inside a synchronous SQLite transaction. If the row is unexpectedly absent after insertion/conflict resolution, return a sanitized failure rather than fabricated success.
- Both existing candidate schemas contain precisely the required primary key and non-null timestamps; `getTables` exposes both. Keep `createCandidate` unchanged. No migration is required for this design. Protect against external deletion/modification through operational boundaries; direct concurrent database tampering is outside the guarantee.
- GET is read-only. Only POST initializes. No startup initialization or worker seeding.

### API

Add `GET /local-workspace` and `POST /local-workspace`. GET is necessary to distinguish absent/returning candidates without mutation; POST represents explicit consent to create. Auto-create-on-GET or a single mutating boot request would violate the first-run requirement. No list/select/delete/reset endpoint is needed.

GET 200 response is a strict discriminated union:

```ts
type LocalWorkspaceStatus =
  | { mode: 'local'; state: 'SETUP_REQUIRED' }
  | { mode: 'local'; state: 'READY'; candidate: {
      id: string; createdAt: string; updatedAt: string;
    } };
```

POST requires JSON `{}` (`additionalProperties: false`) and returns the READY variant with **200 for both creation and replay**. Validate the raw body in a route-local preValidation hook before Fastify can strip additional properties; do not change global validation behavior. Times are UTC ISO date-times emitted by `Date.toISOString()`: use a canonical UTC timestamp pattern in the schemas and reject non-finite/non-round-tripping dates in the two client methods, without introducing global TypeBox format registration. No arbitrary candidate fields, provider data, database path, secrets, or account token is returned.

Add `LocalWorkspaceStatusSchema`, `LocalWorkspaceReadySchema`, and `InitializeLocalWorkspaceInputSchema` to shared schemas, with inferred exported types. Client interfaces:

```ts
getLocalWorkspace(options?: RequestOptions): Promise<LocalWorkspaceStatus>;
initializeLocalWorkspace(options?: RequestOptions): Promise<LocalWorkspaceReady>;
```

Client sends `{}` for initialization. The current private `request` helper always invokes the configured credential provider, so the omission policy needs an explicit implementation: add a final private transport argument `transport: 'default' | 'local' = 'default'`. The two local methods use `local`; that branch does not invoke the credential provider, ignores default/provider/caller headers, sends only accept/content-type and the supplied AbortSignal, forces `credentials: 'omit'` and `redirect: 'error'`. It must never forward Authorization/cookie headers or follow a redirect. Default transport is unchanged. No public RequestOptions expansion or second transport abstraction is needed.

Errors use `ApiErrorEnvelopeSchema`: 400 `INVALID_REQUEST` for invalid body; 403 `LOCAL_WORKSPACE_FORBIDDEN` for failed request guards; 404 `NOT_FOUND` when local setup is disabled by deployment configuration; 503 `LOCAL_WORKSPACE_UNAVAILABLE` for candidate read/write failures. Sanitize public messages, retain request ID, set `Cache-Control: no-store` on both routes. Database/migration errors never become SETUP_REQUIRED.

### Local versus cloud boundary

Add the server-only `LOCAL_WORKSPACE_SETUP_ENABLED` setting: strict `true`/`false`, default false; expose it as optional `ApiConfig.localWorkspaceSetupEnabled` with absence interpreted as false for legacy injected configurations. The example remains disabled and the setup guide describes explicit local opt-in. Do not add a browser flag or secret. Enable these routes only when ALL configuration conditions hold: `localWorkspaceSetupEnabled === true`, `environment === 'development'`, identity mode is `development` or `self-hosted`, API bind hostname is exactly `localhost`, `127.0.0.1`, or `::1`, WEB_ORIGIN parses to a loopback hostname, and `trustedCandidateId` exists.

For enabled routes, reject any `Forwarded`, `Via`, or `X-Forwarded-*` header before persistence, even when it claims loopback. Require the **raw socket** remote address to be loopback (`127.0.0.1`, `::1`, or IPv4-mapped loopback); do not trust X-Forwarded-For. Validate Host as a loopback hostname with the configured API port; reject arbitrary DNS names. If GET has Origin, it must equal configured WEB_ORIGIN. POST requires an exact WEB_ORIGIN match, including rejection of missing/null Origin. Never treat CORS alone as write protection. No Referer fallback. Parse IPv6 Host syntax with a URL parser, normalize bracketed loopback addresses, and reject duplicate/malformed Host headers. Guard GET and POST before schema/body processing or DB access; after a denied reply, stop hook/handler execution. CORS OPTIONS preflight may use the existing CORS path but must never initialize/read candidate data; HEAD/other methods must not invoke the setup handler.

Cloud, production self-hosted, production development, wildcard/network bind, and non-loopback WEB_ORIGIN: return 404 before candidate storage access. Put this decision in the auth boundary for these two exact routes, so cloud requests cannot fall through to local initialization or leak setup state. Ordinary cloud routes retain existing authentication/401/403 behavior.

**Proxy trust limit:** These checks are defense in depth, not proof of direct access. A local reverse proxy/tunnel that strips forwarding headers and reproduces allowed Host/Origin is indistinguishable from a trusted local caller. A native same-machine process can also supply these headers. Setup is therefore supported only on a direct, trusted-machine listener with no public proxy/tunnel; opt-in must stay off in deployments and shared/untrusted local environments. Cloud identity/production gates deny setup even behind a proxy; an environment deliberately mislabelled development plus an exposed tunnel is outside the guarantee. Do not claim protection against an arbitrary malicious local intermediary.

The supported new browser first-run path is `VITE_DEPLOYMENT_MODE=development` with API data. Existing self-hosted browser mode retains its fixed-candidate requirement and behavior; R-01.1 does not create a network-accessible onboarding service. Cloud continues to obtain candidate identity only from the verified session and API ownership checks. No candidate grant is minted by local setup.

### Browser and UX

- Keep seed as the existing explicit configured demo mode. Label it “Demo workspace — fictional data; changes are temporary.” Do not build a runtime demo/personal switch or silently change configured modes.
- In development API mode, show the approved local entry through the existing public/auth composition. Replace fabricated identity for this entry with an `onEnterLocalWorkspace` callback: enter the local flow without creating a fake user/session.
- Add `LocalWorkspaceGate`, wrapping the personal product subtree before ProductDataProvider mounts. It calls GET, displays setup/error/loading, and supplies the READY candidate through a nested existing AuthContext. This also gates deep links.
- For real local mode, neither status nor candidate identity may derive authority from a persisted demo session. The outer AuthProvider retains navigation/sign-out handling, while the LocalWorkspaceGate's inner AuthContext supplies `session: null`, `cloud: false`, and only the server-resolved candidate ID. Do not display a demo email as the local owner. Guard all deep links before constructing ProductDataProvider.
- Disregard stored demo-session candidate identity in development API mode. The server response is authoritative. An explicitly configured browser candidate ID is a compatibility assertion only: if different from READY.id, block with `WORKSPACE_ID_MISMATCH` and configuration guidance; never select or create it.
- AuthenticatedApplication constructs a stable API repository with the resolved ID for local and cloud modes. Memoize it by source/mode/ID; key the product subtree by these values so stale data does not survive identity changes. Keep injected test repositories supported.
- The public callback may retain existing demo behavior in seed mode; cloud never exposes the local entry. Label local entry as trusted local access, not password sign-in.
- First run: loading → SETUP_REQUIRED → create button → pending → READY → empty overview. Disable repeated clicks, preserve error/retry, announce state and move focus after success. GET never creates a candidate.
- Returning user: loading → READY → existing workspace, no creation click or new insert. Refresh/restart resolves the same server ID without browser localStorage identity persistence.
- An existing configured candidate may contain development/sample or real records: reopening does not establish their provenance, and R-01.1 must not relabel them verified personal data, delete them, or promise a clean database. The guide explains using a new explicit candidate ID for a fresh workspace; the empty-state guarantee applies to a newly initialized candidate.
- Empty personal workspace: show zero real counts, no sample opportunities/applications, and working links to Career Profile/Search Preferences. Explain capture arrives in the next stage; do not enable an unfinished Add opportunity button.
- Failure: distinct API unreachable, setup disabled, invalid response/config mismatch, and storage unavailable states. Retry GET or POST as appropriate; retry after lost POST response is safe. Never show seeded data or zero-success counters after failure. Do not wipe existing records or auto-edit environment files.

R-01.1-specific setup/error/empty layouts were not independently recovered as interactive prototype states. Before their implementation, show a focused preview in the approved visual language for review; do not replace or reopen the approved broader workflow.

### Persistence

No schema or migration is expected. Reuse candidate IDs and timestamps in both database schemas. SQLite concurrency tests must use separate Node processes, each with its own handle to the same disposable database file, coordinated by an IPC start barrier. Multiple handles with Promise.all in one process do not prove overlapping writes with synchronous node:sqlite. PostgreSQL uses independent clients with a synchronized start. Preserve existing foreign keys and busy timeout. Cloud PostgreSQL routes remain disabled; the repository method is engine-portable and receives parity coverage in the existing safe test PostgreSQL infrastructure. No automatic cloud migration or SQLite-to-PostgreSQL conversion.

Do not change API/worker auto/manual migration policy. Fresh-test database migration is permitted only during the subsequently authorized implementation verification, against isolated fixtures. Restart tests close/reopen handles/processes without deleting or migrating personal data.

## 3. Exact proposed file map

All paths below are relative to this repository. Production files are untouched at planning time.

**Add:**
- `packages/schemas/src/workspace.ts` — strict request/response contracts.
- `packages/schemas/src/workspace.test.ts` — schema validation, union/date/additional-field cases.
- `packages/database/src/candidate-workspace-repository.test.ts` — ensure/reopen/concurrency/restart tests.
- `apps/api/src/local-workspace.ts` — focused route registration and request/deployment guard functions.
- `apps/api/src/local-workspace.test.ts` — real SQLite API injection and adversarial guards.
- `apps/web/src/app/LocalWorkspaceGate.tsx` — local resolution/setup state machine and context boundary.
- `apps/web/src/app/LocalWorkspaceGate.test.tsx` — first-run/retry/reload/mismatch/StrictMode behavior.
- `apps/web/e2e/local-workspace.spec.ts` — actual API/SQLite browser journey.
- `apps/web/e2e/support/local-workspace-server.ts` — owned temporary fixture lifecycle and loopback API startup.
- `playwright.workspace.config.ts` — isolated API-backed browser configuration, matching only `local-workspace.spec.ts`.
- `apps/web/vite.workspace.config.ts` — reuse existing Vite plugins with `envDir: false`, separate `dist/workspace` output and explicit workspace preview configuration.
- `docs/product/project-status.md` — canonical approved roadmap/status; no stage marked complete prematurely.

**Modify:**
- `packages/schemas/src/index.ts` — export workspace contracts.
- `packages/database/src/repositories/candidate-repository.ts` — add ensureCandidate without changing createCandidate.
- `packages/database/src/postgres-contract.test.ts` — safe PostgreSQL ensureCandidate parity cases.
- `apps/api/src/app.ts` — register focused workspace routes.
- `apps/api/src/auth.ts` — exact local-route guard; no broad public-route exemption.
- `packages/api-client/src/client.ts`, `client.test.ts` — local methods, validation, errors, cancellation.
- `packages/config/src/server.ts`, `browser.ts`, `config.test.ts` — server-only default-off setup opt-in; development API ID optional; self-hosted/cloud requirements preserved.
- `apps/web/src/app/AuthenticatedApplication.tsx` — gate and stable repository construction.
- `apps/web/src/app/AuthProvider.tsx`, `AuthProvider.test.tsx` — local entry without fake identity; cloud regressions.
- `apps/web/src/app/PublicApplication.tsx`, `PublicApplication.test.tsx` — optional local-entry callback and truthful labels.
- `apps/web/src/data/apiProductRepository.ts`, `apiProductRepository.test.ts` — explicit candidate error wording and real-data invariants.
- `apps/web/src/app/AppShell.tsx`, `AppShell.test.tsx` — persistent source/mode labels.
- `apps/web/src/features/today/TodayPage.tsx`, `TodayPage.test.tsx` — honest empty personal state only.
- `apps/web/src/styles.css` — bounded styles for approved setup states; no unrelated stylesheet rewrite.
- `package.json` — add `test:e2e:workspace` script only; no dependency changes.
- `playwright.config.ts` — explicitly match existing `product.spec.ts`, excluding the new workspace suite from seed smoke runs.
- `tsconfig.json` — include both root Playwright configuration files.
- `apps/web/tsconfig.node.json` — include the additional Vite configuration so new harness/config files remain typechecked and lintable.
- `.github/workflows/ci.yml` — add isolated workspace E2E invocation; this existing filename was confirmed locally.
- `.env.example`, `docs/development/setup.md` — configuration, local trust model, first run, failures, data path.

Existing `ProductDataProvider.tsx`, `authContext.ts`, API/worker entry points, schema tables, migrations, and pnpm lockfile should remain unchanged. If implementation evidence requires expanding this list, explain the reason before substantial additional edits. Existing ordinary browser tests may receive narrowly justified local-entry expectation updates, not weakened assertions.

## 4. Ordered implementation checklist (not execution authorization)

### Task 0 — Restore a trustworthy verification baseline

Confirmed audit: Node v24.22.1 and pnpm 11.17.0 match requirements; formatting passed; lint/typechecks/evaluation timed out. Filesystem metadata showed 19,061 dependency files marked dataless. This is a historical count, not proof that all remain unavailable. In this planning pass, compiler/ESLint/Prettier entry files and the TypeScript main compiler library are resident. Direct `node node_modules/typescript/bin/tsc --version` and `pnpm exec tsc --version` both succeeded with 5.9.3. Direct domain noEmit compilation and direct ESLint version discovery each timed out after 20 seconds with no output. Thus pnpm resolution alone does not explain the blockage; dependency loading/file availability is still a hypothesis requiring targeted evidence. No files were restored or dependencies changed.

- [x] Record baseline Git status, runtime versions, existing process ownership, and failure command durations without reading .env values.
- [x] Compare bounded direct-node and pnpm compiler version/noEmit invocations; inspect filesystem flags for the specific stalled dependency paths. Do not conclude pnpm or TypeScript is defective from a timeout.
- [x] Distinguish file hydration, command resolution, test startup, and actual compiler/test diagnostics. Pulse's `docs/development/testing.md` records a similar dataless incident; it is supporting evidence, not a diagnosis of every Rolevia hang.
- [x] If files need downloading/restoring, report exact affected dependency paths and obtain authorization for that environment action. Do not delete node_modules/stores, reinstall, change lockfiles, or bulk-hydrate unrelated files.
- [x] After environment recovery, run existing checks once with bounded waits. Record exits, warnings, skips, and the initial defect baseline. This is a hard pre-code gate: do not begin Task 1 while relevant compiler/linter/test startup remains blocked. A version command or 20-second timeout is not a diagnostic conclusion; allow an explicitly bounded reasonable cold-start window and capture the specific blocking reads/imports without changing dependency content. Obtain focused setup/error UI review before the UI tasks; retain the approved broader prototype.

Acceptance: the intended toolchain starts reproducibly; relevant baseline failures are classified rather than hidden. No passing baseline may be inferred from a successful version command.

### Task 1 — Contracts and idempotent candidate persistence

- [x] Add schema tests asserting the two exact GET shapes; POST rejects candidateId/name and other keys; READY rejects missing identity or malformed dates.
- [x] Add repository tests: absent ID creates one row; repeat preserves timestamps; existing populated candidate unchanged; unrelated candidate untouched; close/reopen preserves ID; barrier-coordinated separate SQLite processes produce exactly one row and identical results. Inject failure after INSERT/before SELECT and prove replay recovers without changing timestamps; no transaction-level rollback claim is made.
- [x] Run new tests and confirm failure for the missing schema/method, not unavailable tooling.
- [x] Add workspace schemas/exports and ensureCandidate with primary-key conflict handling and a typed return projection. No schema migration.
- [x] Add parity cases to existing PostgreSQL contract suite with its disposable-database safety checks. Never use application DATABASE_URL as a test target.
- [ ] Run `pnpm --filter @oca/schemas test`, `pnpm --filter @oca/database test`, and their typechecks. PostgreSQL cases must execute in CI, not silently count as coverage when skipped locally.

Acceptance: exact contracts validate; repeat/concurrent/restart operations preserve one configured identity and existing data on both supported engines.

### Task 2 — Guarded local API and shared client

Interfaces: `registerLocalWorkspaceRoutes(app, config, database): void` registers the two routes; `guardLocalWorkspaceRequest(request, reply, config): Promise<void>` enforces configuration/socket/Host/Origin rules before DB access. Use FastifyInstance/FastifyRequest/FastifyReply, ApiConfig, and DatabaseHandle types. Auth registers this guard for the exact routes and returns without bypassing other routes. Client interfaces are fixed in section 2.

- [x] Add API tests for GET missing/ready without writes; POST create/replay; parallel requests; lost-response retry; zero side-effect rows in claims/users/grants/sessions/tasks; existing populated candidate retained.
- [x] Add config/deny tests for default-off/malformed opt-in; cloud (anonymous and authenticated, opt-in true); production; wildcard bind; non-loopback web origin; wrong/null/missing POST Origin; wrong GET Origin; arbitrary/malformed/duplicate Host/port; non-loopback raw socket; any Forwarded/Via/X-Forwarded-* header; and candidate identity supplied through body/query/path. Reject nonempty querystrings on these two routes before schema coercion. Verify IPv4/IPv6 parsing, direct loopback success, preflight with zero persistence, unsupported methods, and denied handler short-circuit. Assert denied requests never call candidate persistence. Include wrong-candidate ordinary API access with development config, since environment=test bypasses that existing boundary.
- [x] Add failure tests for inaccessible/unmigrated storage and malformed inputs: sanitized errors, no path/URL/token exposure, no SETUP_REQUIRED fallback.
- [x] Confirm red tests, then implement focused routes, auth integration, no-store headers, and client methods.
- [x] Add client tests for strict response validation, 400/403/404/503 mapping, AbortSignal, no candidate in URL/body, credential provider never invoked, caller/default Authorization discarded, forced omit/redirect:error, and default cloud transport unchanged. Add HEAD/OPTIONS behavior checks in API tests; test both cross-origin browser fetch and same-origin GET without Origin against the specified request rules.
- [x] Run `pnpm --filter @oca/api test`, `pnpm --filter @oca/api-client test`, and their typechecks; recheck cloud auth tests unchanged.

Acceptance: only approved local requests can initialize the server-selected candidate; cloud and ordinary candidate authorization remain intact.

### Task 3 — Browser identity resolution and first-run states

- [x] Review focused setup/empty/failure UI states in the approved prototype style before UI implementation.
- [x] Add config tests: development API without browser ID accepted; optional ID retained as assertion; self-hosted missing ID rejected as before; cloud seed and cloud configured candidate rejected as before.
- [x] Add gate/auth/client tests for first-run GET, explicit POST, pending double-click, retry after lost response, returning READY, mismatched hint, malformed response, stale demo session, deep link, unmount cancellation, and StrictMode. No mutations on mount.
- [x] Confirm red tests; implement LocalWorkspaceGate and local-entry callback. Use existing context with resolved ID and stable API repository; do not add identity persistence to localStorage or invent a credential.
- [x] Keep seed and cloud passthrough behavior; test cloud never calls local endpoints and local setup never calls cloud registration/login.
- [x] Run relevant web tests via `pnpm --filter @oca/web test -- src/app/LocalWorkspaceGate.test.tsx src/app/AuthProvider.test.tsx src/app/PublicApplication.test.tsx src/data/apiProductRepository.test.ts`; run config/client tests and typechecks.

Acceptance: server-resolved identity governs all local API product calls, no demo contamination or cross-identity repository reuse, and setup/error retry is accessible.

### Task 4 — Honest empty workspace and mode communication

- [x] Add shell/overview tests for demo versus personal labels, zero opportunities/applications, no synthetic priorities/activity, existing data retained, and API failure distinct from empty success.
- [x] Confirm red tests; implement only the labels and approved empty-state changes. Reuse existing components, routes, themes, and retry flow.
- [x] Verify functional Profile/Search Preferences links; do not add capture UI, deadline/follow-up behavior, or repair the unrelated no-op decision action in this stage.
- [x] Test 360px/768px/1440px presentation, keyboard access, focus, error announcements, and light/dark themes.
- [x] Run AppShell, TodayPage, ReadOnlySurfaces, and existing navigation/profile/search suites.

Acceptance: empty means real zero records; mode is obvious; no unavailable feature is presented as working.

### Task 5 — Real API/SQLite acceptance and handoff

- [x] Build an isolated browser harness: create a unique temporary directory/database, apply existing migrations there only, run a real loopback API with development identity and explicit setup opt-in, no external ATS/model requests, and a web build with API mode and no browser candidate ID. Start API via the fixture module calling createApiApp directly, not the dev/start scripts that load .env. Use a whitelisted child environment (runtime/PATH plus explicit test configuration; no inherited secrets, DATABASE_URL, NODE_OPTIONS, VITE_* or auth variables). Vite's existing envDir points at the repository root: build/preview with the new workspace config using envDir:false and explicit process values; merely setting a few environment variables is not sufficient isolation.
- [x] Use a separate config/script from seed smoke tests. Own the test ports/processes (`reuseExistingServer: false`), fail closed on existing ports or non-temporary database paths, and clean up only artifacts created by this run. Never load the personal .env or use the personal database.
- [x] Browser journeys use independent fresh fixtures: (a) empty DB → explicit setup → zero-state → reload → API restart → same ID/timestamps; (b) two tabs both observe SETUP_REQUIRED before a barrier releases simultaneous POSTs → one candidate; (c) pre-populated candidate reopens unchanged. Do not test concurrency only after setup is already complete. Cover the POST JSON CORS preflight and verify no unexpected browser/API errors. Serialize within a shared fixture or allocate one fixture per browser worker; restart tests must not disrupt another test.
- [x] Verify worker handle uses the same resolved test database and can read the candidate. No worker task or scan is required; do not report worker health based only on the API badge.
- [x] Exercise unavailable API, failed storage, setup-disabled mode, mismatched identity, and retry. Add cloud regression through existing isolated auth fixtures.
- [x] Add `test:e2e:workspace`: the owned fixture/build orchestrator builds packages/web with the isolated environment and alternate Vite config, then runs `playwright test --config playwright.workspace.config.ts`. Workspace output lives under ignored dist/workspace, separate from the seed output. Ordinary Playwright matches only product.spec.ts; workspace config matches only local-workspace.spec.ts. Typecheck both configs. CI runs seed E2E first, workspace acceptance second; no .env editing/restoration or personal build reuse is permitted.
- [x] Update setup guide, template comments, and canonical project status with evidence, remaining blockers, and the next approved stage. Do not mark later stages complete or claim the entire tracker is usable.
- [ ] Run the full release checks below. Review final diff for scope, personal data, accidental artifacts, or dependency/migration changes.

Acceptance: all relevant checks pass, restart/concurrency/browser evidence is recorded, no personal records are touched, and no stage beyond R-01.1 is implemented.

## 5. Regression and completion gate

Existing tests that must remain passing:
- Database: `persistence.test.ts`, `career-memory-repository.test.ts`, `career-profile-lifecycle-migration.test.ts`, `application-repository.test.ts`, `application-migration.test.ts`, `search-target-repository.test.ts`, `today-repository.test.ts`, `cloud-auth-migration.test.ts`, canonical identity/requirements/evaluator tests, and both PostgreSQL contract/deep-verification suites.
- API: `app.test.ts`, `auth-security.test.ts`, `public-auth.test.ts`, `rate-limit.test.ts`.
- Web: existing AuthProvider/PublicApplication/AppShell/TodayPage tests; ProfilePage/SearchPage/ApplicationsPage tests; opportunity list/detail/API integration, Matches, CareerSignals, AgentActivity, ReadOnlySurfaces, and ThemeProvider tests.
- Shared packages: config, API client, schemas, domain, source adapters, intelligence/evaluation tests.
- Worker: ingestion, discovery/invariants, requirements, eligibility-related behavior, fit, quality, decision, fingerprints, and worker lifecycle tests.
- Browser: existing `apps/web/e2e/product.spec.ts` desktop/mobile journeys, public/account flows, route aliases, profile evidence lifecycle, and multi-source preference editing.

Run after authorization in an isolated verification environment:

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm requirements:evaluate
pnpm requirements:evaluate:assisted
pnpm build
pnpm test:e2e
pnpm test:e2e:workspace
git diff --check
git status --short
```

Report warnings/skips explicitly. Root typecheck can write ignored tsbuildinfo; builds/tests can write artifacts and temporary databases. They are execution-phase checks, not read-only planning commands. Real PostgreSQL testing requires the existing safely configured disposable database; no production URL, new service installation, or migration execution is authorized by this plan alone.

Final acceptance mapping: fresh no-manual-SQL setup (Tasks 1–3, 5); clear demo/personal modes (Tasks 3–4); exactly one persistent candidate (Tasks 1–2, 5); restart identity (Tasks 1, 5); honest zero data (Task 4); recoverable errors (Tasks 2–4); server isolation and no cloud bypass (Task 2); existing behavior retained (regression gate); actual API/SQLite browser evidence (Task 5).

## 6. Authorization boundary

Plan review is the next action. No implementation, dependency repair/download, migration, commit, or push is authorized by preparing this document. If approved for execution later, implement task-by-task and report any newly discovered scope or safety conflict before expanding work. Git staging/commits/pushes remain the user's responsibility.


## 7. Final pre-implementation design review

**Decision:** Retain separate read-only status GET and explicit idempotent initialization POST, existing candidate schema, and server-selected identity. No migration or opportunity-capture work is justified.

**Required corrections incorporated:** default-off direct-local opt-in and honest proxy limitations; single-statement mutation/replay semantics; real cross-process contention; strict identity/query/body and short-circuit checks; explicit credential-free shared-client transport; no demo owner leakage; isolated test discovery/build/environment and independent fresh concurrency fixtures; typecheck coverage for new configs. The checklist retains 36 steps, with corrected assertions and sequencing.

**Verdict:** Design is suitable for authorization review, but implementation is NOT ready to start: compiler/linter/test-startup blockage is unresolved and Task 0 is a hard gate. Focused first-run/error UI review is also required before those UI changes. These gates do not invalidate the already-approved Tracker V1 prototype or roadmap. No fresh runtime success is claimed by this design review.

## 8. Blocker preparation evidence — November 3, 2026

See `docs/audits/2026-11-03-r-01-1-preimplementation-blockers.md` for bounded diagnostic results, reproduction commands, isolation requirements, and proposed remediation scope. Targeted dependency reads demonstrated dataless-to-resident changes with approximately 1.5–1.8-second latency for small files; uninstrumented compilation and ESLint startup still timed out after 45 seconds. TypeScript showConfig passed in 0.18 seconds. File-residency latency is a demonstrated contributor, not proof that every remaining check is healthy. Task 0 remains incomplete. No deliberate dependency hydration/reinstall is authorized.

Focused clickable review source: `/Users/mavery/.codex/visualizations/2026/11/03/01a1a252-63f0-77d0-a3ea-20ec7c1428f7/rolevia-workspace-review.html`. It covers setup, success, returning/empty workspaces, demo-to-personal relaunch guidance, unavailable API, failed initialization/retry, disabled setup, and forbidden requests. It supplements the earlier approved prototype without adding a production runtime mode switch. Interaction-logic checks passed offline; real browser layout/accessibility validation is not claimed. User approval of these focused states is pending.

The 36 implementation steps and seven-stage roadmap remain unchanged. Preparation is not implementation authorization.


## Authorized implementation record — November 4, 2026

The user explicitly approved the validated focused prototype and authorized
R-01.1 production implementation. The earlier preparation-only notices above
are historical. The approved prototype and seven-stage roadmap remain unchanged.

Implementation and scope-specific SQLite/API/web acceptance are recorded in
`docs/implementation/r-01-1-progress.md` and
`docs/implementation/r-01-1-report.md`. The full release gate is not claimed
clean: one worker freshness test also fails on untouched baseline source, and
real PostgreSQL cases await the existing disposable CI service. No personal
environment/database was used. No R-01.2 work, dependencies, migrations, staging,
commits, or pushes are included.

Checklist status: 34 steps verified; steps 11 and 36 remain open as complete
release gates because real PostgreSQL cases have not run locally and the full
suite contains the independently reproduced baseline worker freshness failure.
The full check commands were run and their failures/skips recorded; unchecked
steps must not be interpreted as missing local workspace production code.
