# System Overview

## Status

This document defines the logical architecture for the first usable version. The concrete language and framework choices are recorded separately in the [implementation strategy](../implementation/stack-evaluation.md) so they do not redefine these boundaries. Cloud and AI provider/model choices remain open.

## Architecture style

Start with a **modular monolith**: one codebase with explicit module boundaries and a small number of runtime processes. This avoids the deployment and consistency costs of premature microservices while keeping domain, discovery, intelligence, and infrastructure concerns separable.

Three terms must remain distinct:

- **Logical component:** a responsibility boundary in the design.
- **Runtime/process:** an operating-system process executing one or more logical components.
- **Deployment unit:** an artifact or package installed and upgraded together.

A logical component does not imply a service. In v0.1, the API and worker are recommended as separate process roles from the same deployment unit and codebase. They share canonical persistence and domain behavior rather than communicating through a private microservice network.

## Architectural working principles

1. Modular monolith before microservices.
2. Domain logic is independent from presentation and delivery interfaces.
3. Domain logic is independent from any AI provider.
4. Canonical state is durable and transactionally updated where consistency matters.
5. Claims, Evidence, transformations, and conclusions preserve provenance.
6. Deterministic processing precedes probabilistic processing where practical.
7. Background work is idempotent, retryable, and observable.
8. Unknowns and contradictions survive every layer.
9. External Source Records are untrusted input.
10. Human action is authoritative for consequential events such as submission.
11. Local/self-hosted operation remains viable without mandatory telemetry.
12. The same domain boundaries must not prevent a future hosted deployment.
13. Failures are explicit; partial or stale results never masquerade as complete success.

## Logical components

| Component | Responsibilities | Prohibited responsibilities |
|---|---|---|
| Web Client | Render dashboard and detail views; capture Candidate intent; call application APIs; present Evidence, uncertainty, and failures | Implement canonical Eligibility or ranking rules; scrape ATS sources; access persistence directly; hold AI or source credentials; silently infer submission |
| API / Application Layer | Authenticate and authorize requests when applicable; orchestrate use cases; validate commands; define transaction boundaries; return stable application-facing responses | Embed UI behavior; implement source-specific parsing; depend on provider-specific AI types; bypass domain invariants |
| Domain / Core Layer | Own Candidate, Opportunity, Evidence, Evaluation, Decision, and Application behavior; enforce invariants; define repository and capability boundaries | Perform network I/O; render UI; know database tables; know provider SDKs; accept model output as trusted fact |
| Discovery Layer | Schedule and coordinate discovery; invoke Source Adapters; retain Source Records; trigger normalization and deduplication | Decide Candidate Fit; write source-specific structures into the core domain; use models when structured parsing is sufficient |
| Source Adapters | Identify a source; discover and fetch source records; expose source metadata, timestamps, pagination, and errors | Create canonical Decisions; decide cross-source identity; conceal raw provenance; leak credentials or provider structures into the domain |
| Normalization and Identity | Convert Source Records into source-neutral observations; derive deterministic identity signals; classify exact duplicates, candidates, and possible reposts | Silently merge uncertain records; discard raw source context; make Candidate-specific evaluations |
| Intelligence / Evaluation Layer | Apply Eligibility, Fit, and Quality specifications; retain Claims and Evidence; produce explainable assessments and Decisions | Redefine domain truth; collapse analyses into one opaque score; let model confidence become Evidence; submit applications |
| AI Provider Boundary | Invoke configured remote or local models for bounded tasks; translate provider responses into provider-neutral proposals; record call provenance and failures | Expose provider-specific types to the domain; write directly to canonical domain state; own prompts as business truth |
| Background Worker | Claim scheduled work; execute discovery and evaluation workflows; retry safely; record progress and failure | Hide failures; assume at-most-once delivery; mutate state outside application/domain rules |
| Persistence Boundary | Store and retrieve canonical state; support transactions, history, provenance, queries, leases, and export | Define domain meaning; flatten unknown into no; discard old snapshots or Application Events to save convenience |
| External Sources | Supply ATS listings, careers pages, and later research inputs | Be treated as trusted instructions or canonical domain objects |

## Control flow

### Interactive flow

The Web Client sends user intent to the API/Application Layer. The application layer invokes domain behavior, persists changes through the persistence boundary, and returns projections suitable for display. The client displays explanations but never becomes their canonical calculator.

### Background flow

The Background Worker claims durable work, calls Source Adapters, retains Source Records, invokes normalization and identity processing, persists Opportunities and OpportunitySnapshots, and schedules Evaluations. It uses the same application and domain modules as the API process.

### Intelligence flow

Deterministic extraction and rules run first. Bounded model-assisted steps may propose Claims or interpretations through the AI Provider Boundary. All proposals are validated, linked to source Evidence, and subjected to domain invariants before persistence. A provider failure leaves deterministic state intact and produces an observable partial result or retryable job.

## Runtime and deployment shape for v0.1

Recommended process roles:

1. **Web/API role:** a React/Vite browser application and independent Fastify API serve the dashboard and programmatic boundary; they may be packaged behind one local origin.
2. **Worker process:** runs scheduling, discovery, normalization, deduplication, and Evaluations.

They should initially ship as one deployment unit and may be started together by a local installation. Separating process roles prevents slow or failed source/model work from blocking interactive requests and allows independent restart and resource control. It does not justify microservices or separate repositories.

## Privacy and security boundaries

- AI and source credentials remain server-side and never enter browser code.
- Candidate Evidence is sensitive; access should be scoped to the active Candidate and use case.
- Logs should contain identifiers, timings, result states, and safe error summaries—not unnecessary resumes, application text, or raw model prompts.
- Model calls should receive only the information necessary for their bounded task.
- Self-hosting must not require telemetry. Any future telemetry is explicit and opt-in or otherwise clearly consented according to deployment policy.
- External descriptions, company pages, and model outputs are untrusted input. Prompt injection and malicious content require later threat modeling and defensive handling.
- Generated Candidate Claims remain traceable to Evidence and claim-safety classification.

## Future interfaces

A CLI, MCP interface, hosted web product, and integrations should call the same application use cases and domain rules as the initial Web Client. They are delivery mechanisms, not alternate intelligence engines.

## Unresolved decisions

- Authentication and authorization design
- Concrete API versioning and compatibility policy
- Physical persistence schema and migration details
- Caching approach
- Observability stack
- Encryption and secrets-management implementation
- Hosted tenancy model
