# Architecture

Architecture is intentionally **not frozen** during Phase 0. This directory will hold approved architecture documentation after product questions are sufficiently clear and decisions have been recorded through architecture decision records (ADRs).

No runtime, framework, repository structure, database, persistence model, cloud provider, AI provider, background-job system, authentication model, or deployment topology is approved yet. PostgreSQL is a candidate that may be evaluated later; it is not a decision.

## Constraints already established

Later architecture work must preserve these product constraints:

- Eligibility is evaluated separately from Fit and Opportunity Quality.
- Missing information is represented explicitly; unknown is not equivalent to no.
- Candidate claims require Evidence and provenance.
- Deterministic or cheap processing should precede expensive AI where practical.
- Consequential actions remain under human control.
- Application state must be durable and visible to downstream workflows.
- The dashboard is a first-class interface, not the intelligence engine.
- Local/self-hosted and possible future hosted operation should remain viable until their boundary is decided.
- The intelligence core should not fundamentally depend on an AI coding CLI.
- Provider independence and open extensibility should be preserved where practical.

These are product and system qualities, not a detailed architecture.

## Next steps

Before implementation, contributors should define the necessary product and intelligence specifications, identify decision options and tradeoffs, and record consequential architecture choices in [`docs/adrs/`](../adrs/README.md). Detailed diagrams should be added to [`docs/diagrams/`](../diagrams/README.md) only when they reflect reviewed decisions.
