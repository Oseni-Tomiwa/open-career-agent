# Backend, persistence, jobs, and provider strategy

## Runtime shape

Use Node.js 24 LTS and TypeScript for both server processes:

1. an independent Fastify API application for interactive and programmatic requests; and
2. a framework-light worker application that composes the same core use cases with source, persistence, and provider adapters.

The browser is built separately with Vite. The API may serve its static output in a packaged local deployment, but it is not implemented as frontend-framework route handlers. API and worker ship at the same version as one modular-monolith deployment unit and coordinate through SQLite domain state and the durable job ledger, not an internal HTTP service.

## Fastify decision

Fastify is selected because its plugin encapsulation maps well to modular composition, its JSON Schema request/response pipeline supports runtime validation and serialization, its Type Providers connect TypeBox schemas to TypeScript, and its in-process injection supports focused integration tests. It supplies HTTP mechanics without requiring domain code to adopt decorators, dependency-injection containers, or framework base classes.

### Alternatives

- **Hono** has a small, web-standard API and unusually broad runtime portability. That portability is not a v0.1 requirement, while this project benefits more from Fastify's established Node plugin, schema, logging, and server-testing model.
- **NestJS** supplies strong conventions and a comprehensive DI/module model, but decorators, metadata, and framework-managed providers would add abstraction to a small modular monolith whose boundaries are already explicit.
- **Frontend-framework handlers** would optimize co-location for the web client while weakening the independent application/API boundary needed by future CLI, MCP, integrations, and third-party clients.

Routes should be thin adapters: authenticate/authorize when applicable, validate a transport contract, invoke one application command/query, and map the result or a stable problem response. Domain exceptions must not leak as stack traces or framework-shaped errors.

## API contracts

Use TypeBox as the canonical runtime schema source for transport and other untrusted boundaries. Fastify registers the schemas and produces OpenAPI from the same route definitions. A generated client is consumed by the web application; later clients may be generated for CLI, MCP/integrations, or other languages.

Contract rules:

- Domain entities and database rows are never exposed as accidental DTOs.
- Request and response schemas have stable identifiers and descriptions.
- API inputs and outputs are runtime validated at development/test boundaries; response serialization uses explicit schemas.
- Error responses use a consistent, documented problem shape with safe public detail and a correlation identifier.
- Pagination, filtering, sorting, timestamps, unknown values, and partial-result metadata are explicit.
- OpenAPI generation is deterministic and CI fails on uncommitted drift.
- Breaking changes require an explicit version/compatibility decision; do not prematurely introduce path versioning before the first contract exists.

TypeBox is preferred to Zod or Valibot here because it constructs JSON Schema directly and has an official Fastify Type Provider. Zod is an excellent application validator and now converts to JSON Schema, while Valibot is attractive for small browser bundles; neither offers enough benefit to justify a second boundary-schema system. Domain invariants remain ordinary domain behavior rather than being mistaken for transport validation.

Validate at least:

- API requests, responses, and configuration;
- Source Adapter results and normalized SourceRecords;
- import/export envelopes and versions;
- persisted JSON payloads when read across a version boundary;
- provider/model proposals before mapping them to core types.

Successful schema validation means “well formed,” not “true.” Evidence, provenance, authorization, and domain invariants are evaluated separately.

## Database access

SQLite remains canonical under ADR-001. Use Drizzle ORM for typed schema/query construction and transactions, Drizzle Kit for explicit versioned migrations once implementation begins, and Node's built-in `node:sqlite` driver initially. Keep an explicit SQL escape hatch for queries where SQL is clearer or profiling shows a need.

Persistence adapters implement ports declared by core. Transaction boundaries belong to application use cases. Network, filesystem, source, and model calls never occur inside a database transaction. Enable and verify SQLite features such as foreign keys and a documented busy timeout at connection startup; decide journal/synchronous settings through measured durability and concurrency tests, not copied defaults.

Drizzle's support for SQLite and PostgreSQL helps preserve familiar query/schema concepts, but a future move is not a driver swap. Dialects, data types, migrations, locking, job claims, operational behavior, and query plans must be reviewed. ADR-001 alone governs whether persistence is reconsidered. Any migration must preserve stable domain identity, provenance, raw Source Records where retained, OpportunitySnapshots, Evaluations, Decisions, Applications, and ApplicationEvents and must include backup, validation, rollback, and self-hosting analysis.

Prisma was not selected because its generated client and abstraction are more machinery than needed for a SQL-oriented SQLite modular monolith. Kysely offers excellent typed, explicit SQL but would require more assembly around schema/migration conventions. Direct SQLite access gives maximum control but would make the project own more mapping and type-safety infrastructure from the start.

## Durable job ledger

Implement a small project-owned ledger in the database package rather than adopting an external queue. The worker owns polling and execution; application use cases enqueue durable intent transactionally with related state when appropriate.

The initial record needs concepts equivalent to:

- stable job ID, kind, schema version, and validated payload;
- state such as pending, leased/running, succeeded, retry-wait, failed/dead, or cancelled where justified;
- priority and `available_at`/scheduled time;
- attempt count, maximum attempts, and last safe error summary;
- lease owner and lease expiry;
- idempotency/deduplication key and timestamps;
- optional parent/correlation identifiers and result reference.

Exact columns and state names remain an implementation design detail for the scaffold.

### Claim and execution behavior

1. In a short transaction, select due work, atomically claim it with a unique worker/lease token, increment the attempt, and commit.
2. Perform source/model/CPU work outside the transaction.
3. In a short transaction, record a successful domain effect and terminal job result idempotently, or record a retry/failure transition.
4. Recover expired leases after process failure. A stale worker token cannot complete a job claimed by another worker.

Use bounded exponential backoff with jitter and job-kind limits. Distinguish retryable outage/rate-limit failures from permanent validation or unsupported-input failures. Exhausted work remains inspectable as a dead/final failure and can be requeued deliberately; it is not silently deleted.

Recurring scans are represented by durable next-run times or jobs produced by a small scheduler loop in the worker. No separate cron service is required for local operation. Job handlers must be idempotent because delivery is at least once.

On shutdown, stop claiming new work, let bounded in-flight work finish within a grace period, then release or allow leases to expire safely. Health reporting must distinguish API availability, worker liveness, worker freshness, and accumulated failures.

Start with one active write-heavy worker and bounded handler concurrency. Introduce neither Redis nor an external queue until measured throughput, routing, multi-host claims, or operational requirements exceed this ledger. Persistence and queue revisit decisions remain independent.

## Source and normalization boundary

Each source adapter owns authentication, pagination, rate limiting, source identifiers, retrieval metadata, and parsing for one source. Its output is a runtime-validated SourceRecord with raw provenance. The normalizer maps that record to source-neutral observations, and identity logic proposes exact duplicates, candidates, or possible reposts before Opportunity and OpportunitySnapshot persistence.

Adapters do not evaluate Candidate Fit or Quality and never redefine core entities. Source fixtures are retained for deterministic contract tests. Source HTML and descriptions are untrusted data, including text that resembles model instructions.

## AI provider boundary

Core declares narrow capabilities based on product tasks, not vendor operations—for example, proposing structured evidence extraction or a bounded interpretation. The adapter receives a versioned input, invokes a configured provider, and returns a TypeBox-validated provider-neutral proposal or a typed failure. Application/domain behavior decides whether and how the proposal affects an Evaluation.

Use the AI SDK inside `packages/providers` for the initial multi-provider adapter because its provider registry and structured-generation support reduce repeated integration work. Keep its messages, tools, error types, and result types inside that package. Direct provider SDKs or HTTP adapters may implement the same core capability when specialized or local/OpenAI-compatible behavior warrants them.

For every call, retain provenance appropriate to privacy policy:

- capability and prompt/template version;
- configured provider, model, and relevant inference settings;
- stable references or hashes for the bounded input and Evidence used;
- request time, outcome, latency, retry lineage, and safe usage/cost data when available;
- validated proposal or validation/failure state.

Do not treat model confidence as Evidence. Strip capabilities from source content, delimit untrusted material, expose only the minimum tools/data needed, and validate all structured output independently. A provider outage leaves deterministic state intact and results in visible partial/retryable status rather than fabricated completion.

## Configuration, privacy, and security

- Validate each process's environment at startup with TypeBox and fail with actionable names, never secret values.
- Keep `.env.example` limited to documented placeholders. No secret has a browser-exposed Vite prefix.
- Give API and worker only the credentials their capabilities require.
- Use structured logging with safe identifiers and redaction; avoid resumes, Evidence bodies, job descriptions, prompts, provider responses, and secrets by default.
- Apply request size, content type, timeout, and outbound-host controls at boundaries.
- Parse and render untrusted content as data. Sanitize any justified HTML allowlist; do not execute source markup.
- Self-hosting performs no mandatory telemetry. Future authentication and tenancy are explicit deferred designs, not assumptions in repositories.
- Commit a lockfile, pin the package manager/runtime, minimize production dependencies, review automated updates, and run dependency/security checks in CI. Generated clients and migrations receive code review like source.

## Primary references

- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/)
- [Fastify Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/)
- [Hono web-standard model](https://hono.dev/docs/concepts/web-standard)
- [NestJS modules](https://docs.nestjs.com/modules)
- [TypeBox](https://github.com/sinclairzx81/typebox)
- [Zod JSON Schema conversion](https://zod.dev/json-schema)
- [Drizzle SQLite support](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle PostgreSQL support](https://orm.drizzle.team/docs/get-started/postgresql)
- [AI SDK provider management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management)
- [AI SDK structured output](https://ai-sdk.dev/docs/reference/ai-sdk-core/output)
