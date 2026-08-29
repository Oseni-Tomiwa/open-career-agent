# Opportunity Evaluation Specification

## Purpose

An Evaluation assesses one Opportunity for one Candidate using three separate concepts:

1. **Eligibility:** Can the Candidate realistically pursue it?
2. **Fit:** How strongly does the Candidate match it?
3. **Opportunity Quality:** How worthwhile and trustworthy does the Opportunity itself appear?

The Evaluation must preserve each analysis, its Evidence, confidence, completeness, uncertainty, and contradictions. It must not collapse them into one unexplained percentage.

## Required evaluation order

1. Establish the Candidate and Opportunity Claims relevant to the Evaluation.
2. Evaluate Eligibility and identify confirmed Hard Blockers or material unknowns.
3. Evaluate Fit without allowing it to change Eligibility.
4. Evaluate Opportunity Quality without using Candidate skills as quality signals.
5. Produce an explanation and pass the separate results to Decision policy.

Fit and Quality may still be computed for an ineligible Opportunity because their explanations can be useful, but the user-facing Decision must respect the blocker.

## Requirement interpretation

Each Opportunity Requirement should preserve:

- the requirement text and Evidence;
- explicit mandatory, preferred, inferred, or ambiguous strength;
- normalized subject, level, duration, or scope where justified;
- applicable Eligibility, Fit, or Quality role;
- matched, partially matched, missing, uncertain, or transferable result; and
- Candidate Evidence used in the comparison.

A Requirement may affect more than one analysis for different reasons. For example, an explicitly mandatory active license can affect Eligibility, while depth of licensed practice can affect Fit. The explanation must keep those effects distinct.

## Fit

Fit measures supported alignment, not legal or practical permission to apply. Its working dimensions may include:

- technical skills;
- relevant experience;
- seniority;
- project or portfolio relevance;
- domain relevance;
- career-direction alignment; and
- compensation alignment.

### Essential v0.1 Fit behavior

The smallest trustworthy v0.1 Evaluation should identify:

- matched, partially matched, missing, and uncertain Requirements;
- transferable Evidence and why it is considered transferable;
- technical skills supported by Candidate Evidence;
- relevant experience and seniority without inventing duration or responsibility;
- project or portfolio Evidence relevant to the Opportunity; and
- career-direction or compensation conflicts only when Candidate Preferences are available.

Whether every item becomes a separately scored dimension is unresolved. Domain relevance and sophisticated compensation comparisons may begin as explanations rather than formal dimensions.

### Requirement match states

- **Matched:** Candidate Evidence directly satisfies the interpreted Requirement.
- **Partially matched:** Candidate Evidence satisfies only part of the level, scope, duration, or recency requested.
- **Missing:** adequate Candidate Evidence indicates the capability or experience is absent, or the Candidate has explicitly said they lack it.
- **Uncertain:** Candidate Evidence is absent, ambiguous, stale, or contradictory; absence of Evidence is not always Evidence of absence.
- **Transferable:** Evidence demonstrates a related capability, and the relationship is explicitly explained rather than treated as an exact match.

These are working labels, not final enums.

### Fit behavior examples

If an Opportunity asks for “5+ years backend experience” and the Candidate has three verified years, the duration mismatch should generally reduce Fit. It is not automatically a Hard Blocker unless reliable Evidence makes five years an applicable mandatory eligibility gate.

If “Kubernetes experience preferred” and the Candidate has no Kubernetes Evidence, record a Fit gap or uncertain match depending on what the Candidate profile establishes. Do not mark the Candidate ineligible.

Transferability must be specific. Experience deploying containerized services may support part of a Kubernetes-related match, but it does not prove Kubernetes experience.

## Opportunity Quality

Opportunity Quality concerns the Opportunity or listing, not whether this Candidate matches it. High Fit and low Quality, low Fit and high Quality, and high Fit and high Quality are all coherent outcomes.

### Essential v0.1 Quality behavior

- **Listing freshness:** observed publication or update dates, current availability, and age-related uncertainty.
- **Source confidence:** whether the listing comes from a direct ATS or careers source and whether its provenance is intact.
- **Basic legitimacy signals:** consistency of employer, role, location, and application destination without claiming certainty about employer intent.
- **Compensation transparency:** whether compensation information is present, scoped, and internally coherent.
- **Suspicious patterns:** observable inconsistencies, unusual requests, broken provenance, or other reviewable warning signals.
- **Duplicate/repost behavior:** repeated or conflicting versions and what is actually observable about them.

Employer information quality and richer hiring signals are candidates for later work. Deep company intelligence is outside v0.1.

### Quality constraints

- Do not claim to identify “ghost jobs” definitively.
- Describe observable facts: age, repost frequency, changed identifiers, conflicting details, missing company attribution, or suspicious application destinations.
- Distinguish a duplicate caused by aggregation from a role reposted by the employer.
- Treat low transparency as missing information or risk—not proof of bad intent.
- Do not reduce Quality because the Candidate lacks a skill; that is Fit.

## Confidence and evidence completeness

Every conclusion should qualify the relevant axis:

| Axis | Question |
|---|---|
| Extraction confidence | Was information accurately located and interpreted in the source? |
| Inference confidence | How strongly does Evidence support a non-explicit conclusion? |
| Evaluation confidence | How reliable is the comparison or Quality judgment given the inputs? |
| Evidence completeness | Are the relevant Candidate and Opportunity facts available? |

Example: “No sponsorship information was found” can have high extraction confidence and high confidence of absence within the searched listing, while the employer's real sponsorship behavior remains unknown and overall Eligibility completeness is low.

Confidence must be attached to a Claim or conclusion. A single generic confidence number must not imply that complete Evidence exists.

## Contradiction handling

When Evidence conflicts, the Evaluation must:

1. retain every material source and its scope;
2. identify the specific contradiction;
3. check whether date, region, role, or source scope resolves it;
4. lower confidence and completeness as appropriate;
5. avoid using the preferred answer silently; and
6. surface investigation and what resolution would change the result.

No universal source hierarchy is approved. Source authority may inform later policy, but role specificity, provenance, freshness, and domain authority must remain visible.

## Conceptual explanation object

The following is a human-readable shape, not an implementation type or schema:

```text
Evaluation explanation
├── Candidate and Opportunity being evaluated
├── Eligibility
│   ├── satisfied conditions
│   ├── Hard Blockers with Requirement and Candidate Evidence
│   ├── unknown or contradictory issues
│   └── facts that would change the result
├── Fit
│   ├── matched and partially matched Requirements
│   ├── missing and uncertain Requirements
│   ├── transferable Evidence with rationale
│   └── supporting Candidate Evidence
├── Opportunity Quality
│   ├── positive observable signals
│   ├── warning signals
│   ├── missing information
│   └── supporting Opportunity Evidence
├── Confidence and completeness by conclusion
├── Contradictions retained
└── Suggested investigation steps
```

It should answer why Eligibility passed or failed, what created a blocker, why Fit is high or low, what matched or is missing, why Quality is high or low, what remains unknown, what to investigate, and what would change the Decision.

## Auditable evaluation behavior

An Evaluation is auditable when another evaluator can reconstruct its outcome from retained Claims, Evidence, requirement strength, comparison results, policy, and stated inferences. Model-generated reasoning that cannot be traced to these inputs is insufficient.

The specification should support future tests asserting invariants such as:

- a preferred skill gap never creates a Hard Blocker;
- missing sponsorship text remains unknown;
- an explicit no-sponsorship policy plus verified sponsorship need creates a blocker unless contradicted;
- a Quality warning does not alter Candidate Fit;
- an Unsupported Candidate Claim never improves Fit; and
- contradictory material Evidence produces a visible uncertainty or investigation item.

## Unresolved questions

- Which Fit and Quality dimensions should become formal v0.1 outputs?
- How should partial and transferable matches be calibrated and explained?
- What semantic matching strategy is reliable enough for skills and experience?
- What scoring weights, if any, can be justified with evidence?
- How should compensation alignment account for currencies, ranges, total compensation, and Candidate flexibility?
- What freshness thresholds are appropriate for different sources and Opportunity types?
- What observable signals are sufficiently reliable for Quality policy?
- Which evaluation steps should be deterministic and which may use bounded model reasoning?
