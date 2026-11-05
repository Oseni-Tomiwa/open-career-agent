# Development setup

## Prerequisites

- Node.js 24 LTS (the repository includes `.nvmrc`)
- pnpm 11.17.0 through Corepack or an equivalent pinned installation

Docker, PostgreSQL, Redis, an AI-provider account, and external source credentials are not required.

## First run

```bash
corepack enable
corepack prepare pnpm@11.17.0 --activate
cp .env.example .env
pnpm install --frozen-lockfile
pnpm dev
```

The root development command builds and watches the shared packages, then starts:

- the Vite web process at `http://localhost:5173`;
- the Fastify API at `http://127.0.0.1:3000`; and
- the background worker using the same canonical SQLite database.

The web app defaults to its deterministic fictional seed repository. Its
primary product surfaces can instead consume the local API by setting the
browser-safe variables below. The API repository validates shared TypeBox
response contracts and maps them into the UI view model; React components do
not calculate Eligibility, Fit, Quality, or Decision.

```dotenv
VITE_PRODUCT_DATA_SOURCE=api
VITE_API_BASE_URL=http://localhost:3000
VITE_DEPLOYMENT_MODE=development
# Leave the browser candidate ID unset for server identity resolution.
VITE_DEVELOPMENT_CANDIDATE_ID=
TRUSTED_CANDIDATE_ID=personal-candidate
LOCAL_WORKSPACE_SETUP_ENABLED=true
APP_ENV=development
IDENTITY_MODE=development
API_HOST=127.0.0.1
WEB_ORIGIN=http://localhost:5173
```

`VITE_PRODUCT_DATA_SOURCE=seed` remains the default and does not require a
candidate ID. Restart Vite after changing these variables.

## Real workspace setup (R-01.1)

Use a direct local development launch with the settings above. Open `/sign-in`
and choose **Open personal workspace**, or go directly to `/overview`. Rolevia
reads workspace status first. If no candidate exists, choose **Create my
workspace**, then **Open my workspace**. Startup applies the existing migrations
in local `auto` mode; no manual SQL or candidate seed is needed. R-01.1 adds no
migrations. Do not point test commands at your personal database.

The server alone selects `TRUSTED_CANDIDATE_ID`. Repeated setup and concurrent
requests preserve the existing row and its timestamps. Returning users reopen
that identity after browser or API restarts. An optional browser candidate ID
is a compatibility assertion: a mismatch blocks entry. It cannot select a
candidate. A stale demo session is ignored in development API mode.

For a fresh personal workspace, choose a new explicit candidate ID. An existing
candidate is reopened unchanged; setup cannot establish the provenance of its
existing records or turn sample data into verified personal data. Nothing is
cleared or imported.

The newly initialized empty workspace has zero opportunities/applications and links to the
existing Career Profile and Search Preferences surfaces. Manual opportunity
capture remains R-01.2 and is not included here. This is workspace setup, not
completion of the personal opportunity tracker.

Setup defaults off and is available only with explicit opt-in, development
server environment, trusted local identity mode, exact loopback bind/origin,
raw loopback socket, valid loopback Host/port, and no forwarding headers. POST
requires the configured Origin and an empty JSON object. Cloud/production
requests receive 404 even with opt-in. The existing cloud session and candidate
ownership rules remain in force. Self-hosted browser mode retains its separate
fixed-ID configuration requirement; development API mode uses the new gate.

Do not publish, tunnel, or proxy this local setup listener. A trusted local
proxy that strips all forwarding headers is indistinguishable from a direct
loopback client; the guard is not a general remote-access authentication system.
The local API status badge reports API/database readiness, not worker health.

Demo records are fictional and temporary. Demo-to-personal use requires a
separate configured relaunch of the browser/API; there is no runtime mode
switch or demo import. API failures, disabled/unauthorized setup, incompatible
responses, and initialization failures remain visible. Personal mode never
falls back to seed records. A failed setup response may follow a committed
insert; retry is safe.

## Service endpoints

- `GET /local-workspace` — guarded read-only SETUP_REQUIRED/READY status
- `POST /local-workspace` — guarded, idempotent server-selected candidate initialization
- `GET /health` — API process liveness only
- `GET /ready` — API readiness, including SQLite access
- `GET /openapi.json` — OpenAPI generated from registered TypeBox route schemas
- `GET /opportunities?candidateId=...` — lightweight candidate-scoped list projection
- `GET /opportunities/:id?candidateId=...` — snapshot history and coherent Evaluation projection
- `GET /candidates/:candidateId/today` — candidate overview and persisted activity projection
- `GET /candidates/:candidateId/career-signals` — candidate-scoped career insights
- `/candidates/:candidateId/claims` — Career Profile claim and evidence operations
- `/candidates/:candidateId/search-targets` — Search Preference and discovery operations
- `/candidates/:candidateId/applications` — application tracking and event history

Responses do not expose the configured database path or secrets.

## Common commands

```bash
pnpm dev
pnpm dev:web
pnpm dev:api
pnpm dev:worker
pnpm db:migrate
pnpm build
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm test:e2e
```

The single-process development commands build shared packages first. The full `pnpm dev` command also watches shared packages without requiring a task orchestrator.

## Local data and migrations

SQLite is canonical v0.1 state. By default the database is stored at `data/open-career-agent.sqlite`, relative to the repository root. The `data/` directory and SQLite sidecar files are ignored by Git.

Migrations live in `packages/database/migrations`. Local modes apply them at
process startup by default; Cloud mode defaults to an explicit
`pnpm db:migrate` release step. Generate a reviewed migration after changing the
Drizzle schema with `pnpm db:generate`. Do not edit a migration that has shipped.

The browser seed repository contains fictional publishable development data.
In API mode, product data is loaded from candidate-scoped API contracts without
falling back to seed records when a response is empty or unavailable.

## Environment boundaries

The committed `.env.example` contains only non-secret local defaults. API and worker configuration is validated at startup. Only variables prefixed with `VITE_` are visible to the browser; never place a secret in one of those variables.

The first scaffold uses Drizzle 1.0 RC because the official `node:sqlite` driver is currently available on that release line rather than stable Drizzle 0.45. The dependency is exactly locked and should be upgraded to stable Drizzle 1.0 once released and verified by the database/ledger suite.

## Validation

Before opening a pull request, run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm test:e2e` after installing Playwright's Chromium binary with `pnpm exec playwright install chromium`.

CI performs these checks on Node 24 and installs Chromium for the bootstrap browser smoke test. No deployment is configured.

## Cloud identity

Set `IDENTITY_MODE=cloud`, `APP_ENV=production`, `MIGRATION_MODE=manual`, and a
production `WEB_ORIGIN` on the API. Set `VITE_DEPLOYMENT_MODE=cloud` and omit
`VITE_DEVELOPMENT_CANDIDATE_ID` from the web build. Cloud mode provides the
minimal sign-in/session shell; it is a foundation and is not public-launch
ready. See [Cloud V1 foundation](../architecture/cloud-foundation-v1.md).

## Isolated workspace acceptance

`node scripts/test-workspace.mjs` (also `pnpm test:e2e:workspace`) requires Node
24 and the already installed Chromium binary. It builds shared packages with
the existing compiler, builds an API-mode web bundle with `envDir:false`, and
runs the separate workspace Playwright configuration at 1440/768/360 pixels.
Every test owns its temporary SQLite directory and a real API process; no
`.env` file, application DATABASE_URL, personal database, ATS or model service
is used. Ports 4310/4311 must be free; existing servers are never reused.
Output is under ignored `apps/web/dist/workspace` and `test-results/workspace`.
The independent worker-style database handle check reads only the fixture.

The ordinary seed suite matches only `product.spec.ts`; the workspace suite
matches only `local-workspace.spec.ts`. CI executes both. PostgreSQL parity
uses only the existing local disposable `TEST_POSTGRES_URL` guard and remains
separate from these SQLite/browser fixtures.

pnpm 11 may automatically install when its dependency metadata is out of sync.
For verification that must not install, use direct existing binaries or an
invocation-scoped `pnpm_config_verify_deps_before_run=false`; never accept an
automatic reinstall as an incidental test step. Do not change personal pnpm
configuration to bypass this safeguard.
