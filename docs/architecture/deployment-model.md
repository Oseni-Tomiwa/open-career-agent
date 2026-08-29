# Deployment Model

## Goals

The deployment model must make local/self-hosted operation practical without preventing a future hosted version. It defines logical pieces and process roles, not a cloud vendor, container platform, operating system, or packaging tool.

## Recommended v0.1 shape

Use one modular-monolith deployment unit with two process roles:

1. **Web/API runtime:** serves the dashboard and programmatic API and executes interactive application use cases.
2. **Background worker:** schedules and executes discovery, normalization, deduplication, Evaluation, and ranking refresh work.

Both roles use the same domain and application modules and the same canonical SQLite persistence. A local launcher may start them together, but they remain separate processes so slow external work cannot block interactive requests and each role can restart independently.

This is not a microservice architecture. No internal network API between the process roles is required; durable jobs and domain state coordinate through canonical persistence.

## Logical deployment pieces

| Piece | v0.1 role | Future direction |
|---|---|---|
| Web Dashboard | React/Vite Candidate interface served with or alongside the API | May be served separately if justified, but domain logic remains server-side |
| Programmatic API | Independent Fastify application boundary | Also supports future CLI, MCP, and integrations through shared use cases and OpenAPI contracts |
| Background Worker | Single active write-heavy worker by default | May scale or split by workload after measured need |
| Persistence | Canonical SQLite database on durable local storage | PostgreSQL is the leading hosted/high-concurrency candidate under ADR revisit conditions |
| Optional AI Provider | Remote or local provider behind server-side boundary | Configurable capability providers; no provider is mandatory architecture |
| External ATS access | Server-side outbound access to Greenhouse, Ashby, Lever | Additional adapters without core-domain changes |

## Local/self-hosted operation

A Candidate should be able to run the platform on a machine or server they control with:

- durable storage for canonical state and backups;
- network access to configured ATS sources and optional remote AI providers;
- server-side secrets supplied through a documented mechanism;
- the Web/API and worker process roles; and
- no required telemetry or hosted control plane.

A deployment without an AI provider should still support deterministic discovery, normalization, exact deduplication, explicit Eligibility rules, durable Applications, and structured explanations. Model-assisted results may be unavailable or held for manual review.

Local access defaults, network exposure, TLS termination, and account protection require later security design. “Self-hosted” must not imply safe public exposure without configuration.

## Future hosted operation

The modular boundaries preserve a later hosted topology in which:

- Web/API instances may be replicated;
- workers may scale independently or by workload;
- canonical persistence may migrate to PostgreSQL;
- authentication, authorization, tenancy, quotas, and abuse controls become required;
- a durable external queue may replace the database-backed ledger if revisit conditions are met; and
- AI and source credentials may be user-, tenant-, or service-scoped.

These are future compatibility goals, not v0.1 features. Hosted deployment must use the same domain invariants and Evidence semantics as self-hosting.

## Process separation rationale

Web/API and worker should be separate processes in v0.1 because:

- ATS and model calls have unpredictable latency and failure modes;
- scheduled work should continue without an active browser session;
- retries and leases should survive API restarts;
- CPU/memory and concurrency can be bounded independently; and
- interactive health can remain visible during a source outage.

They remain one deployment unit to avoid duplicated configuration, version skew, distributed transactions, and operational complexity.

## Persistence and storage

The canonical SQLite database must live on durable storage and should be backed up using a consistency-safe method. Raw Source Records, exports, and future attachments may require managed storage alongside the database; their integrity and references must remain canonical even if bytes are stored separately.

Ephemeral storage is not acceptable for canonical state. File paths are deployment details and must not become domain identities.

## Network and trust boundaries

- Browsers communicate only with the Web/API boundary; they do not connect to persistence, ATS sources on behalf of the server, or AI providers using server credentials.
- Source and AI credentials never enter browser bundles or responses.
- Outbound ATS and provider calls originate from server-side process roles.
- External Source Records and model outputs remain untrusted even when transport is authenticated.
- The worker receives bounded capabilities rather than broad access to Candidate files or unrelated secrets.

## Privacy and logging

- Candidate Evidence and application material are sensitive data.
- Logs should use safe identifiers and operational summaries rather than CV text, job descriptions, model payloads, or application answers.
- Model calls send only the Candidate and Opportunity Evidence necessary for a bounded task.
- Self-hosting sends no telemetry by default. Any future telemetry must be explicit, documented, and separable from core operation.
- Generated Candidate Claims retain provenance across deployment modes.

## Availability and failure behavior

v0.1 does not promise high availability. It should recover cleanly after process restart:

- expired job leases allow work recovery;
- idempotency prevents duplicate domain effects;
- API health does not claim background freshness when the worker is stopped;
- source/provider outages remain scoped and visible;
- backups and restore procedures are testable; and
- partial Evaluations are presented as partial rather than silently complete.

## Configuration boundaries

Deployment configuration may select ports, storage location, scan cadence, source boards, optional provider, concurrency, and retention policies. It must not redefine domain meaning such as treating unknown sponsorship as no or weakening claim-safety rules.

## Unresolved decisions

- Packaging and container strategy
- Local process supervision and upgrades
- Authentication for local and hosted modes
- Public network exposure and TLS guidance
- Secrets management and rotation
- Encryption at rest and backup encryption
- Attachment/raw-payload storage
- Hosted tenancy and isolation model
- Observability and explicit telemetry policy
- PostgreSQL and external-queue migration plans when triggered
