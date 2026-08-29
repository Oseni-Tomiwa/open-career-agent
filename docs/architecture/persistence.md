# Persistence Architecture

## Decision scope

Persistence must support the v0.1 dogfood workflow while preserving an upgrade path to hosted and multi-user operation. This analysis selects canonical state behavior and a first engine; it does not select an ORM, migration tool, schema, hosting vendor, or backup product.

## Requirements

Canonical persistence must support:

- a Web Dashboard and API reading while a worker writes;
- transactional Candidate, Application, and job-state changes;
- immutable or append-oriented OpportunitySnapshots, Evaluation history, Evidence provenance, and ApplicationEvents;
- filtering and querying Opportunities by Candidate-specific assessments and Decisions;
- idempotent background jobs, retries, and leases;
- local/self-hosted operation with low setup burden;
- backup, restoration, and human-readable export/import;
- later analytics and a credible migration path to hosted multi-user operation; and
- preservation of unknowns, contradictions, source scope, confidence, and completeness.

## Options considered

| Criterion | Human-readable files canonical | SQLite canonical | PostgreSQL canonical | Hybrid database + files |
|---|---|---|---|---|
| Dashboard queries/filtering | Requires indexes or repeated scans built by the application | Strong for v0.1 relational queries | Strong | Strong if the database is canonical; ambiguous if both are writable |
| Concurrent reads/writes | Weak; locking and atomic multi-file updates become application concerns | Multiple readers and serialized writes suit modest single-node use | Strong multi-process and multi-user concurrency | Depends on canonical store; dual writes create consistency risk |
| Transactional Application state | Difficult across files and event/index updates | Native local transactions | Native transactions with stronger concurrent-write behavior | Sound only when the database is authoritative |
| Snapshots/evaluation history | Human-readable but costly to query and relate | Well suited at dogfood scale | Well suited at larger scale | Database should own relationships; files can export history |
| Evidence provenance | Possible, but referential integrity and contradiction queries are cumbersome | Relational links and transactions fit the model | Relational links and transactions fit the model | Useful when exports retain stable references |
| Background job ledger | Requires custom locking and crash recovery | Sufficient with short transactions, leases, and bounded workers | Strong, including higher concurrency | Database-backed ledger is preferable |
| Analytics | Requires ingestion into another query system | Adequate for initial local analytics | Strong for larger datasets and concurrent analytics | Export can feed analysis, but canonical metrics come from the database |
| Local/self-hosted operations | Lowest apparent dependency count but high application complexity | Lowest operational burden among transactional databases | Requires operating a server database | SQLite plus exports remains simple; PostgreSQL plus files does not reduce database operations |
| Backup/export | Easy copying, but consistency across files is hard | Consistent single-database backup plus explicit exports | Mature backups but more operational setup | Human-readable export is valuable when clearly non-canonical |
| Future hosted/multi-user | Poor fit without redesign | Requires planned migration or later alternate engine | Strong | Can support both if canonical ownership is unambiguous |
| Contributor experience | Easy to inspect, hard to implement safely | Simple local setup and familiar query model | Additional service setup | Good only if dual-write and sync complexity are avoided |

## Recommendation

Use **SQLite as the canonical persistence engine for the v0.1 local/self-hosted, single-node release**. Use explicit human-readable export/import as a product capability, not as a second canonical store. Record this decision in [ADR-001](../adrs/ADR-001-canonical-persistence.md).

This recommendation follows from the smallest trustworthy system principle:

- v0.1 is single-Candidate or low-concurrency dogfood, not hosted multi-user SaaS;
- transactions are needed for Application Events, Evidence relationships, snapshots, and job claims;
- relational querying is needed by the dashboard and background workflows;
- a server database would add operational burden before hosted concurrency requires it; and
- canonical files would move locking, indexes, transactions, and recovery into application code.

PostgreSQL is not rejected. It becomes the leading candidate when hosted or high-concurrency requirements are real. Selecting it now would optimize for an explicitly future scope at the cost of local setup. Selecting SQLite now creates a migration obligation, but that obligation is narrower and more observable than building a safe transactional file store or requiring every dogfood user to operate a database service.

## Canonical-state rules

- The database is authoritative for Candidate, Opportunity, Evidence, Evaluation, Decision, Application, ApplicationEvent, and BackgroundJob state.
- Raw Source Records may store content inline or by managed content reference; the canonical database must retain their provenance and integrity reference. Exact large-payload storage is unresolved.
- Human-readable exports are snapshots for portability, inspection, and backup workflows. Editing an export does not mutate canonical state unless a validated import explicitly applies it.
- No dual-write synchronization between database and editable files is permitted in v0.1.
- Derived projections and current statuses may be rebuilt from canonical records and histories.
- Unknown, absent, inferred, and contradictory states require explicit representations; database defaults must not collapse them.

## Concurrency and transaction model

SQLite permits concurrent readers but serializes writes. v0.1 should remain within that constraint through architecture rather than pretending it does not exist:

- use one active worker process for write-heavy discovery and Evaluation work by default;
- keep transactions short and avoid model/network calls while holding a transaction;
- claim jobs transactionally, perform external work outside the claim transaction, then commit results idempotently;
- bound worker concurrency and database write batches;
- retry transient lock contention with limits and observability; and
- make API commands idempotent where duplicate requests are plausible.

The exact connection settings and transaction primitives belong to implementation design. If realistic dogfood load shows sustained write contention, that is evidence for revisiting the engine or worker model.

## History and provenance behavior

- OpportunitySnapshot, Evaluation, Decision, and ApplicationEvent histories are appended or superseded, not destructively rewritten.
- An Evaluation identifies the Candidate facts, OpportunitySnapshots, Evidence, and policy/model provenance used at the time.
- Current Opportunity and Application views may be projections over retained history.
- Contradictory Evidence retains both sides and their scopes.
- Corrections append revision or correction information so prior Decisions remain explainable.

This does not require full event sourcing. Only domain histories that have audit, outcome, or temporal value are retained as such; ordinary mutable settings may use current-state records with appropriate audit needs.

## Backup, export, and import

Local deployment should support a consistent database backup that does not rely on copying a file during an unsafe write. Human-readable export should cover Candidate-controlled data, Opportunities, provenance, Applications, and events in a documented, versioned format. Imports must validate identity, provenance, references, and conflicts before applying changes.

Export format, attachment handling, encryption, and restore UX remain unresolved. Export is not a substitute for tested backup and restore.

## Future PostgreSQL migration path

Future hosted deployment must not be blocked by SQLite-specific domain behavior. To preserve a migration path:

- keep domain rules outside SQL triggers or engine-specific stored procedures unless later justified;
- isolate persistence behind application-owned repository and transaction boundaries;
- use stable domain identifiers rather than relying on file paths or engine-local row ordering;
- treat job semantics—idempotency, leasing, retries—as domain/application contracts;
- keep a versioned export capable of moving user-controlled state; and
- test important query and transaction behavior independently from presentation.

This is not a commitment to support two engines in v0.1. PostgreSQL support should be introduced only with hosted or concurrency requirements and a tested migration plan.

## Revisit conditions

Re-evaluate canonical persistence when any of these become true:

- hosted multi-user deployment enters committed scope;
- more than one active worker must write concurrently at sustained volume;
- lock contention or data volume fails measured v0.1 service goals;
- high-availability, replication, remote database access, or zero-downtime maintenance is required;
- analytics workloads interfere with operational queries; or
- supporting SQLite and future deployment requirements costs more than standardizing on a server database.

## Unresolved decisions

- Physical schema, indexes, migrations, and query/ORM layer
- Connection and transaction settings
- Large raw payload and attachment storage
- Backup, restore, export, and import formats
- Encryption at rest and key ownership
- Data retention, deletion, and anonymization
- Measured thresholds that trigger PostgreSQL migration
- Hosted migration and tenancy strategy
