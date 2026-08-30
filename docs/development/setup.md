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
pnpm db:migrate
pnpm dev
```

The root development command builds and watches the shared packages, then starts:

- the Vite web process at `http://localhost:5173`;
- the Fastify API at `http://127.0.0.1:3000`; and
- the background worker using the same canonical SQLite database.

The web app defaults to its deterministic fictional seed repository. The
Opportunities list and detail routes can instead consume the local API by
setting the browser-safe variables below. The API repository validates shared
TypeBox response contracts and maps them into the UI view model; React
components do not calculate Eligibility, Fit, Quality, or Decision.

```dotenv
VITE_PRODUCT_DATA_SOURCE=api
VITE_API_BASE_URL=http://localhost:3000
VITE_DEVELOPMENT_CANDIDATE_ID=<fictional-candidate-id-in-your-local-database>
```

`VITE_PRODUCT_DATA_SOURCE=seed` remains the default and does not require a
candidate ID. Restart Vite after changing these variables.

## Service endpoints

- `GET /health` — API process liveness only
- `GET /ready` — API readiness, including SQLite access
- `GET /openapi.json` — OpenAPI generated from registered TypeBox route schemas
- `GET /opportunities?candidateId=...` — lightweight candidate-scoped list projection
- `GET /opportunities/:id?candidateId=...` — snapshot history and coherent Evaluation projection

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

Migrations live in `packages/database/migrations` and are applied by both process startup and `pnpm db:migrate`. Generate a reviewed migration after changing the Drizzle schema with `pnpm db:generate`. Do not edit a migration that has shipped.

The browser seed repository contains fictional publishable development data.
In API mode, only Opportunities list/detail are real-backed in Phase 1. Today
shows an explicit unavailable state; Applications, Career Profile, and Search
remain development-only and are not API migrations.

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

## Deferred web integration

- Today aggregation
- Applications persistence/workflows
- Candidate Career Memory and Search configuration
- Authentication, deployment, and generated API clients
