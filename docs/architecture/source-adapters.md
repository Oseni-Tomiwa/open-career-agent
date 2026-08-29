# Opportunity Source Adapter Architecture

## Purpose

Source Adapters isolate external Opportunity systems from the core domain. Greenhouse, Ashby, and Lever are the initial v0.1 adapters. Adding a future source should add an adapter and mapping rules, not require new source-specific fields throughout Candidate, Opportunity, Evaluation, or Decision behavior.

External content is untrusted input. Adapters acquire and describe it; they do not decide what is true about the Candidate or what the Candidate should pursue.

## Recommended boundary

Use this flow:

```text
Source Adapter → SourceRecord → Normalizer → Opportunity observation
                                      ↓
                         Identity / deduplication
                                      ↓
                     Opportunity + OpportunitySnapshot
```

Prefer this over `Adapter → normalized Opportunity`.

### Why

- Source-specific payloads and metadata remain inspectable without contaminating the core domain.
- Normalization behavior is consistent and testable across sources.
- A changed normalizer can reprocess retained Source Records without refetching.
- Raw/source Evidence remains available for provenance and extraction review.
- Adapters stay focused on transport, pagination, source identity, and source-specific interpretation.
- Deduplication can compare observations across sources before assigning canonical identity.

The tradeoff is an additional intermediate concept and storage cost. That cost is justified by provenance, replay, debugging, and historical listing requirements. Retention may use a raw payload or integrity-protected content reference; exact large-payload storage remains unresolved.

## Source Adapter responsibilities

Each adapter conceptually must:

- identify its source kind and source account, board, or tenant scope;
- discover Opportunity summaries or identifiers;
- fetch listing details when discovery does not provide them;
- expose external identifier, canonical source URL, and source metadata;
- retain raw/source representation or a durable reference with integrity metadata;
- record fetch and observation timestamps separately from source-reported update timestamps;
- handle source-specific pagination, continuation, and throttling information;
- distinguish not-found, access, validation, rate-limit, and transient fetch errors;
- declare the adapter and mapping version used; and
- return Source Records without creating Candidate-specific Evaluation results.

An adapter may perform source-specific structural parsing needed to understand its own response, but cross-source normalization belongs to the Normalizer.

## Prohibited adapter responsibilities

An adapter must not:

- construct canonical Opportunity identity by itself;
- silently merge duplicates or reposts;
- calculate Eligibility, Fit, Quality, Decision, or rank;
- convert missing sponsorship text into sponsorship unavailable;
- discard unrecognized fields needed to audit source behavior;
- expose source SDK or payload types to core domain modules;
- follow instructions embedded in job descriptions as executable commands;
- send content to an AI provider without a bounded application use case; or
- hide partial fetches and parsing failures.

## SourceRecord

A SourceRecord is an integration-layer capture, not a canonical Opportunity. It should conceptually retain:

- source kind and source account/board identity;
- external listing identifier where supplied;
- source and application URLs;
- raw payload or durable content reference and integrity fingerprint;
- fetch and observed timestamps;
- source-reported created or updated timestamps when present;
- source-specific pagination/discovery context;
- fetch status, safe error classification, and completeness;
- adapter/mapping version; and
- source-specific metadata that cannot yet be normalized.

SourceRecords should be immutable by content or retain revisions so a later fetch does not destroy what was previously observed.

## Normalization

The Normalizer produces source-neutral observations for fields the domain understands, while retaining Evidence back to the SourceRecord. Candidate v0.1 observations include:

- employer identity/name as stated;
- title;
- locations and location text;
- employment type;
- compensation and its currency, range, period, and scope when stated;
- description sections;
- Requirement Claims and their exact excerpts;
- remote/hybrid/on-site statements and permitted geography;
- source/application URLs;
- external and source timestamps; and
- listing availability or removal observation.

Normalization does not manufacture missing values. It distinguishes source absence, parse failure, ambiguous text, and explicit negative statements. Source wording remains available alongside normalized Claims.

## Opportunity identity

Identity has separate layers:

### Source identity

Identifies one listing within one source scope. The strongest typical key is source kind + source board/account + external identifier. A canonicalized source URL can support identity but may redirect or change.

Repeated scans with the same source identity belong to the same source listing unless reliable Evidence shows identifier reuse.

### Canonical Opportunity identity

Represents the persistent role/listing concept across Source Records and observations. It is assigned by platform identity rules and may link several source identities only when Evidence is sufficient.

### Duplicate detection

Determines whether two observations describe the same current Opportunity. It may create:

- confirmed same-source observation;
- confirmed cross-source duplicate;
- possible duplicate requiring review or continued separation; or
- distinct Opportunity.

### Possible repost detection

Identifies that a later listing may be a renewed publication of an earlier Opportunity rather than the same continuously open listing. Repost status is an evidence-backed interpretation, not perfect fact.

## Deterministic identity signals first

Evaluate deterministic signals before semantic similarity:

1. exact source scope + external identifier;
2. canonicalized source or application URL;
3. explicit cross-link or redirect between official source records;
4. employer identity, normalized title, and location combination;
5. description or structured-content fingerprint;
6. source-created, updated, closed, and observed timestamps; and
7. employment type, department, requisition identifier, or compensation details when available.

No single weak signal—especially normalized title—proves identity. Signals should be retained so a merge is explainable.

Semantic similarity may later identify candidates after deterministic comparison. It must not silently merge records. Uncertain matches stay distinct and may be linked as possible duplicates or reposts until review or stronger Evidence resolves them.

## Snapshot creation and change detection

For a known source identity:

- identical normalized/source content updates last-seen observation without creating a materially duplicate snapshot;
- material changes append a new OpportunitySnapshot;
- disappearance from one failed or partial scan does not prove removal;
- confirmed source absence or closed status creates a removal/closure observation without deleting history; and
- source update timestamps are retained but not trusted as the only change signal.

The exact material-change threshold remains unresolved. At minimum, description, Requirements, compensation, location/remote policy, employment type, and availability changes must be preservable.

## Errors, pagination, and outages

Adapters report structured failure categories to background processing. Pagination checkpoints must be scoped to a discovery job and should not imply a complete scan if a later page fails. A source outage must not mark every unseen Opportunity removed. Rate limits and retry hints are input to scheduler policy.

An adapter change that alters mapping should be versioned so affected Source Records can be re-normalized and resulting changes audited.

## Security and privacy

- Credentials remain server-side and are scoped to the adapter.
- URLs, descriptions, company pages, and payload fields are untrusted.
- Embedded instructions must be treated as listing content, not system or model instructions.
- Logs avoid raw payloads and credentials unless an explicit protected diagnostic flow is used.
- Fetching follows source terms, access boundaries, and rate limits.
- Prompt injection from job descriptions and company pages is a future threat-model requirement before model-assisted processing of external content.

## Unresolved decisions

- Exact adapter capability contract and versioning
- Source account/board configuration model
- Raw payload retention, compression, and deletion
- Canonical URL rules and employer identity resolution
- Material snapshot-change threshold
- Cross-source duplicate review workflow
- Repost semantics and their relationship to Application history
- Semantic similarity and possible embeddings/vector search
- Adapter conformance tests and supported source versions
