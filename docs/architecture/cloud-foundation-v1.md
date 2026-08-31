# Rolevia Cloud V1 Foundation

## Purpose and readiness statement

This foundation makes candidate ownership explicit and enforceable when the API
runs as a hosted multi-user service. It preserves local development,
self-hosting, the existing product routes, SQLite tests, and the deterministic
domain/intelligence packages.

This is **Cloud foundation ready**, not **public SaaS ready**. Deployment,
production database selection, abuse controls, operational monitoring, backups,
email verification, password reset, privacy/legal workflows, and production
support are still launch blockers.

## Identity and authorization

`User` is the authentication account. `Candidate` remains the career-domain
subject. They are linked through `user_candidates`; Cloud V1 creates one primary
Candidate for each new User, while the join model permits more Candidates per
User later without introducing organizations or teams.

Registration inserts the User, Candidate, ownership grant, and initial persisted
session in one database transaction. Database uniqueness enforces normalized
email identity, unique User/Candidate grants, unique session digests, and at
most one primary Candidate per User; a failed step rolls the whole account back.

The server boundary is:

```text
opaque credential -> persisted session -> AuthenticatedPrincipal(userId)
                  -> user_candidates grant -> authorized Candidate
```

Domain repositories do not know about cookies, bearer tokens, or auth vendors.
Existing `/candidates/:candidateId/...` and candidate-aware `/opportunities`
routes remain stable. In Cloud mode a centralized Fastify pre-handler requires a
valid principal and rejects an unowned `candidateId` with `403` before the route
handler runs. Merely changing the path or query parameter never changes the
grant.

Canonical Opportunities, snapshots, SourceListings, and source observations may
be shared. Career Memory, SearchTargets, DiscoveryRuns/Matches, Evaluations,
Decisions, Applications/ApplicationEvents, Today, and Career Signals remain
candidate-private. Candidate-aware Opportunity projections therefore receive
the same ownership check as candidate-path routes and cannot disclose another
User's intelligence.

## Authentication and session model

Cloud V1 uses one first-party email/password system and revocable opaque
sessions:

- email is Unicode-normalized, trimmed, lowercased for deterministic uniqueness,
  and retained separately for display; provider-specific rewriting (for example,
  Gmail dot or plus handling) is deliberately not performed;
- passwords require at least 12 characters and are stored as salted Node.js
  `scrypt` hashes with explicit versioned parameters (`N=16384`, `r=8`, `p=1`,
  64-byte output, 16-byte random salt); malformed or unknown encodings fail
  authentication without allowing attacker-controlled cost parameters;
- a session token has 256 bits of randomness; only its SHA-256 digest is stored;
- sessions have explicit configured expiration, live in the database rather
  than API memory, and are invalidated on logout;
- registration and login always mint a fresh session rather than accepting or
  upgrading a supplied cookie, and an explicit bearer token takes precedence if
  a request supplies both bearer and cookie credentials;
- login failures use one generic response for missing accounts and wrong
  passwords.

Browser clients receive the opaque token only as an `HttpOnly`, `SameSite=Lax`
cookie (`Secure` in production). Credentialed CORS is restricted to the one
configured `WEB_ORIGIN`; wildcard origins are not used. Cookie-authenticated
mutations require an exact matching `Origin`, providing the CSRF boundary in
addition to SameSite. Native clients may request the same session as a bearer
token and must keep it in platform secure storage (Keychain/Keystore), never an
ordinary preference store. Bearer requests do not use cookie CSRF semantics.

The shared `@oca/api-client` accepts an asynchronous credential provider. It can
select cookie-aware fetch or inject an Authorization header without importing
React, browser storage, or an auth vendor. Existing AbortSignal, network error,
401/403, 409 conflict, and response-validation behavior remains intact.

## Deployment modes and identity precedence

| Mode | Candidate resolution | Intended exposure |
|---|---|---|
| `development` | Server `TRUSTED_CANDIDATE_ID`; web `VITE_DEVELOPMENT_CANDIDATE_ID` in API mode | Developer machine only |
| `self-hosted` | Trusted configured single-user Candidate | Private/local network only in V1 |
| `cloud` | Authenticated User followed by a persisted ownership grant | Hosted service foundation |

`VITE_DEVELOPMENT_CANDIDATE_ID` is rejected in Cloud mode and cannot override a
session. Seed mode remains authentication-free and deterministic. An
auth-disabled self-hosted API is unsafe if exposed to the public internet;
optional authenticated self-hosting is deferred.

Production configuration fails closed: `IDENTITY_MODE` must be explicit,
`development` identity is rejected, and a production trusted self-hosted mode
requires an explicit trusted Candidate. A legacy database is not silently
assigned to the first registering User. Existing Candidates and history remain
unowned until a deliberate, separately reviewed onboarding/claim migration is
performed.

## HTTP authorization inventory

The authorization pre-handler is registered before all auth and product routes.
Only this exact allowlist is unauthenticated: `GET /health`, `GET /ready`,
`GET /openapi.json`, `POST /auth/register`, and `POST /auth/login`.

| Boundary | Routes |
|---|---|
| Authenticated account | `GET /auth/session`; `POST /auth/logout` |
| Candidate-owned Career Memory | `GET /candidates/:candidateId/profile`; `POST /candidates/:candidateId/claims`; `PATCH /candidates/:candidateId/claims/:claimId`; `POST /candidates/:candidateId/claims/:claimId/evidence` |
| Candidate-owned discovery | `GET, POST /candidates/:candidateId/search-targets`; `GET, PATCH, DELETE /candidates/:candidateId/search-targets/:targetId`; `POST /candidates/:candidateId/search-targets/:targetId/run`; `GET /candidates/:candidateId/discovery-runs` |
| Candidate-owned intelligence | `GET /candidates/:candidateId/today`; `GET /candidates/:candidateId/career-signals` |
| Candidate-owned applications | `GET, POST /candidates/:candidateId/applications`; `GET, PATCH /candidates/:candidateId/applications/:applicationId`; `GET, POST /candidates/:candidateId/applications/:applicationId/events` |
| Shared canonical Opportunity | `GET /opportunities`; `GET /opportunities/:id` without `candidateId` |
| Candidate-owned Opportunity projection | The same Opportunity reads with `?candidateId=...`; the query Candidate must be owned before private Eligibility, Fit, Quality, Decision, Evidence, or Discovery context is loaded |

There are no public worker-control routes or internal support/admin routes in
V1. Trusted development/self-hosted mode applies only to the same product route
surface; it does not create a hidden bypass route.

## Configuration and secrets

Browser-public configuration is limited to `VITE_API_BASE_URL`,
`VITE_PRODUCT_DATA_SOURCE`, `VITE_DEPLOYMENT_MODE`, and the development-only
Candidate ID. Vite variables are never secrets.

API/server configuration contains the database location, identity and migration
modes, trusted local Candidate, web origin, session lifetime, and future secret
material. Worker configuration contains database/task runtime values and source
credentials. The current opaque-session design needs no shared signing secret;
random password salts and session tokens are generated per record. Production
secret storage remains a platform responsibility. The API logger explicitly
redacts authorization/cookie headers, request passwords, response `Set-Cookie`,
and password/session hash fields. Passwords and raw session tokens must not
appear in logs; request IDs and bounded entity IDs are allowed.

## Hosted topology and worker boundary

```text
Web / future native client -> API service -> database + task ledger
                                      Worker -> database + task ledger
```

Workers are trusted backend runtimes, not Users. They claim durable tasks
directly and run discovery, Eligibility, Fit, Quality, and Decision independently
of a browser session. No public route executes arbitrary ledger tasks.

The SQLite ledger supports one or a small number of local workers through an
atomic conditional claim, lease owner/expiry, expired-lease recovery, bounded
attempts with retry delay, durable events, and unique idempotency keys. SQLite's
single-writer locking and local-file topology make materially concurrent or
remote workers an operational migration trigger. Move the ledger to PostgreSQL
with the Cloud database, or to an external queue only when throughput,
distribution, scheduling, or operational requirements justify it.

## SQLite and PostgreSQL readiness audit

SQLite remains canonical for development and self-hosted V1. PostgreSQL is not
an inevitable successor; persistence is reconsidered only when measured
requirements justify migration.

| Area | Classification | Required work for PostgreSQL |
|---|---|---|
| Repository/domain boundary | Portable | Keep domain and intelligence code unchanged; provide a PostgreSQL repository implementation. |
| Text IDs, foreign keys, indexes, unique/check constraints | Portable with DDL translation | Re-express in PostgreSQL Drizzle schema and verify equivalent constraints. |
| Millisecond integer timestamps | Migration adaptation | Convert deliberately to `timestamptz` or preserve integer semantics with tested transforms. |
| JSON serialized into text | Migration adaptation | Retain text for exact behavior or migrate selected columns to `jsonb` with validation. |
| `ON CONFLICT` idempotency and optimistic updates | Portable with concurrency tests | Validate PostgreSQL conflict targets, returned rows, and isolation behavior. |
| Drizzle transactions | Portable with semantic tests | Re-run lease, stale-write, and workflow atomicity tests at the chosen isolation level. |
| `node:sqlite`, `DatabaseSync`, PRAGMAs | Engine-specific adaptation | Add a PostgreSQL client/handle; do not leak it beyond `@oca/database`. |
| SQLite migration snapshots/generator | Engine-specific adaptation | Maintain reviewed PostgreSQL migrations, likely with an engine-specific schema file. |
| Task claim subquery and single-writer behavior | Migration adaptation | Prefer `FOR UPDATE SKIP LOCKED` or equivalent and stress-test multiple workers. |
| Local database file sharing | Real Cloud scaling blocker | A SQLite file cannot safely serve horizontally distributed API/worker hosts. |

No current domain-model blocker requires immediate PostgreSQL migration. A
staged path is:

1. Keep SQLite for development, tests, and self-hosted use.
2. Add engine-specific PostgreSQL schema/migrations and repository wiring when a
   Cloud trigger is met; run identical contract and migration-preservation tests.
3. Operate Cloud on PostgreSQL while allowing self-hosted installations to keep
   SQLite. Avoid a fake lowest-common-denominator database abstraction.

Revisit Cloud persistence when observed or committed requirements include any
of the following:

- hosted multi-user traffic creates meaningful simultaneous writes;
- API instances or workers are horizontally scaled, or multiple workers cause
  measurable claim/lock contention;
- API and workers need a remote/shared database rather than one local volume;
- database size, write latency, lock timeouts, maintenance windows, or recovery
  time move beyond comfortable SQLite operation;
- high availability, managed backups/PITR, replicas, richer operational
  observability, connection management, or other PostgreSQL-class capabilities
  become service requirements.

These are evidence-based revisit conditions, not a predetermined migration.

## Operations boundaries

`GET /health` reports process liveness. `GET /ready` verifies database access
and the required migrated tables without exposing paths or internals. Local
modes default to automatic migrations for convenience. Cloud defaults to
`MIGRATION_MODE=manual`; a controlled release step must run `pnpm db:migrate`
before API or worker rollout so replicas do not race to migrate.

Cloud backups are infrastructure responsibility. Self-hosted SQLite operators
must back up the main `.sqlite` database and, if copying a live database rather
than using SQLite's backup mechanism, its active `-wal` and `-shm` sidecars as a
consistent set.

Account deletion is deferred. A future privacy design must distinguish private
Career Memory, Applications, Decisions/history, and Evidence from shared
canonical Opportunity provenance. It must not casually cascade-delete immutable
history or shared records.

## Public-launch blockers

Before public Internet launch, Rolevia still needs a production database choice
validated under expected concurrency, distributed rate limiting for login,
registration, discovery triggers and mutations, structured security monitoring,
managed backups/recovery drills, deployment and secret management, email
verification, password reset/recovery, abuse controls, privacy/legal workflows,
and operational ownership. The current in-process/API design deliberately does
not claim those capabilities.
