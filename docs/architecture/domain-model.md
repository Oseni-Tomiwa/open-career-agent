# Conceptual Domain Model

## Status and scope

This document defines conceptual domain identity, ownership, lifecycle, relationships, and invariants. It is not a physical database schema. Jobs are the primary v0.1 Opportunity type; the model does not prematurely specialize every future Opportunity type.

## Aggregate relationships

```text
Candidate
├── CareerProfile
│   ├── CandidateFact ── Evidence
│   └── Preference
├── Evaluation ───────── Opportunity
│   ├── EligibilityAssessment
│   ├── FitAssessment
│   ├── QualityAssessment
│   └── Decision
└── Application ──────── Opportunity
    └── ApplicationEvent

Opportunity
├── OpportunitySource
├── OpportunitySnapshot ── Evidence ── Requirement
└── Evaluation(s)
```

## Candidate

- **Purpose:** Represents the person whose career context and decisions the platform serves.
- **Identity:** Stable internal identity, independent of email, resume, or external profile identifiers.
- **Ownership:** The Candidate owns their profile, Evidence, Preferences, Applications, and user-entered actions.
- **Lifecycle:** Created during onboarding; corrected, exported, or removed under future privacy rules.
- **Relationships:** Owns one active CareerProfile conceptually, CandidateFacts, Preferences, Evaluations, and Applications.
- **Invariants:** Candidate data is not presumed complete; facts remain distinct from inferences; consequential actions require Candidate authority.

## CareerProfile

- **Purpose:** Organizes the Candidate's current career context for discovery and Evaluation.
- **Identity:** Belongs to a Candidate and may have revisions or versions conceptually.
- **Ownership:** Candidate-owned.
- **Lifecycle:** Enriched and corrected over time; historical Evaluation must retain which profile facts it used.
- **Relationships:** Groups CandidateFacts and Preferences; references Evidence rather than copying unsupported prose.
- **Invariants:** A profile summary cannot create facts; missing information remains missing; corrections must not silently rewrite past Evaluations.

## CandidateFact

- **Purpose:** A narrow Claim about the Candidate, such as a skill, employment period, authorization status, or willingness to relocate.
- **Identity:** Stable identity for the Claim plus revisions when its value or scope changes.
- **Ownership:** Candidate-owned, even when imported.
- **Lifecycle:** Proposed, reviewed, confirmed, contradicted, superseded, or rejected using working Evidence concepts.
- **Relationships:** Supported or contradicted by Evidence; consumed by Assessments; grouped by CareerProfile.
- **Invariants:** Carries scope, provenance, verification state, and freshness where material. Repetition does not become independent corroboration.

## Evidence

- **Purpose:** Preserves why a CandidateFact, Opportunity Claim, Requirement, Assessment conclusion, or generated Claim exists.
- **Identity:** Stable reference to a particular source observation or Candidate assertion.
- **Ownership:** Candidate Evidence is Candidate-controlled; Opportunity Evidence belongs to the observed Opportunity/source context.
- **Lifecycle:** Observed, verified, contradicted, superseded, or made stale; never silently overwritten by later Evidence.
- **Relationships:** Links Claims to source excerpts/references, scope, observation time, derivations, and contradictions.
- **Invariants:** Evaluator confidence is not Evidence; original references remain reviewable; sensitive content is minimized; contradictions retain both sides.

## Preference

- **Purpose:** Captures what the Candidate wants or will accept, such as role direction, compensation, geography, travel, or working hours.
- **Identity:** Candidate-scoped preference with effective time or revision context.
- **Ownership:** Candidate-owned.
- **Lifecycle:** Added, changed, disabled, or superseded.
- **Relationships:** Informs discovery filters, Fit, and Decision policy; may interact with Eligibility only when a Candidate constraint makes pursuit impossible.
- **Invariants:** Preferences are not employer Requirements and must not be represented as Candidate qualifications.

## Opportunity

- **Purpose:** Provides the persistent, source-neutral identity of a career Opportunity across observations.
- **Identity:** Canonical identity assigned by the platform after source identity and deduplication analysis. It is not derived from title alone.
- **Ownership:** Platform-managed representation of external information.
- **Lifecycle:** Discovered, updated through new snapshots, possibly closed/removed, linked as a duplicate or possible repost, and retained for history.
- **Relationships:** Has one or more OpportunitySources and OpportunitySnapshots; participates in Candidate-specific Evaluations and Applications.
- **Invariants:** Opportunity remains distinct from any one observation; uncertain duplicate candidates are not silently merged; v0.1 type is primarily job.

## OpportunitySource

- **Purpose:** Identifies where and under which external identity an Opportunity was observed.
- **Identity:** Source kind plus stable source account/board and external identifier where available; canonical URL is an additional signal, not always identity.
- **Ownership:** Platform-managed source metadata.
- **Lifecycle:** First observed, refreshed, unavailable, redirected, or retired while history remains.
- **Relationships:** Links an Opportunity to Source Records and OpportunitySnapshots.
- **Invariants:** Source identifiers and URLs retain provenance; source-specific structures do not leak into the core Opportunity model.

## OpportunitySnapshot

- **Purpose:** Preserves what a source said about an Opportunity at a particular observed time.
- **Identity:** OpportunitySource plus observation identity, time, and content identity sufficient to distinguish changed observations.
- **Ownership:** Platform-managed immutable historical observation.
- **Lifecycle:** Appended when first seen or materially changed; may later be marked stale or unavailable but is not rewritten.
- **Relationships:** Belongs to Opportunity and OpportunitySource; supplies Opportunity Evidence and Requirements; Evaluations record which snapshot(s) they used.
- **Invariants:** Observation time and source update time remain distinct; raw/source reference is retained; later snapshots do not erase older descriptions, compensation, locations, or Requirements.

Snapshots make later detection of description changes, compensation changes, listing removal, Requirement changes, repeated publication, and possible reposts possible without designing a complete temporal database now.

## Requirement

- **Purpose:** Represents a specific stated or inferred Opportunity condition or preference used in Eligibility or Fit.
- **Identity:** Scoped Claim tied to supporting OpportunitySnapshot Evidence; revisions follow changed snapshots rather than overwriting history.
- **Ownership:** Derived from Opportunity Evidence under domain rules.
- **Lifecycle:** Extracted, normalized, reviewed, contradicted, superseded, or made stale.
- **Relationships:** Evaluated against CandidateFacts; carries explicit mandatory, preferred, inferred, or ambiguous strength.
- **Invariants:** Exact Evidence, scope, strength, and derivation are retained. Ambiguous or preferred language cannot silently become a Hard Blocker.

## Evaluation

- **Purpose:** Captures a time-bound assessment of one Candidate–Opportunity pair.
- **Identity:** Stable evaluation run identity with Candidate, Opportunity, input snapshot/profile context, policy version, and observation time.
- **Ownership:** Platform-produced for the Candidate.
- **Lifecycle:** Scheduled, partially completed, completed, failed, or superseded by a later Evaluation; prior runs remain auditable.
- **Relationships:** Contains separate EligibilityAssessment, FitAssessment, QualityAssessment, and resulting Decision.
- **Invariants:** Input Evidence and rule/model provenance are retained; partial failure is visible; separate assessments never collapse into one unexplained score.

## EligibilityAssessment

- **Purpose:** Answers whether the Candidate can realistically pursue the Opportunity.
- **Identity:** Part of a specific Evaluation.
- **Ownership:** Evaluation-owned.
- **Lifecycle:** Produced from issue comparisons; superseded only by a new Evaluation.
- **Relationships:** Links CandidateFacts, Requirements, satisfied conditions, material unknowns, contradictions, and Hard Blockers.
- **Invariants:** Unknown never becomes no; Hard Blockers require the intelligence specification's evidence test; Fit cannot override the result.

## FitAssessment

- **Purpose:** Describes supported Candidate alignment with the Opportunity.
- **Identity:** Part of a specific Evaluation.
- **Ownership:** Evaluation-owned.
- **Lifecycle:** Produced or partially produced; superseded by later Evaluation.
- **Relationships:** Links matched, partial, missing, uncertain, and transferable Requirement comparisons to Candidate Evidence.
- **Invariants:** Unsupported Claims never improve Fit; a preferred skill gap is not an Eligibility blocker; transferability is explained.

## QualityAssessment

- **Purpose:** Describes observable confidence and risk in the Opportunity/listing itself.
- **Identity:** Part of a specific Evaluation.
- **Ownership:** Evaluation-owned.
- **Lifecycle:** Produced from source/snapshot Evidence and superseded by later Evaluation as freshness changes.
- **Relationships:** Links freshness, source confidence, transparency, suspicious patterns, and duplicate/repost observations.
- **Invariants:** Candidate skill does not affect Quality; risk signals do not claim employer intent; uncertainty and contrary Evidence remain visible.

## Decision

- **Purpose:** Guides Candidate attention using the separate Assessments and decision policy.
- **Identity:** Belongs to a specific Evaluation and policy version.
- **Ownership:** Platform recommendation presented to the Candidate.
- **Lifecycle:** Produced when adequate assessment inputs exist; may be partial or superseded; never overwrites Candidate actions.
- **Relationships:** References decisive Evidence, unknowns, contradictions, change conditions, and investigation steps.
- **Invariants:** Confirmed Hard Blockers gate immediate-application recommendations; unknown sponsorship normally prompts investigation; no unexplained formula is implied.

## Application

- **Purpose:** Represents the Candidate's durable pursuit of an Opportunity.
- **Identity:** Stable Candidate–Opportunity pursuit identity; repeated applications may require separate identities when genuinely distinct.
- **Ownership:** Candidate-owned.
- **Lifecycle:** Created when the Candidate chooses to track or prepare an application; current status is derived from retained events.
- **Relationships:** Links Candidate, Opportunity, relevant Evaluation, prepared materials when later supported, and ApplicationEvents.
- **Invariants:** Preparing materials does not mean submitted; system Decision and Candidate action remain distinct; history is retained.

## ApplicationEvent

- **Purpose:** Records an immutable, time-ordered fact about the Application lifecycle.
- **Identity:** Stable event identity plus Application and occurrence/recorded time.
- **Ownership:** Application-owned; actor and Evidence identify whether Candidate, employer, or reliable integration supplied it.
- **Lifecycle:** Appended, never edited into a different event; corrections append a compensating or clarifying event.
- **Relationships:** Contributes to the derived current Application status and later outcome analysis.
- **Invariants:** Ordering, actor, provenance, and effective time are retained; duplicate commands are idempotent; submission requires Candidate assertion or future reliable integration Evidence.

Working event concepts may include application created, preparation started, application prepared, user marked submitted, assessment received, interview scheduled/completed, offer received, rejected, and withdrawn. Names are not frozen.

### Why event history is required

A latest-status field cannot explain sequence, timing, reversals, duplicated notifications, or which actor asserted submission. Event history supports auditing, conversion analysis, workflow recovery, and later feedback while a derived current status supports efficient display. Generated materials may append “prepared”; only the Candidate or a future reliable submission integration can append authoritative submission Evidence.

## Additional integration concepts

### SourceRecord

An immutable or content-addressed capture returned by a Source Adapter before domain normalization. It retains source-specific metadata or payload reference, fetch time, source update time, URL, external identifier, and errors. It is untrusted integration input, not an Opportunity.

### BackgroundJob

A durable request to perform discovery, normalization, Evaluation, or refresh work. It owns retry, lease, attempt, and failure metadata but not domain meaning.

These concepts support the architecture without becoming the core product vocabulary.

## Cross-domain invariants

- Historical OpportunitySnapshots, Evaluations, Decisions, and ApplicationEvents remain attributable to the inputs known at the time.
- Sponsorship `UNKNOWN`, explicit `NO`, and contradictory Evidence are distinct representable states.
- Hard Blockers retain both the mandatory Requirement Evidence and conflicting Candidate Evidence.
- Missing preferred skills remain Fit results rather than Eligibility blockers.
- Opportunity Quality risk remains separate from Fit.
- Canonical identity merges require adequate deterministic Evidence or explicit review.

## Unresolved decisions

- Final identifiers and revision/version conventions
- Exact CandidateFact and Claim boundaries
- Which changes require a new OpportunitySnapshot
- Application current-status derivation and correction semantics
- Whether repeated applications to a repost share or separate Opportunity identity
- Retention, deletion, and anonymization behavior when Evidence participates in history
- Physical storage, indexing, and query representations
