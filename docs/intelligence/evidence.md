# Evidence and Provenance Specification

## Purpose

Evidence makes Claims auditable. It should eventually let a Candidate or contributor answer:

> Why did the system say this about me or this Opportunity?

This document defines conceptual information and behavior, not a database schema. The model applies to Candidate Claims and Opportunity Claims while preserving their different trust and privacy concerns.

## Claims and Evidence

A **Claim** is a precise statement that may be evaluated. **Evidence** is a retained reference to information supporting, weakening, or contradicting it. A source by itself is not proof of every Claim derived from it, and evaluator confidence is not Evidence.

Claims should be narrow enough to verify independently. “Senior engineer with excellent impact” mixes level, role, and subjective judgment; separate Claims about job title, dates, responsibilities, and evidenced outcomes are more auditable.

## Evidence sources

### Candidate Evidence may originate from

- Candidate-entered facts;
- CV or resume;
- verified work history;
- projects;
- GitHub;
- portfolio;
- certifications;
- education records;
- imported professional profiles; and
- previous verified application material.

Candidate entry establishes that the Candidate asserted a fact; it does not automatically mean an independent party verified it. Imported or generated material must not become more authoritative merely through repetition.

### Opportunity Evidence may originate from

- the original job description;
- an ATS listing;
- the company's careers page;
- employer documentation;
- a trusted structured source; and
- external research.

Opportunity Evidence must retain role scope. A general employer policy may not apply to every Opportunity, country, contract type, or date.

## Conceptual evidence record

An Evidence record should preserve the following concepts without prescribing storage fields:

| Concept | Purpose |
|---|---|
| Claim | The exact proposition the Evidence bears on |
| Source | The document, page, profile, record, or Candidate assertion observed |
| Source type | The source category, such as Candidate-entered fact, resume, ATS listing, or employer policy |
| Evidence excerpt or reference | The smallest useful quotation, location, identifier, or pointer that permits review |
| Verification state | Whether the source or Claim is unreviewed, Candidate-confirmed, independently verified, disputed, or otherwise qualified |
| Confidence | Confidence in a named extraction, inference, or verification judgment—not generic truth probability |
| Observed at | When this specific source content was seen |
| Freshness | Whether age matters for this Claim and how current the Evidence appears |
| Contradictions | Links to Evidence or Claims that cannot all be true in the same scope |
| Scope | The Candidate, Opportunity, role, employer policy, region, and time period to which the Evidence applies |
| Derivation | Any normalization, faithful rephrasing, or inference used to produce the Claim |

The original source reference and unmodified excerpt should remain available even when a normalized Claim is created.

## Verification state

Working verification concepts may include:

- **Unreviewed:** captured but not checked by the Candidate or an independent process.
- **Candidate-confirmed:** explicitly affirmed by the Candidate.
- **Source-verified:** checked against the referenced source with a reproducible method.
- **Independently corroborated:** supported by more than one genuinely independent source.
- **Disputed:** credible Evidence conflicts.
- **Rejected:** review determined the Claim is inaccurate or unsupported.

These labels are proposals, not final enums. Verification state must describe what was verified and by whom or what process; “verified” alone is too vague.

## Source authority, freshness, and repetition

Authority is Claim-specific. A Candidate may be authoritative about willingness to relocate, while an issuer is more authoritative about certification validity. A role-specific ATS listing may be more applicable than a general employer page, but a newer official correction may reverse that presumption.

The system must not treat duplicated text as independent corroboration. Several aggregators repeating one listing are one evidence lineage unless they add independent information.

Freshness matters differently by Claim. A historical employment date may remain stable; work authorization, current enrollment, security clearance, an open listing, or an employer policy may expire quickly. The evidence record should make age visible and allow later policy to request re-verification.

## Contradictions

Contradictory Evidence must be retained rather than overwritten. The system should:

1. identify the specific Claims that conflict;
2. preserve each source, scope, excerpt/reference, and observation time;
3. determine whether scope or date resolves the apparent conflict;
4. if unresolved, mark the Claim disputed and reduce evaluation certainty;
5. prevent a disputed material Claim from being presented as settled; and
6. surface an investigation step when the conflict could change Eligibility, Fit, Quality, or a Decision.

Source authority is a future policy consideration, not a universal hierarchy assumed here.

## Candidate claim-safety categories

The following working categories constrain generated application content:

### Supported

The generated Claim preserves a Candidate fact directly established by adequate Evidence.

Example: Evidence says “Built an internal inventory API”; generated text says “Built an internal inventory API.”

### Supported rephrase

The wording changes while material meaning, scope, certainty, and attribution remain faithful. The rephrase may improve clarity but cannot add a technology, metric, responsibility, outcome, seniority, or causal Claim.

Example: Evidence says “Built an API used by the inventory team”; generated text says “Developed an API for the inventory team.”

### Inference

The statement goes beyond explicit Evidence but follows a documented reasoning chain. An inference may be useful for matching or as a Candidate review prompt, but it must not enter application material as a Candidate fact unless the Candidate confirms it and supporting Evidence is retained.

Example: several backend projects may suggest backend specialization; they do not prove a formal backend job title.

### Unsupported

No adequate Candidate Evidence supports the Claim, or the Claim materially exceeds it. Unsupported Claims are prohibited from generated application materials.

Example: “Built an API” cannot become “Improved API latency by 47%” unless Candidate Evidence contains the 47% improvement and connects it to the Candidate's work.

The labels are working terminology, but the behavioral boundary is mandatory: only Supported and Supported rephrase Claims may be used automatically in generated application content.

## Prohibited transformations

The system must not invent or silently alter:

- employers;
- employment, education, or project dates;
- responsibilities or level of ownership;
- technologies;
- numerical metrics;
- team sizes;
- certifications or licenses;
- education or grades;
- project outcomes;
- causal impact; or
- the Candidate's role in a group achievement.

It must also avoid scope inflation. “Helped test a service” is not equivalent to “led service quality,” and “familiar with Kubernetes” is not equivalent to “operated Kubernetes in production.”

## Generation safety workflow

Before a generated Candidate statement can enter application material:

1. Split the statement into independently checkable Claims.
2. Link every material Claim to Candidate Evidence.
3. Classify each as Supported, Supported rephrase, Inference, or Unsupported.
4. Check that rephrasing preserves qualifiers, scope, time, attribution, and uncertainty.
5. Exclude Unsupported Claims.
6. Hold material Inferences for Candidate review; confirmation should create or link adequate Evidence rather than merely approve opaque wording.
7. Preserve provenance from final wording back to Claims and Evidence.

A provider or model may assist with drafting, but cannot waive these rules.

## Provenance explanation

For any Candidate statement, the system should eventually show:

- the statement used;
- its component Claims;
- its safety category;
- the Evidence supporting each Claim;
- the relevant source excerpt/reference and observation date;
- any transformation from source wording;
- verification state and contradictions;
- who or what confirmed a material inference; and
- what correction would update or remove the statement.

This explanation provides an audit trail without requiring the Candidate to trust an opaque generation process.

## Opportunity Claim handling

Opportunity Claims require the same provenance discipline but not the application-generation safety categories. Evaluators should distinguish exact listing facts from interpretation and external research. Claims such as “likely stale” or “suspicious repost behavior” are evaluations supported by observable Evidence, not definitive facts about employer intent.

## Privacy and retention constraints

Evidence can contain sensitive personal data. Later implementation must minimize collection, make external processing visible, preserve Candidate control, and support correction, export, and deletion policies. Provenance should retain enough context to audit a Claim without unnecessarily copying entire sensitive documents.

## Unresolved questions

- What final verification states and actors should be represented?
- What evidence is sufficient for high-risk Candidate Claims such as metrics, licenses, or work authorization?
- How should Candidate confirmation be recorded without treating all self-attestation as independent verification?
- Which source-authority rules apply to each Claim type?
- How should freshness and re-verification intervals be determined?
- What semantic method should split generated text into material Claims?
- How should provenance survive merges, corrections, deletion, and derived application versions?
- What privacy and retention rules apply to excerpts from external or sensitive sources?
