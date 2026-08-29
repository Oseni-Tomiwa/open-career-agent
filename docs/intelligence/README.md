# Intelligence Specifications

## Status and purpose

These Phase 0 specifications define the conceptual behavior of the platform's intelligence core. They are intended to make later implementation and testing possible without selecting a framework, storage model, AI provider, or final scoring formula. Labels shown as examples or working vocabulary are not frozen implementation enums.

## Specification map

- [Eligibility](eligibility.md): whether a Candidate can realistically pursue an Opportunity.
- [Evidence](evidence.md): how Candidate and Opportunity Claims acquire provenance and how generated claims remain truthful.
- [Evaluation](evaluation.md): separate Eligibility, Fit, and Opportunity Quality analyses.
- [Decision model](decision-model.md): how analyses constrain user-facing recommendations and ranking.
- [Scenarios](scenarios.md): behavioral examples suitable as future acceptance-test inputs.

## Terminology

### Candidate

The person whose career context, constraints, Preferences, and Evidence are used in an Evaluation. Candidate data is not presumed complete.

### Evidence

A retained reference to information that supports, weakens, or contradicts a Claim. Evidence records where information came from, what was observed, when it was observed, and how it was verified. Evidence is not the same as an evaluator's confidence.

### Claim

A precise statement about a Candidate or Opportunity that can be supported, contradicted, inferred, or left unresolved. “The Candidate worked at Acme from 2023 to 2025” and “the employer does not sponsor this role” are Claims.

### Opportunity

The career possibility being considered. Jobs are the primary v0.1 Opportunity type, but the concept is not permanently limited to jobs.

### Requirement

A stated or inferred condition, preference, or capability associated with an Opportunity. Requirements must retain their strength and provenance: explicit mandatory language is not equivalent to preferred, inferred, or ambiguous language.

### Eligibility

The analysis answering: **Can this Candidate realistically pursue this Opportunity?** Eligibility concerns constraints and hard blockers. It remains separate from Fit.

### Hard Blocker

A sufficiently evidenced incompatibility with an applicable, mandatory Requirement that makes pursuit unrealistic under current facts. A missing preference or ambiguous statement is not a Hard Blocker.

### Fit

The analysis of how strongly the Candidate's supported capabilities, experience, goals, and Preferences align with the Opportunity. Fit can be high even when Eligibility is blocked; it cannot override that blocker.

### Opportunity Quality

The analysis of how worthwhile and trustworthy the Opportunity or listing appears based on observable signals such as freshness, source confidence, transparency, and suspicious patterns. Quality does not measure Candidate skills.

### Confidence

A qualified assessment of how reliable a particular extraction, inference, or evaluation appears. Confidence must name its subject. High confidence that a statement is absent is not high confidence about the unstated fact.

### Uncertainty

Known incompleteness, ambiguity, conflict, or limited confidence that could affect interpretation. Uncertainty is retained and explained rather than silently converted into a negative fact.

### Evaluation

The auditable set of separate Eligibility, Fit, and Opportunity Quality analyses for one Candidate–Opportunity pair, including evidence, uncertainty, contradictions, and explanations.

### Decision

A user-facing recommendation derived under policy constraints from an Evaluation. A Decision guides attention; it does not submit an application or replace Candidate judgment.

## Relationship and evaluation order

```text
Candidate Claims ← Candidate Evidence
                         ↓
Candidate + Opportunity + Opportunity Evidence
                         ↓
                  Eligibility first
                         ↓
             Fit and Opportunity Quality
                         ↓
             Decision + explanation + unknowns
```

Eligibility, Fit, and Opportunity Quality are peers in the Evaluation record but answer different questions. Decision policy may gate recommendations on Eligibility; it must not collapse the three analyses into one unexplained score.

## Cross-cutting invariants

1. Unknown never silently becomes no.
2. An evaluator's or model's confidence is not factual Evidence.
3. Hard Blockers require adequate Evidence of both a mandatory Requirement and a Candidate conflict.
4. Preferred, inferred, or ambiguous Requirements do not automatically create Hard Blockers.
5. Unsupported Candidate Claims never enter generated application materials.
6. Contradictory Evidence is retained and surfaced.
7. Fit cannot override a confirmed Eligibility blocker.
8. Opportunity Quality describes the Opportunity, not the Candidate.
9. Every Decision must be explainable in terms of Claims, Evidence, uncertainty, and policy.
10. Deterministic rules should be used where their premises are explicit; model reasoning remains bounded by the same rules.

## Unresolved questions

- What final labels and transitions should represent Eligibility and Decisions?
- How should confidence be represented without implying false precision?
- What source-authority policy should apply within each Claim domain and region?
- Which Fit and Quality dimensions belong in v0.1, and how should they be weighted?
- What ranking formula, if any, should follow the behavioral constraints?
- Which judgments should be deterministic rules and which may use model reasoning?
- What semantic matching strategy should identify related skills and transferable Evidence?
- What verification mechanisms make Candidate and Opportunity Evidence trustworthy?
- How should stale Evidence affect each Claim type?
- How should regional immigration modules be sourced, reviewed, and updated?

These questions remain open intentionally. Resolving them requires later product specifications, validation work, or ADRs.
