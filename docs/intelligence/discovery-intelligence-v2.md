# Discovery Intelligence V2 architecture

Status: proposed for implementation  
Scope: requirement extraction and its provenance boundary  
Out of scope: new source adapters, UI redesign, direct model decisions, and changes to current evaluation outcomes

### V2.1 compatibility rollout

V2.1 implements the persistence and lineage foundation with a dual-path rollout. A
candidate-independent `requirements.extract` task runs after snapshot persistence,
stores an immutable Requirement Set, and passes its identity to the existing
candidate-specific evaluation workflow. Eligibility and Fit continue to run their
V1 extractors independently in V2.1 so their outcomes do not change; consuming the
persisted Requirement Set is deferred to V2.5.

The compatibility mapper preserves V1 modalities as follows:

| V1 output | Canonical strength | Evaluation use | Actionability |
| --- | --- | --- | --- |
| Eligibility mandatory | Required | Eligibility | Hard-constraint safe |
| Eligibility preferred | Preferred | Context only | Review only |
| Eligibility ambiguous | Contextual | Context only | Review only |
| Fit required | Required | Fit | Fit-signal safe |
| Fit preferred | Preferred | Fit | Fit-signal safe |
| Fit optional | Contextual | Context only | Review only |

This is a compatibility description, not broader extraction approval. It records
only constraints already emitted by the V1 deterministic extractors. V2.1 makes no
model calls and persists no Requirement Candidates because ambiguous proposals are
not yet being generated. Provenance is limited to the linked source observation,
snapshot, a normalized `title`, `location`, or `content` section, and the strongest
honest excerpt available from the flattened V1 snapshot. Raw provider field paths
and exact offsets remain absent when V1 cannot establish them reliably.

### V2.2 rich listing documents

V2.2 retains the legacy `NormalizedOpportunity` projection and hash for snapshot
compatibility, while adding a versioned `NormalizedListingDocument` beside it.
The document contains bounded, ordered prose, list-item, and structured-value
fragments. Each fragment records its provider-neutral semantic section when known,
original heading, exact raw provider field path, stable fragment identity, source
order, and deterministic truncation state.

Provider mapping remains confined to `packages/sources`:

| Provider | Preserved V2.2 inputs |
| --- | --- |
| Ashby | structured title/team/department, HTML/plain description, primary and secondary locations, workplace type, employment type, and public compensation summary |
| Lever | opening/body/additional variants, labelled structured lists, team/department, location/all-location/country fields, workplace type, commitment, and salary range; legacy description is retained only as a fallback when richer body fields are absent |
| Greenhouse | structured title/location/department/office/metadata plus headings, prose, and list items from the public content body |

The `requirements-v2.2-rich-document` pipeline now uses
`requirements-deterministic-v2.3.1`. It extracts only from these provider-neutral
fragments, merges semantically identical requirements while preserving independent
provenance, treats structural preferred/required headings as modality evidence,
keeps alternatives disjunctive, and rejects positive extraction from common
negations. Explicit consequential constraints pass category-specific deterministic
checks; broad remote labels and contradictory or equivalent-experience wording
remain contextual/review-only. Years of experience remains a Fit signal.

V2.2 does not interpret arbitrary skills outside its bounded vocabulary, resolve
complex nested boolean language, infer jurisdictions from vague geography, or
create Requirement Candidates. It records `PARTIAL` when deterministic document,
requirement, or provenance bounds truncate output. Exact raw offsets remain absent
when markup normalization makes them unreliable.

## 1. Problem statement

Discovery V1 reliably retrieves, normalizes, deduplicates, persists, and evaluates public Ashby, Lever, and Greenhouse listings. Its limiting factor is not retrieval breadth. Requirement extraction is performed independently inside the Eligibility and Fit engines, is intentionally narrow, and is not persisted as a candidate-independent domain artifact.

The V2 objective is to turn more heterogeneous listing evidence into immutable, structured, provenance-backed requirements that the deterministic Eligibility and Fit engines can consume safely. An uncertain interpretation must never become a fact or a hard blocker merely because a model proposed it.

## 2. Current repository-grounded pipeline

The current path is:

1. `packages/sources` adapters return `SourceOpportunity` with provider identity, URL, raw JSON payload, observation time, and sometimes provider update time.
2. Provider normalizers reduce that payload to `NormalizedOpportunity`: title, organization, content, location, work model, employment type, and compensation.
3. `apps/worker/src/discovery/workflow.ts` persists provider-local `source_listings`, immutable fingerprinted `source_observations`, canonical `opportunities`, append-only `opportunity_snapshots`, and snapshot-to-observation links. Search-target filtering occurs before opportunity persistence for rejected records.
4. The worker enqueues `eligibility.evaluate` for an accepted snapshot and candidate.
5. `EligibilityEngine` calls `EligibilityConstraintExtractor` in-process. Its constraint shape has dimension, requirement, mandatory/preferred/ambiguous modality, scope, source text, and extraction method. The workflow persists only resulting findings; it currently drops the extracted constraint object and its evidence references.
6. The same evaluation proceeds to `fit.evaluate`. `FitEngine` calls `FitRequirementExtractor` in-process. Its requirements cover technical skill, tool/platform, programming language, specialization, experience depth, seniority, domain, project relevance, architecture, cloud/DevOps, and data/database. Modality is required/preferred/optional. The workflow persists Fit findings plus an `opportunity-requirement` Evidence row containing the source fragment, but the source reference identifies only the snapshot, not an observation field or source span.
7. `quality.evaluate` inspects snapshot and observation metadata independently and persists Quality findings/evidence.
8. `decision.evaluate` consumes the three persisted assessments, applies Eligibility-first precedence, persists reason codes, and links reasons to decisive findings.
9. `apps/api/src/app.ts` reconstructs the latest candidate-specific snapshot evaluation and finding evidence using TypeBox response schemas in `packages/schemas/src/opportunity.ts`.
10. The web repository maps that projection for Overview, Discover, Matches, and Opportunity Detail. The frontend does not calculate canonical intelligence.

### Current deterministic boundaries

- Network retrieval is provider-specific; identity, normalization, matching, extractors, evaluations, and decisions are deterministic.
- There is no implemented `packages/providers` or callable model-provider adapter. Provider-neutral AI boundaries exist in architecture documents only.
- Search preferences determine discovery inclusion but do not influence Eligibility, Fit, Quality, or Decision.
- Candidate claims and their Evidence are loaded only for candidate-specific evaluation, after candidate-independent opportunity persistence.

### Where information is lost or underused

- `NormalizedOpportunity.content` is one flattened string with no section, field-path, or offset map back to the raw payload.
- Lever normalization uses `descriptionPlain` and ignores separately available `lists`, `additionalPlain`, `openingPlain`, `descriptionBodyPlain`, `country`, and `categories.allLocations`. In the accepted records, those ignored fields contain substantially more text than the normalized content.
- Ashby secondary locations, address structure, publication time, team, and department are retained in raw observations but are mostly absent from snapshots.
- Greenhouse department/office and other structured payload fields are not represented by the current normalized contract.
- Eligibility source text is sometimes synthesized or replaced with the entire listing, and Eligibility finding persistence loses requirement text and observation-level provenance.
- Fit retains the matched fragment but only references `snapshot:<id>`; it has no raw field path, offsets, excerpt hash, or source-observation identity.
- Extraction confidence is not a probability and is currently coarse. Fit extraction produces high confidence for accepted deterministic matches; Eligibility accepts string-valued extraction methods but does not persist them.
- Requirements exist only transiently inside engine calls. They cannot be audited, re-used across candidates, independently re-extracted, or compared between extractor versions.
- Rejected discovery records are represented only by aggregate counts and reason buckets.

## 3. Structural analysis of the three acceptance opportunities

This analysis uses listing structure and extractor output only. It does not inspect or reproduce private candidate evidence.

### Ashby / PostHog

- The normalized description is long and preserves requirement-bearing prose.
- Two fragments contain both a recognized requirement cue and recognized bounded technical terms.
- The V1 Fit extractor therefore emits two required requirements: one programming-language alternative and one data/database alternative.
- The current candidate evaluation can compare those requirements with supported claims, producing real Fit findings.
- No safely recognized hard Eligibility constraint is emitted, so Eligibility remains Investigate rather than Eligible.

### Lever / Metabase Backend

- The normalized content contains recognized technical terms, but no fragment contains both a term and one of V1's requirement cues.
- The raw Lever observation also contains `lists`, `additionalPlain`, `openingPlain`, `descriptionBodyPlain`, `country`, and all-location data that the normalizer does not incorporate into the canonical snapshot.
- The Fit extractor therefore emits no deterministic requirements. Weak Fit currently means insufficient extracted requirements, not demonstrated candidate weakness.
- Lever's structured location and workplace type do reach the snapshot. The Eligibility extractor treats remote plus a non-worldwide location string as a mandatory location constraint, so an unresolved location finding is created.

### Lever / Metabase Frontend

- The normalized content has recognized terms but no V1 requirement-cue fragment.
- Four structured Lever list sections, with materially more text than the normalized description, remain only in the raw observation.
- The Fit extractor consequently emits no requirements.
- The same structured remote/location rule produces the Eligibility uncertainty.

### Root-cause classification

| Layer | Finding |
| --- | --- |
| Source data | All three providers supplied usable public data. Lever supplied richer structured sections than V1 consumed. This dataset does not demonstrate a retrieval failure. |
| Normalization | Material Lever sections and structured geography are discarded. Flattening removes field/section provenance. This is a primary Metabase cause. |
| Extraction | The bounded vocabulary and same-fragment cue rule miss headings, list semantics, prose without canonical cues, unrecognized skills, and cross-fragment context. This is the other primary cause. |
| Candidate evidence | Candidate evidence was sufficient for the requirements that were actually extracted. It cannot be blamed for requirements that never existed. |
| Evaluation | The Fit engine behaves consistently with its input. Its `weak` result currently conflates insufficient listing requirements with assessed weak alignment; that presentation/domain ambiguity should be evolved deliberately, not patched during extraction design. |

## 4. Canonical requirement model

V2 should add a candidate-independent `RequirementSet` produced from one immutable Opportunity Snapshot. Evaluations reference the set they consumed. Do not store canonical requirements only as evaluation findings.

### Requirement set

```ts
interface RequirementSet {
  id: RequirementSetId;
  snapshotId: SnapshotId;
  inputFingerprint: string;
  extractorPipelineVersion: string;
  deterministicExtractorVersion: string;
  modelCapabilityVersion?: string;
  status: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  deterministicStatus: 'SUCCEEDED' | 'FAILED';
  assistedStatus: 'NOT_REQUESTED' | 'SUCCEEDED' | 'UNAVAILABLE' | 'REJECTED' | 'FAILED';
  createdAt: Date;
}
```

`PARTIAL` means deterministic canonical requirements remain valid while an optional stage was unavailable or rejected. It does not authorize a complete-looking result.

### Canonical requirement

```ts
interface CanonicalRequirement {
  id: RequirementId;
  requirementSetId: RequirementSetId;
  category:
    | 'TECHNICAL_SKILL' | 'EXPERIENCE' | 'SENIORITY' | 'EDUCATION'
    | 'LOCATION' | 'RESIDENCY' | 'TIMEZONE' | 'WORK_MODEL'
    | 'WORK_AUTHORIZATION' | 'SPONSORSHIP' | 'LANGUAGE'
    | 'EMPLOYMENT_TYPE' | 'COMPENSATION' | 'DOMAIN_EXPERIENCE'
    | 'CERTIFICATION' | 'EXCLUSION' | 'OTHER';
  normalizedKey: string;
  value: RequirementValue; // category-discriminated, schema-validated value
  statement: string;
  strength: 'REQUIRED' | 'PREFERRED' | 'CONTEXTUAL';
  polarity: 'REQUIRES' | 'PERMITS' | 'EXCLUDES' | 'UNAVAILABLE';
  assertionBasis: 'EXPLICIT_STRUCTURED' | 'EXPLICIT_TEXT' | 'INTERPRETED';
  evaluationUse: 'ELIGIBILITY' | 'FIT' | 'CONTEXT_ONLY';
  actionability: 'HARD_CONSTRAINT_SAFE' | 'FIT_SIGNAL_SAFE' | 'REVIEW_ONLY';
  extractionConfidence: 'HIGH' | 'MODERATE' | 'LOW';
  extractorId: string;
  extractorVersion: string;
  canonicalHash: string;
  createdAt: Date;
}
```

Uncertainty is not a requirement strength. Ambiguous or conflicting proposals belong in `RequirementCandidate`, with states such as `UNRESOLVED`, `CONFLICTING`, `REJECTED`, or `PROMOTED`, until validation can safely promote them. This keeps `UNKNOWN` as an assessment of knowledge rather than treating it as a weaker synonym for required/preferred.

Category values must be discriminated schemas. Examples include skill identity/aliases, minimum years and focus, geographic scopes, UTC offset ranges, language/proficiency, compensation amount/currency/period, and education/certification identity. Free-form `OTHER` values are always review-only until a versioned deterministic rule recognizes them.

### Provenance

Every accepted requirement has at least one provenance link:

```ts
interface RequirementProvenance {
  requirementId: RequirementId;
  sourceObservationId: SourceObservationId;
  snapshotId: SnapshotId;
  sourceFieldPath: string;       // e.g. $.lists[2].content
  normalizedSection?: string;   // e.g. requirements, location
  startOffset?: number;
  endOffset?: number;
  excerpt: string;
  excerptHash: string;
  locatorVersion: string;
}
```

Offsets refer to a versioned normalized field value, not mutable rendered HTML. The raw observation remains authoritative. Multiple observations may support the same snapshot requirement.

Model-call provenance, if introduced, is separate from requirement provenance and records provider/model, capability version, prompt/template version, referenced input hashes, timestamps, result state, and safe failure metadata. Model confidence is never Evidence.

## 5. Layered extraction pipeline

1. **Provider field mapping** — normalizers emit a richer provider-neutral document with typed fields and ordered sections, plus a source map to observation JSON paths.
2. **Deterministic normalization** — decode markup, preserve headings/list boundaries, normalize whitespace and common enumerations, and retain offsets/source paths. Never infer missing facts here.
3. **Deterministic extraction** — apply category-specific, versioned rules to structured fields and local section context. Produce canonical requirements only when rules pass.
4. **Candidate generation** — retain ambiguous phrases, contradictions, unknown terms, and unsupported categories as requirement candidates. They cannot affect Eligibility or Fit.
5. **Optional model-assisted proposal** — send only bounded listing sections and source locators through a provider-neutral capability. Output is a schema-validated proposal, never canonical state.
6. **Grounding validation** — require every proposed statement/value to be entailed by a cited span, verify offsets/hash, reject unsupported values, detect contradictions, and downgrade consequential interpretations to review-only.
7. **Canonicalization** — normalize aliases, merge only semantically identical requirements within a set, preserve all supporting provenance, and persist conflicts rather than choosing silently.
8. **Evaluation handoff** — Eligibility and Fit receive the persisted Requirement Set and record its ID/fingerprint in the Evaluation.

### Provider-neutral assisted capability

Create the provider boundary only when V2.4 begins. Domain code should depend on a capability shaped like:

```ts
interface RequirementInterpretationProvider {
  propose(input: BoundedListingDocument): Promise<
    | { kind: 'success'; proposals: RequirementProposal[]; call: ModelCallProvenance }
    | { kind: 'unavailable' | 'failed'; retryable: boolean; safeReason: string }
  >;
}
```

Provider types, prompts, credentials, and raw responses stay outside domain/intelligence packages. The provider receives no candidate profile: extraction is candidate-independent. It has no tools, browser access, source credentials, or authority to persist requirements, evaluate the candidate, or issue a Decision.

## 6. Consequential-requirement safety rules

A requirement may be `HARD_CONSTRAINT_SAFE` only when all conditions hold:

1. Its category is on a reviewed consequential-category allowlist.
2. It is explicit, required, and unambiguous in either a documented structured field or a quoted source span.
3. Polarity and scope are deterministically resolved.
4. At least one observation-level provenance link verifies successfully.
5. No same-snapshot source evidence materially contradicts it.
6. A category-specific deterministic validator accepts it.
7. The rule and extractor versions are persisted.

Model-only interpretation can never satisfy these conditions. It remains `REVIEW_ONLY` until supported by a deterministic verifier or confirmed by a human against retained source evidence.

Category rules:

- **Work authorization/citizenship/residency:** require explicit mandatory wording and exact normalized jurisdiction. Silence stays Unknown.
- **Sponsorship unavailable:** require explicit negative policy. It blocks only when current supported candidate evidence establishes sponsorship need. Candidate silence prompts Investigate.
- **Location:** a broad location label or `Global Remote` is not by itself a strict residency gate. Blocking requires explicit restrictive wording, normalized scope, and no relocation/future-location allowance. Otherwise Investigate.
- **Timezone:** normalize explicit UTC ranges or named-zone overlap. Vague collaboration language is contextual/review-only.
- **Education/certification/language:** required wording and exact credential/proficiency are necessary. Equivalent credentials are not inferred. Missing candidate evidence is Unknown/Investigate, not a failed fact.
- **Years of experience:** extract explicit numeric minimum and focus. Use as a Fit requirement by default. It becomes an Eligibility blocker only if product policy later approves that meaning and the listing explicitly excludes candidates below the threshold; otherwise a shortfall is a Fit gap or investigation point.
- **Contradictory listing text:** persist conflicting candidates, emit no hard constraint, and keep Eligibility Investigate.

## 7. Fit integration

- Candidate claims and candidate Evidence remain the only candidate truth boundary.
- Requirements are extracted without candidate data, then compared with current claims.
- `SUPPORTED` may establish a match; `INFERRED` remains partial; `UNKNOWN` and `CONFLICTING` preserve uncertainty; `UNSUPPORTED` is not silently converted into a universal negative.
- Absence of candidate evidence produces `NO_EVIDENCE` or `UNKNOWN`, never an invented gap.
- Required, preferred, and contextual requirements remain distinct. Contextual requirements do not lower the candidate's Fit.
- Transferability remains a versioned, directional allowlist or a review-only proposal. It never becomes exact experience.
- There is no blended numeric match score.

V2 should stop using `weak` to describe a listing for which no safe Fit requirements exist. The recommended evolution is a separate assessment status:

```ts
type FitAssessmentStatus = 'ASSESSED' | 'INSUFFICIENT_LISTING_REQUIREMENTS';
type FitLevel = 'strong' | 'moderate' | 'weak'; // present only when ASSESSED
```

This preserves the meaning of `weak` as an actual evaluated alignment level while making insufficient extraction explicit. It is an API/domain change and belongs in V2.5 after migration and compatibility tests; it must not be smuggled into V2.1.

## 8. Persistence, versioning, and reevaluation

Add equivalent SQLite and PostgreSQL tables for:

- `requirement_sets`
- `canonical_requirements`
- `requirement_provenance`
- `requirement_candidates`
- optional `requirement_model_calls`

Add nullable `requirement_set_id` and `requirement_input_fingerprint` to Evaluations during compatibility rollout. Do not alter or delete historical Evaluation findings.

Idempotency rules:

- Requirement Set uniqueness: `(snapshot_id, extractor_pipeline_version, input_fingerprint)`.
- Requirement uniqueness within a set: `(requirement_set_id, canonical_hash)`.
- Provenance uniqueness: `(requirement_id, source_observation_id, source_field_path, start_offset, end_offset, excerpt_hash)`.
- The input fingerprint includes snapshot fingerprint, ordered observation fingerprints/source-map version, deterministic extractor version, validator version, and assisted capability version/config when requested.

When an extractor version changes, enqueue `requirements.extract` for existing current snapshots. Append a new Requirement Set; never mutate the prior set. If its canonical fingerprint differs—or the evaluation did not reference this set—enqueue a new Eligibility evaluation, followed by Fit, Quality reuse/recheck as appropriate, and Decision. Existing Evaluation supersession preserves history.

A provider outage yields a `PARTIAL` set containing deterministic requirements and an observable assisted status. Retrying can create or complete an idempotent run, but it cannot rewrite previously consumed sets. A final validated set with different content triggers a new evaluation lineage.

## 9. Auditability

The answer to “Why did Rolevia think this job required X?” must traverse:

`Decision reason -> Evaluation finding -> Canonical requirement -> Requirement provenance -> Source observation -> Source listing`

The API should eventually expose safe requirement summaries, basis, strength, actionability, extractor version, and cited public listing fragment adjacent to the finding. Raw provider payloads remain server-side.

The 21st.dev research suggests two useful conceptual patterns only:

- inline citation markers adjacent to a conclusion, backed by a full reference list;
- expandable audit-ledger rows with status, actor/source, time, and contextual detail.

Rolevia should adapt these as accessible, keyboard-reachable source references and progressive disclosure. Hover-only citation tooltips, animated observability tables, document-coordinate bounding boxes, and generic status-pill-heavy audit UIs are inappropriate for the current text-listing model. No 21st.dev component should be installed for V2 architecture work.

### Rejected discovery observations

V1 aggregate rejection counts are insufficient for diagnosing normalization or matching false negatives. A later, bounded observability milestone should persist a privacy-safe rejection record containing run ID, source system, source external ID or hashed stable reference, observation fingerprint, rejection code, matcher version, and timestamps. Retaining the full rejected raw payload should require an explicit retention/privacy decision. This is not required for V2.1 requirement persistence because rejected records do not yet have snapshots.

## 10. Privacy-safe evaluation corpus

Create synthetic public-listing fixtures and synthetic candidate profiles. Never derive candidate fixtures from local real-candidate data. Each case defines source document structure, expected requirement set/candidates, expected provenance, and—only where justified—expected Eligibility/Fit behavior.

| Case | Expected extraction | Expected downstream behavior |
| --- | --- | --- |
| Explicit required skill | Required explicit-text skill with span | Fit compares current evidence |
| Preferred skill | Preferred explicit-text skill | Cannot create a required gap |
| Ambiguous skill mention | Unresolved/contextual candidate | No Fit penalty |
| Years of experience | Numeric minimum plus focus | Fit duration comparison; not automatic blocker |
| Remote, country-restricted | Required location/residency only with explicit restriction | Unknown candidate scope -> Investigate |
| Timezone restriction | Normalized explicit range | Unknown overlap -> Investigate |
| Sponsorship available | Explicit permission | Never a blocker |
| Sponsorship unavailable | Explicit negative policy | Block only with supported sponsorship need |
| Sponsorship unstated | No canonical policy requirement | Unknown preserved |
| Education required | Required credential, exact span | Missing candidate fact -> Investigate |
| Education preferred | Preferred credential | Fit context, never Eligibility blocker |
| Language required | Required language/proficiency | Missing candidate fact -> Investigate |
| Certification required | Required exact certification | Missing candidate fact -> Investigate |
| Explicit seniority | Required title/section seniority | Deterministic rank comparison where known |
| Ambiguous seniority | Review-only candidate | No deterministic gap |
| Compensation | Structured/text value with currency and period | Context/Quality; no candidate-fit inference |
| Malformed listing | Failed normalization/extraction with typed reason | No fabricated requirement/evaluation |
| Sparse listing | Empty or contextual set | Fit insufficient-listing state; Eligibility Unknown/Investigate |
| Contradictory listing | Conflicting candidates with both spans | No hard blocker; Investigate |
| Requirements in prose | Local sentence/paragraph provenance | Extract only validated explicit statements |
| Structured ATS requirements | Typed field path and span/value provenance | Same canonical semantics across providers |
| Negated skill requirement | No required skill | Regression against false positive |
| Alternatives (`X or Y`) | One alternative-group requirement | Either supported alternative can satisfy it |
| Multiple observations | One canonical requirement with multiple provenance links | No duplicate requirement |
| Provider unavailable | Deterministic set persists as Partial | No fabricated completion; retryable status |

The harness should report confusion matrices by category and basis from human-labelled expected sets, plus provenance-validity, schema, idempotency, and safety-invariant failures. Do not publish an aggregate “accuracy” number until sampling, labels, and denominator are defined.

## 11. V2 success criteria

1. Every accepted requirement passes its category schema and has verified observation-level provenance.
2. Every explicit deterministic corpus requirement is measured per category as true positive, false positive, and false negative; no unsupported aggregate percentage is claimed.
3. No model-only or ambiguous proposal can become a hard Eligibility constraint.
4. Silence, ambiguity, conflicting text, missing candidate evidence, and provider failure preserve Unknown/Investigate semantics.
5. Re-running the same pipeline version/input produces the same Requirement Set identity/content and no duplicate rows.
6. A new extractor version appends a new set and Evaluation lineage without mutating history.
7. Equivalent structured meaning from Ashby, Lever, and Greenhouse produces equivalent canonical requirement semantics.
8. Deterministic extraction and evaluation pass without any configured model provider.
9. Assisted output is schema-validated, span-grounded, independently validated, and safely rejected on failure.
10. Decision explanations can be traversed to a finding, requirement, exact public source fragment, source observation, and extractor version.
11. Sparse/malformed inputs produce typed partial/failed states and no fabricated requirements.
12. Candidate isolation remains unchanged: requirement sets contain no candidate IDs or candidate Evidence.

## 12. Ordered implementation milestones

### V2.1 — canonical Requirement Set and provenance foundation

- Add domain IDs/types and TypeBox schemas.
- Add SQLite/PostgreSQL parity migrations and repositories.
- Add `requirements.extract` task and a compatibility extractor that maps existing V1 extractor output into canonical records.
- Pass persisted requirements into compatibility evaluation paths behind tests, proving current outcomes do not change.
- Add lineage, idempotency, and provenance traversal tests.

Likely modules: `packages/domain/src`, `packages/schemas/src`, `packages/database/src/schema*.ts`, database migrations/repositories, `packages/intelligence/src/{eligibility,fit}`, `apps/worker/src/main.ts`, and a new `apps/worker/src/requirements` workflow.

### V2.2 — richer provider-neutral listing document and deterministic extraction

- Extend source-normalizer output with ordered sections and observation source maps.
- Consume Lever lists/additional/opening/country/all-locations and equivalent Ashby/Greenhouse structured fields.
- Add category-specific extractors, contradiction handling, alternatives, and consequential validators.
- Preserve current snapshot identity rules and provider-neutral downstream behavior.

Likely modules: `packages/sources/src/core`, all three provider normalizers/tests, `packages/intelligence/src/requirements`, worker requirement tests, and source-neutrality invariants.

### V2.3 — corpus and evaluation harness

- **Implemented as `requirements-corpus-v0.1`.** The versioned synthetic corpus contains provider-specific and provider-neutral inputs with independently labelled `MUST_EXTRACT`, `MUST_NOT_EXTRACT`, and `MAY_REMAIN_UNRESOLVED` ground truth.
- The deterministic harness reports per-category TP/FP/FN, semantic mismatch dimensions, provenance and duplication failures, consequential safety failures, unknown-preservation failures, and Ashby/Lever/Greenhouse semantic equivalence.
- A separate reviewed `requirements-deterministic-v2.2` baseline records known misses and unsafe outputs without changing ground truth or production extraction.
- `pnpm requirements:evaluate` emits maintainable case diagnostics; `pnpm requirements:evaluate -- --json` emits the full machine-readable report. The standard intelligence test suite gates corpus validity and baseline drift.

Implemented modules: `packages/intelligence/src/requirements/evaluation`, the intelligence package developer command, and `docs/implementation/testing-strategy.md`.

#### V2.3 contributor guide

`corpus-v0.1.ts` is the human-reviewable and machine-readable synthetic corpus. Its version is independent of both `listing-document-v2.2` and `requirements-deterministic-v2.2`. A case has a stable ID, synthetic provider payload or normalized document, labelled expectations, provenance constraints, coverage tags, rationale, a consequential flag, and optional equivalence/truncation expectations.

Ground truth has three dispositions:

- `MUST_EXTRACT` means sufficient deterministic source evidence exists and defines the full expected canonical semantic value.
- `MUST_NOT_EXTRACT` marks a false or unsafe extraction; selected cases explicitly assert Unknown preservation.
- `MAY_REMAIN_UNRESOLVED` marks ambiguity, contradiction, or meaning the deterministic representation cannot preserve safely. Review-only output is permitted, but actionable output is a failure.

Run `pnpm requirements:evaluate` for a concise category summary followed by failing-case expected/actual diagnostics. Run `pnpm requirements:evaluate -- --json` for the complete JSON report. The report derives precision and recall only from explicit per-category TP/FP/FN counts and intentionally omits an aggregate accuracy score.

Safety is independent of general extraction metrics. `UNSAFE_HARD_CONSTRAINT` validates the explicit, required, non-contradictory, provenance-backed category policy. `FALSE_CONSEQUENTIAL_EXTRACTION` identifies unmatched output in consequential categories. Unknown-preservation and unresolved-actionability failures are reported separately.

To add a case, use only synthetic listing content, label the canonical semantic expectation and provenance path, explain the label, add the relevant coverage tags, and mark every consequential case with `safety`. Corpus meta-tests validate IDs, semantics, normalized provider shape, contradiction labelling, duplicate expectations, requested coverage, three-provider equivalence groups, and private-marker exclusion.

Versioned baseline JSON files record reviewed extractor output, not ground truth or production targets. The V2.2 baseline remains historical; V2.3.1 is current. After an intentional extractor change, review case diagnostics against ground truth first. Change a label only if the label itself is wrong; then add or update the corresponding versioned baseline after semantic review. A blanket snapshot update is never sufficient approval.

### V2.3.1 — deterministic extraction safety hardening

V2.3.1 keeps `requirements-corpus-v0.1` unchanged and records a separate `requirements-deterministic-v2.3.1` baseline. The previous V2.2 baseline remains historical evidence rather than being overwritten.

The deterministic extractor now distinguishes explicit residence from generic work location; treats unrepresentable equivalence, certification alternatives, and mixed boolean technology expressions as review-only; scopes technical negation by sentence; and neutralizes contradictions at the affected semantic requirement instead of every requirement in a category. Negated contradiction evidence remains linked as provenance when a positive and negative assertion conflict.

Before any draft retains `HARD_CONSTRAINT_SAFE`, a final defense-in-depth boundary verifies that the category permits hard actionability, strength and evaluation use are consistent, source assertion/provenance inputs exist, confidence is high, polarity passes category rules, and no negation or unresolved alternative/equivalence remains. Rejected hard actionability is downgraded to contextual review rather than silently becoming a blocker.

### V2.4 — optional provider-neutral assisted proposal boundary

- **Implemented without a vendor adapter.** `RequirementProposalProvider` is a narrow capability port; an unavailable provider and deterministic fixed test provider prove that no configured model or network call is required. Vendor SDK types, credentials, raw prompts, and raw responses do not enter domain or persistence contracts.
- The versioned request contains only selected public normalized listing fragments. Selection excludes confidently handled and duplicate fragments, benefits, and recognized instruction-like listing text, then enforces 12-fragment, 1,200-character-per-fragment, and 8,000-character total bounds. Candidate profiles, claims, Evidence, applications, Decisions, and Search Preferences are absent by construction.
- `requirement-proposal-schema-v1` accepts only strict structured proposals. The versioned instruction contract tells providers to preserve ambiguity, alternatives, and negation; treat listing text as data; cite exact excerpts; and never evaluate a candidate or assign a hard blocker.
- Deterministic grounding resolves every cited fragment, verifies exact excerpt containment and reproducible hashes, checks lexical/structured support, modality, polarity, negation, alternatives, assertion basis, candidate-specific content, instruction-like text, and same-input contradictions. Invalid structured output is not recovered heuristically.
- Model-originated output is persisted only as immutable `RequirementCandidate` and bounded assistance-run metadata. Rejected proposals may retain their structured fields, short rationale, rejection categories, and valid source excerpts; raw requests/responses and hidden reasoning are not stored. Candidate/source/run identity includes the set, input fingerprint, provider capability, proposal schema, instruction, selection, and grounding versions.
- Consequential proposals are capped at `REVIEW_ONLY`; only reviewed Fit categories may retain a `FIT_SIGNAL_SAFE` ceiling. The schema, domain type, repository guard, and database constraint make `HARD_CONSTRAINT_SAFE` unavailable to model-only proposals. Candidates are not appended to Canonical Requirements and do not feed Eligibility, Fit, Quality, or Decision.
- Unconfigured, unavailable, failed, timed-out, malformed, empty, or fully rejected assistance leaves deterministic V2.3.1 requirements authoritative. Attempted incomplete assistance is recorded as a Partial set with bounded reason/count metadata. With no provider supplied, the existing V2.3.1 pipeline identity and `NOT_REQUESTED` behavior remain unchanged.
- `pnpm requirements:evaluate:assisted` runs fixed, network-free experimental proposals separately from `pnpm requirements:evaluate`. It reports proposal, grounding, rejection, novelty, duplication, consequential, unsafe-promotion, and recall-delta counts without blending them into deterministic accuracy.

Known limitations: there is no real vendor adapter, semantic embedding, arbitrary ontology expansion, or model retry scheduler. Lexical grounding is deliberately conservative and can reject valid paraphrases. Recognized prompt-injection phrases are bounded structural defenses, not a claim of complete prompt-injection prevention. Candidate review/promotion and evaluator consumption remain V2.5 work.

### V2.5 — grounding, validation, and safe engine integration

- Extend the V2.4 conservative grounding rules only where reviewed semantics require it.
- Add an explicit human/deterministic promotion workflow, create new immutable sets, and trigger reevaluation.
- Introduce Fit assessment status separately from Fit level, with API/web compatibility migration.
- Expose requirement provenance through API; make only necessary semantic UI changes.

Likely modules: `packages/intelligence`, database repositories/schema, Eligibility/Fit/Decision workflows and fingerprints, `packages/schemas/src/opportunity.ts`, `apps/api/src/app.ts`, and focused web opportunity projections.

### V2.6 — controlled real-source acceptance

- Re-extract selected current Ashby/Lever/Greenhouse snapshots without candidate-data logging.
- Compare V1 and V2 sets/outcomes, inspect false positives and new unknowns, and verify complete lineage/source traversal.
- Enable V2 as default only after corpus and controlled acceptance pass.

Likely modules: acceptance scripts outside tracked private data, invariant/E2E tests, and an architecture decision record documenting rollout.

### V2.7 — rejected-observation diagnostics (separate decision)

- If approved, add bounded rejection records, retention rules, and operational projections.
- Do not retain rejected raw payloads by default.

## 13. Risks and non-goals

Risks:

- False hard blockers from interpreted language.
- Source-span drift after lossy HTML normalization.
- Provider-specific semantics leaking into canonical requirements.
- Duplicate or unstable requirements after version changes.
- Prompt injection/data exfiltration from untrusted listings.
- Cost/latency and non-determinism in assisted extraction.
- Migration complexity while V1 evaluations remain current.
- Treating extraction breadth as proof of correctness.

Explicit non-goals:

- Adding job sources before improving current-source understanding.
- Letting an LLM evaluate candidate truth or issue Decisions.
- Generating candidate claims from listings.
- Replacing Eligibility, Fit, Quality, or Decision with a score.
- Auto-application or other consequential automation.
- UI redesign.
- Rewriting historical snapshots, findings, or decisions.
- Copying local candidate data into tests, prompts, fixtures, logs, or documentation.

## 14. Decisions requiring approval before implementation

1. Approve a candidate-independent immutable Requirement Set as a new canonical domain artifact rather than extending evaluation findings alone. **Recommended: approve.**
2. Approve `strength` and `assertionBasis` as separate axes, with ambiguity represented as a proposal state rather than an `UNKNOWN` strength. **Recommended: approve.**
3. Approve the conservative rule that explicit years/education/certification mismatches default to Fit or Investigate and cannot block unless a separately reviewed category policy permits it. **Recommended: approve.**
4. Approve adding `FitAssessmentStatus` so insufficient listing requirements are no longer labelled Weak. **Recommended for V2.5, not V2.1.**
5. Choose model-assisted retention policy before V2.4: store validated structured proposals and hashes/metadata by default; raw prompts/responses should be disabled or short-lived and redacted. **Recommended: no durable raw prompt/response retention.**
6. Decide rejected-observation retention separately. **Recommended: persist bounded diagnostic metadata later; do not retain full rejected payloads by default.**
