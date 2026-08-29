# ADR-001: Canonical persistence for v0.1

## Status

Accepted for the v0.1 architecture. Revisit conditions are explicit below.

## Context

The platform needs transactional and queryable state for a Web Dashboard, background discovery, OpportunitySnapshots, Evidence provenance, Evaluation history, explainable Decisions, durable Applications, ApplicationEvents, and retryable jobs. The initial release is a local/self-hosted dogfood product, while hosted multi-user deployment remains future scope.

Canonical human-readable files would require the application to implement cross-file transactions, concurrency, indexes, referential integrity, and crash recovery. PostgreSQL would satisfy current and future data requirements but introduces a server dependency for every local user before hosted concurrency is required. SQLite provides local transactions and relational querying with a single-node operational model, but serializes writes and may require later migration.

## Decision

SQLite is the canonical persistence engine for v0.1 local/self-hosted, single-node operation.

The database is authoritative for domain and background-job state. Human-readable export/import is a required product consideration but is not a second canonical representation. v0.1 will not dual-write canonical state to editable files.

OpportunitySnapshots, Evaluation and Decision history, and ApplicationEvents remain durable canonical state rather than being reduced to latest-status records.

The architecture will use short transactions, one active write-heavy worker by default, bounded concurrency, idempotent commands/jobs, and persistence boundaries that keep domain logic independent from engine-specific types. Network and model calls must not occur inside database transactions.

Persistence will be reconsidered when observed workload or committed operational requirements exceed the assumptions of this decision. PostgreSQL is one candidate for that future evaluation, not an inevitable next step.

## Alternatives considered

### Human-readable files as canonical state

Rejected because transactional Application state, concurrent worker/API writes, provenance relationships, filtered dashboard queries, and crash-safe job claims would require building database behavior in application code.

### PostgreSQL as canonical state from v0.1

Deferred because its concurrency and hosted strengths exceed the initial single-node requirement while adding a service, configuration, backup, and contributor setup burden. It should be reconsidered when those strengths become necessary.

### Hybrid canonical database and canonical files

Rejected because two writable authorities create synchronization, conflict, and recovery ambiguity. A database plus non-canonical, versioned export/import retains portability without dual-write semantics.

## Consequences

### Positive

- Low-friction local/self-hosted setup
- Transactions and relational queries without a separate database service
- Suitable representation for snapshots, Evidence, histories, and job leases
- Straightforward consistent backup and portable export design
- Faster contributor onboarding for the dogfood release

### Negative

- Writes are serialized and require disciplined, short transactions
- Default worker concurrency must be bounded
- A future hosted or higher-concurrency deployment may require a tested migration to a different persistence engine
- Supporting a migration path constrains persistence-specific shortcuts

## Risks

- Evaluation or discovery bursts may create lock contention.
- Developers may accidentally hold transactions across network or model calls.
- SQLite-specific assumptions may leak into domain or job behavior.
- The project may delay migration after hosted requirements emerge.
- Users may mistake exported files for writable canonical state.

Mitigations include a single active worker default, transactional job claims, idempotent writes, observable contention, engine-neutral domain identifiers, versioned exports, and explicit revisit triggers.

## Revisit conditions

Revisit this decision when one or more observable conditions occur:

- hosted multi-user operation becomes committed scope and requires shared state across users or runtime hosts;
- sustained concurrent writes cause lock retries, failed writes, job delays, or API latency to exceed documented service goals under representative load;
- more than one worker process or host must claim and write jobs concurrently, including horizontal worker scaling;
- Web/API and worker runtimes require remote or shared database access rather than access to the same single-node database;
- database size, query latency, maintenance duration, or backup/restore time exceeds documented targets on supported self-hosted hardware;
- operational analytics materially degrades interactive or background workloads; or
- committed requirements call for capabilities such as high availability, replication, automated failover, point-in-time recovery, read scaling, online maintenance, or server-enforced tenant isolation.

These conditions trigger a new persistence evaluation; they do not automatically select PostgreSQL or require migration. The evaluation should compare current SQLite behavior with realistic alternatives using observed measurements and committed requirements.

Any migration must preserve stable domain identity and the relationships and provenance of Candidate and Opportunity data, Evidence, OpportunitySnapshots, Evaluations, Decisions, Applications, and ApplicationEvents. It must not flatten durable history into latest-state records. Any replacement decision should also include migration validation, rollback, backup/restore, and self-hosting impact.
