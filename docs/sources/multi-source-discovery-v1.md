# MULTI-SOURCE DISCOVERY V1 ARCHITECTURE & SPECIFICATION

## 1. Executive Summary & Overview

Rolevia Multi-Source Discovery V1 expands candidate-scoped ATS discovery beyond Greenhouse to natively support **Lever** and **Ashby** job boards.

The discovery architecture guarantees **100% downstream source neutrality**:

```
Greenhouse ─┐
Lever ──────┼──→ Canonical Normalization Boundary
Ashby ──────┘
                     ↓
             SourceListing
             SourceObservation
                     ↓
              Opportunity
           OpportunitySnapshot
                     ↓
              DiscoveryMatch
                     ↓
 Eligibility → Fit → Quality → Decision
```

Downstream intelligence engines (`Eligibility`, `Fit`, `Quality`, `Decision`), Applications tracking, and the Today dashboard operate exclusively on canonical Rolevia entities (`OpportunitySnapshot`, `CandidateProfile`, `Evaluation`). They do not know or care which ATS produced the opportunity.

---

## 2. Supported Source Providers & Configuration

### Canonical Vocabulary
Supported canonical source system identifiers:
- `greenhouse`: Greenhouse job board API (`https://boards-api.greenhouse.io/v1/boards/${boardId}/jobs`)
- `lever`: Lever public job postings API (`https://api.lever.co/v0/postings/${siteId}?mode=json`)
- `ashby`: Ashby public job board API (`https://api.ashbyhq.com/posting-api/job-board/${boardId}`)

Arbitrary spelling variants (`GreenHouse`, `LEVER`, `AshbyHQ`) are strictly prohibited in domain models, database persistence, worker tasks, and client APIs.

### SearchTarget Source Configuration
Every `SearchTarget` stores a list of source configurations:
```json
[
  { "sourceSystem": "greenhouse", "boardId": "figma" },
  { "sourceSystem": "lever", "boardId": "netflix" },
  { "sourceSystem": "ashby", "boardId": "linear" }
]
```

---

## 3. Source Adapters & Normalization Boundary

### Source Adapter Contract
Each source adapter implements `SourceAdapter`:
```typescript
export interface SourceAdapter {
  readonly sourceSystem: string;
  discover(boardId: string): AsyncIterableIterator<SourceOpportunity>;
}
```

### Normalization Pipeline
1. **Raw Ingestion**: Adapters fetch public endpoints using native `fetch` with `AbortSignal.timeout(30000)` and `User-Agent: Rolevia/open-career-agent`.
2. **Provenance Preservation**: `SourceOpportunity` captures `sourceSystem`, `sourceExternalId`, `sourceUrl`, `rawPayload`, and `observedAt`.
3. **Canonical Normalization**: `OpportunityNormalizer` converts raw ATS payloads into `NormalizedOpportunity` (`title`, `organization`, `content`, `location`, `workModel`, `employmentType`). Missing attributes remain explicitly `undefined` (never fabricated).
4. **Fingerprint Hashing**: SHA-256 hash of normalized content determines whether a new `OpportunitySnapshot` must be appended.

---

## 4. Source Identity & Cross-Source Deduplication Policy

### Source Listing Identity
Within a single source provider, the composite tuple `(sourceSystem, sourceExternalId)` uniquely and deterministically identifies a `source_listing`. This is enforced at the persistence layer via SQLite unique index `source_listings_system_ext_idx`.

### Repeated Observations
Rediscovering the same external listing attaches a new `source_observation` record to the existing `source_listing`. If the normalized snapshot fingerprint matches the latest snapshot, no duplicate `Opportunity` or `OpportunitySnapshot` is created.

### Cross-Source Deduplication Policy (V1)
Cross-source listings link to one canonical `Opportunity` only when they share deterministic strong identity evidence: a normalized employer-hosted canonical application/job URL, or an explicit requisition identifier scoped by a canonical employer domain. Provider-hosted ATS URLs and `(sourceSystem, sourceExternalId)` identify a source listing but never establish identity across providers.

Title, displayed organization, location, and work model are weak evidence. They never cause a merge. Normalized role and location are collision guards: conflicting values keep listings separate even when a strong key collides. Existing source-listing associations remain stable when a provider later changes or removes a URL. Ambiguous claims remain separate and do not take ownership of a contested identity key.

Every linked provider retains its own `source_listing`, immutable observations, raw payload, URL, and timestamps. An unchanged canonical snapshot is linked to each supporting observation, so deduplication does not discard provenance. Historical rows are not backfilled or merged from weak evidence; new or updated observations participate in resolution.

See [ADR-009](../adrs/ADR-009-conservative-canonical-opportunity-identity.md) for the exact hierarchy and collision policy.

---

## 5. Candidate & Intelligence Isolation Invariants

1. **Candidate Match Isolation**: Multiple candidates discovering the same external job listing share ONE canonical `Opportunity` record, but each candidate receives an independent `DiscoveryMatch`, `Evaluation`, `Decision`, and `Application`.
2. **Intelligence Non-Influence**: `SearchTarget` match preferences (keywords, location preferences, role targets) determine candidate discovery inclusion but **MUST NOT** alter `Eligibility`, `Fit`, `Quality`, or `Decision` evaluations.
3. **Source Neutrality Invariant**: Equivalent `OpportunitySnapshot` inputs from different ATS providers yield identical `Eligibility`, `Fit`, `Quality`, and `Decision` evaluations.

---

## 6. Honest Source Failure & Error Semantics

- **Network / API Failures**: If an ATS API returns HTTP 4xx/5xx or encounters network failure, the discovery run records the error summary and sets `status: 'FAILED'`.
- **Empty Boards**: An empty job board (0 listings) completes cleanly with `status: 'COMPLETED'` and `discoveredCount: 0`. It is never reported as a failure.
- **Malformed Payloads**: Individual malformed items increment `rejectedCount` with reason `MALFORMED_PAYLOAD` without aborting valid listings.

---

## 7. How to Add a New Source Adapter in V2

To add a new ATS adapter (e.g., Workday or SmartRecruiters):
1. Implement `SourceAdapter` in `packages/sources/src/<name>/adapter.ts`.
2. Implement `OpportunityNormalizer` in `packages/sources/src/<name>/normalizer.ts`.
3. Register the provider in `packages/sources/src/registry.ts`.
4. Add the canonical name to `SOURCE_SYSTEMS` in `@oca/domain` and `SourceSystemSchema` in `@oca/schemas`.
5. Add unit tests for discovery and normalization.
