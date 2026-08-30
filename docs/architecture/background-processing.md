# Background Processing

## Purpose

Background processing performs source discovery and Evaluation work without blocking interactive requests. It must preserve deterministic ordering where required, survive restarts, expose failures, and avoid duplicate domain effects.

## Recommended v0.1 mechanism

Use a **database-backed durable job ledger in canonical persistence**, processed by the worker process. Do not require an external message broker for v0.1.

The initial workload is single-node dogfood with modest scale. A database-backed mechanism provides transactional scheduling, idempotency, retry state, and observability while avoiding another service. SQLite write constraints are managed with one active worker by default, short claim/commit transactions, and external work outside transactions.

This recommendation defines semantics, not tables or a queue library. An external broker should be reconsidered only when measured throughput, independent scaling, delivery topology, or hosted reliability requirements justify it.

## End-to-end workflow

```text
Scheduler
  → Discovery Job
  → Source Adapter fetch
  → Source Record retention
  → Deterministic normalization
  → Identity and deduplication
  → Opportunity + OpportunitySnapshot persistence
  → Evaluation scheduling
  → Eligibility Evaluation
  → deterministic Fit Evaluation (independent of the Eligibility result)
  → future Quality Evaluation
  → Decision persistence
  → Ranking projection refresh
  → Dashboard/API visibility
```

Cheap filtering, parsing, normalization, and exact deduplication occur before expensive model-assisted Evaluation where practical.

## Conceptual job behavior

A durable job should retain:

- job purpose and scoped target;
- idempotency key or equivalent duplicate-detection identity;
- scheduled time and priority class if needed;
- current working state;
- lease owner and expiry while claimed;
- attempt count and retry eligibility;
- last safe error summary;
- input version or freshness expectation;
- created, started, completed, and failed times; and
- linkage to produced or affected domain records.

Names and physical fields are not frozen.

## Idempotency

At-least-once execution must be assumed. Every workflow requires a stable effect identity:

- repeated scans of the same source record update observation metadata or reuse identical content rather than creating duplicate snapshots;
- normalization of the same Source Record produces the same source-neutral observation under the same normalization version;
- duplicate-detection decisions are repeatable and uncertain candidates remain reviewable;
- an Evaluation is keyed by Candidate, Opportunity, relevant input versions, and evaluation policy so identical retries do not duplicate results;
- Fit V1 fingerprints the snapshot, engine version, Candidate Claims, and linked Evidence; identical input reuses the historical Fit result while changed knowledge may append a new Evaluation;
- Application commands use client/request identity where duplicate user requests are plausible; and
- ranking refresh is replaceable or rebuildable from canonical Decisions.

Idempotency does not mean errors are ignored. A repeated command with different content under the same identity is a conflict to surface.

## Claiming, leases, and stale work

The worker claims a job in a short transaction and records a lease. Network fetches and model calls happen after that transaction. Completion commits results and job outcome atomically where practical. If a worker stops, an expired lease makes the job eligible for recovery.

A worker must verify freshness before committing long-running results. If a newer OpportunitySnapshot, CareerProfile revision, or policy version makes the inputs stale, the result should be recorded as superseded or discarded safely and a fresh Evaluation scheduled. Stale output must not replace a newer Decision.

## Retry policy

Classify failures rather than retrying everything uniformly:

- **Transient:** timeouts, temporary source failures, rate limits, or provider unavailability; retry with bounded backoff and jitter.
- **Permanent input:** unsupported source shape, invalid identifier, deleted listing; record and stop until input changes or a manual retry occurs.
- **Policy/validation:** model response fails validation or domain invariants; retain diagnostics, do not persist invalid domain state, and retry only if a changed attempt could help.
- **Systemic:** persistence unavailable, configuration invalid, or repeated adapter failure; pause affected work and surface an operational alert.

Retry limits and intervals remain implementation decisions. Exhausted work must remain visible rather than disappearing.

## Failure isolation

- A failure for one source, board, Opportunity, Candidate, or Evaluation dimension should not stop unrelated work.
- Source outages should be scoped to the adapter/source account and should not mark Opportunities removed until absence is confirmed under a defined policy.
- Model failure must not roll back valid deterministic Source Records, snapshots, or extracted facts.
- Eligibility, Fit, and Quality may report partial completion independently. Decision policy must not present a complete recommendation when decisive assessment work failed.
- Ranking refresh failures do not erase existing Decisions; the UI shows freshness or stale state.

## Rate limiting and source care

Adapters report source-specific throttling and pagination metadata. The scheduler respects per-source limits, retry hints, and bounded concurrency. Rate limiting should be server-side and observable. A fast retry loop must not amplify a source outage.

No source credentials or raw sensitive response data should appear in ordinary logs.

## Duplicate jobs

Scheduling and retries can create duplicate job requests. The job ledger should coalesce or harmlessly execute duplicates based on idempotency identity. It must not rely on exactly-once delivery. Concurrency controls should prevent two workers from producing conflicting canonical effects for the same input version.

## Scheduled discovery

Scheduling policy identifies sources due for scanning and creates durable discovery work. It should record last attempted and last successful scans separately. A failed scan does not prove listings were removed. Manual scans should use the same workflow and protections as scheduled scans.

## Evaluation scheduling

Schedule or refresh an Evaluation when material inputs change:

- a new or changed OpportunitySnapshot;
- relevant CandidateFact or Preference changes;
- Evidence or contradiction resolution changes;
- evaluation policy changes; or
- an earlier Evaluation becomes stale or incomplete.

Evaluation scheduling should avoid expensive work for exact duplicates, filtered-out records, or unchanged inputs.

## Observability and privacy

Operators need job counts, age, duration, retry state, failure category, source scope, and safe correlation identifiers. Logs and metrics should avoid full resumes, job descriptions, application materials, source credentials, and model payloads. Self-hosted operation must not send telemetry by default.

## When to revisit an external queue

Reconsider the database-backed mechanism when:

- multiple worker nodes must claim high volumes concurrently;
- independent workloads require isolation or separate scaling;
- database job polling materially harms interactive workloads;
- hosted delivery needs stronger delivery, fan-out, or regional behavior; or
- measured recovery and throughput requirements exceed the canonical database design.

The semantics above—idempotency, leases, attempts, failure classification, and domain transactions—must survive any transport change.

## Unresolved decisions

- Concrete job states and lease algorithm
- Scheduler implementation and scan frequency
- Retry limits, backoff, and dead-letter/review behavior
- Worker concurrency and resource limits
- Exact transaction boundaries between job outcome and domain effects
- Ranking projection refresh strategy
- Operational alerting and observability stack
- Future external queue technology, if revisit conditions occur
