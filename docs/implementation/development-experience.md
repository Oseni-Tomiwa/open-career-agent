# Development experience

## Target contributor journey

The next implementation should make the common local path conceptually:

```text
clone repository
select the pinned Node.js and pnpm versions
copy documented environment placeholders
install locked dependencies
initialize/migrate and seed local SQLite
run one development command
```

That command should supervise the Vite web application, Fastify API, and worker with readable process prefixes and coordinated shutdown. It should require no PostgreSQL, Redis, hosted control plane, container runtime, AI account, or telemetry service. Containers may be offered later, but they are not the only contributor path.

No commands or package files described here are implemented by this documentation task.

## Local defaults

- Pin Node.js 24 LTS and the pnpm major/version in repository metadata.
- Use one lockfile and pnpm's `workspace:` protocol.
- Store the development SQLite database and generated runtime files in an explicit ignored data directory, never mixed with migrations or seed definitions.
- Default to a single worker and conservative concurrency.
- Make AI optional. When no provider is configured, deterministic discovery, normalization, Eligibility rules, application state, and explanations remain usable; model-assisted areas display an honest unavailable/partial state.
- Make external sources individually configurable and supply fixture-backed development adapters/modes where network-free UI work is valuable. Never make fixtures masquerade as a successful live scan.
- Do not send telemetry by default.

The API should expose useful local health/readiness information for itself, database access, worker freshness, and queued/failing work without exposing Candidate content or secrets.

## Environment configuration

Each process validates its environment at startup and reports missing/invalid variable names with remediation. Secrets are never printed. Keep a reviewed `.env.example` with placeholders and comments, and distinguish:

- public web build configuration, which is safe to expose;
- API-only settings and credentials;
- worker/source/provider settings and credentials;
- shared non-secret storage and logging settings.

Avoid a catch-all configuration object passed through every module. Composition roots translate validated configuration into narrow capabilities. Test configuration uses explicit fixtures rather than inheriting a contributor's real credentials.

## Development orchestration

Use root pnpm scripts and workspace filters for the first scaffold. A development script may run web, API, and worker concurrently, while filtered scripts allow one process or package to be run independently. Build/test scripts should use declared dependency order where required.

Do not add Turborepo or Nx preemptively. Capture baseline cold/warm build, type-check, and test times as the project grows. Add a task orchestrator only when measured latency, affected execution, or caching value justifies the configuration and CI complexity.

Process supervision should provide:

- stable, distinguishable log prefixes;
- clean signal handling and worker lease behavior;
- fast web/API reloads without repeatedly destroying canonical local data;
- an explicit reset/reseed operation rather than implicit destructive startup;
- clear port-conflict and database-lock diagnostics;
- deterministic process exit when startup validation fails.

## Fictional seed data

Seed data is a development product fixture, not a dummy interface. It should be deterministic, versioned, fictional, safe to publish, and inserted through maintained persistence/application boundaries. Re-running the seed should be idempotent or require an explicit reset command with clear destructive scope.

The baseline dataset should exercise the real interface and real API with:

- a complete but fictional Candidate profile, Preferences, Claims, and Evidence;
- Greenhouse-, Ashby-, and Lever-shaped source examples;
- duplicate, possible-repost, stale, and partially normalized Opportunities;
- every Eligibility state and representative blockers/unknowns/conflicts;
- independent Fit and Quality combinations rather than one synthetic score;
- provenance, source retrievals, multiple OpportunitySnapshots, Evaluations, and Decisions;
- saved, shortlisted, investigating, dismissed, and application states;
- ApplicationEvents across a realistic pipeline;
- valid logos, absent logos, and broken-logo fallback cases;
- loading/empty/error demonstrations supplied through test fixtures or deliberate development controls, not by corrupting canonical seed state.

Names, organizations, descriptions, credentials, and Evidence must not identify real people or reproduce non-permitted source content. Seed IDs and timestamps should be stable enough for browser tests while still letting the UI show relative-time edge cases through a controllable clock or seed epoch.

## Fast feedback loops

- Domain/intelligence work should run pure Vitest scenarios without starting any process.
- Adapter work should run against small local fixtures/fake servers by default.
- Database tests create disposable SQLite databases separate from a contributor's development data.
- API tests use Fastify injection for speed.
- UI components run in a focused component test environment, while the real full stack supports Playwright workflows.
- Generated OpenAPI/clients and future migrations have deterministic check commands so drift is found before review.

Watch mode should target affected packages through workspace filters. Avoid a root watch process that needlessly rebuilds every package on every edit.

## Operational clarity for self-hosting

The future packaged experience should document durable data location, consistent backup/restore, upgrades/migrations, log location/redaction, ports, outbound connectivity, and how to disable/configure optional provider calls. Ephemeral storage must produce a startup warning or be rejected for canonical use where it can be detected.

Local convenience cannot silently weaken network safety. Development may bind to loopback by default. Public exposure, TLS, authentication, reverse proxy, CSP, and backup encryption need explicit production guidance before a self-hosted instance is described as internet-ready.

Human-readable export/import is a supported portability and inspection path, not a live editing directory and not a second source of truth. Imports are versioned, validated, previewable where destructive/ambiguous, and applied through domain/application rules.

## Contributor documentation for the scaffold task

When implementation begins, add a concise root quick start and package-level notes only where behavior cannot be understood from scripts and exports. The scaffold is complete from a developer-experience perspective when a new contributor can:

1. identify and install the pinned prerequisites;
2. start all three process roles with one command;
3. see the production-intent shell populated by fictional data;
4. run the documented quality suite;
5. find SQLite data, reset/reseed it deliberately, and perform a tested backup/restore;
6. work without provider/source credentials and understand which results are partial;
7. diagnose validation, port, worker, and database errors without reading framework internals.

## Supply-chain and privacy defaults

- Prefer maintained, focused dependencies and keep the lockfile committed.
- Record why high-privilege build scripts or native dependencies are necessary.
- Use automated update PRs and dependency review without auto-merging risky major changes.
- Keep real source payloads, Candidate information, environment files, databases, logs, exports, and screenshots out of version control.
- Provide sanitization guidance for bug reports and fixtures.
- Keep optional analytics and crash reporting disabled unless a later explicit policy and consent model approves them.

## Revisit conditions

Revisit the no-infrastructure local baseline only when a committed capability cannot be represented safely with local SQLite and process roles, or when ADR-001 conditions trigger a persistence evaluation. Revisit workspace orchestration when measured feedback times are materially harming development or CI. Revisit containers as a default only when they simplify the supported installation matrix without making ordinary local contribution slower or opaque.

## Primary references

- [pnpm workspaces](https://pnpm.io/workspaces)
- [pnpm recursive commands](https://pnpm.io/cli/recursive)
- [Node.js 24 LTS migration guide and support window](https://nodejs.org/en/blog/migrations/v22-to-v24)
