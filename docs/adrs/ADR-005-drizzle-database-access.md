# ADR-005: Drizzle for SQLite database access and migrations

## Status

Accepted for the first application implementation. ADR-001 remains authoritative about the persistence engine and its revisit conditions.

## Context

SQLite is canonical v0.1 persistence. The API and worker require transactions, typed queries, explicit schema evolution, reliable tests, job leasing, and preservation of durable provenance/history. Database access must not leak storage rows or engine-specific types into the domain.

Drizzle, Prisma, Kysely, and direct SQLite access all support credible implementations. The project favors visible SQL semantics and a small runtime while still needing a coherent typed schema and migration workflow.

## Decision

Use Drizzle ORM for typed queries and transactions and Drizzle Kit for versioned migrations, initially with Node's built-in `node:sqlite` driver. Keep SQL available when it is clearer or required for a measured query. Place concrete schema, repositories, transactions, migrations, and the job ledger in the database package behind ports owned by core.

Human-readable files remain versioned export/import artifacts, not another persistence adapter with canonical write authority.

## Alternatives considered

### Prisma

Rejected for the first implementation. Its generated client and higher-level workflow add more machinery than this SQL-oriented SQLite modular monolith needs.

### Kysely

Deferred. Its explicit typed query builder is a strong fit, but the project would need to assemble more schema and migration conventions than Drizzle currently requires.

### Direct SQLite library

Rejected as the default access layer. It maximizes control but would make the project own more mapping, type synchronization, and migration infrastructure immediately.

## Consequences

### Positive

- Typed, SQL-oriented access with explicit transactions and migrations
- Low runtime abstraction and straightforward SQLite integration
- One database package can support API, worker, integration tests, and job-ledger behavior
- Drizzle also supports PostgreSQL, which may reduce conceptual churn if a future evaluation selects it

### Negative

- Drizzle schema and query APIs remain infrastructure-specific
- Complex SQL may need handwritten fragments and careful result typing
- Driver and SQLite concurrency behavior require direct integration testing
- A future PostgreSQL move still requires dialect-specific schema, migration, locking, job-claim, query, and operations work

## Revisit conditions

Reconsider this access layer if profiling or implementation shows that it obstructs required SQL, migrations, testing, driver behavior, or maintainability. Reconsider the persistence engine only under ADR-001's actual workload and operational triggers. Drizzle's multi-dialect support does not make PostgreSQL inevitable or turn a migration into a configuration change.

Any engine or access-layer migration must preserve stable domain identity, Candidate and Opportunity provenance, Source Records where retained, OpportunitySnapshots, Evaluations, Decisions, Applications, and ApplicationEvents, with tested backup, validation, rollback, and self-hosting consequences.

