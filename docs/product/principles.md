# Product Principles

These principles are non-negotiable product constraints. They apply even while implementation details remain unresolved.

## 1. Evidence over hallucination

Generated claims must be supported by Candidate Evidence. Work history, projects, technologies, metrics, education, certifications, responsibilities, and achievements must never be invented. Trustworthy omissions are better than polished fiction.

## 2. Eligibility before Fit

First determine whether the Candidate can realistically pursue an Opportunity, then assess how well it fits. A strong skills match cannot erase a hard authorization, geography, or other eligibility blocker.

## 3. Unknown is not equivalent to no

Silence is not negative evidence. If sponsorship, relocation, compensation, or another factor is missing, preserve that uncertainty and identify what requires investigation instead of silently rejecting or accepting the Opportunity.

## 4. Deterministic and cheap processing before expensive AI

Use public, structured, or rule-based processing for discovery, normalization, deduplication, and filtering where sufficient. Apply expensive intelligence only after those steps when it can add material value. This improves cost, latency, reproducibility, and auditability.

## 5. Human control over consequential actions

The Candidate controls submission and external communication. The platform may eventually prepare resumes, cover letters, application answers, outreach, and follow-ups, but automated mass submission is not a goal. Assistance must remain reviewable before consequential actions occur.

## 6. Explain decisions instead of returning unexplained scores

An evaluation should expose relevant evidence, blockers, supporting signals, assumptions, and unknowns. Scores may summarize a decision later, but cannot replace an explanation.

## 7. Candidate data ownership and privacy

Career information is sensitive. Candidates should control their data, understand how it is used, and be able to favor local or self-hosted operation. Privacy requirements must shape later architecture decisions rather than be added after implementation.

## 8. Provider independence where practical

Core product behavior should not be unnecessarily tied to one AI provider, runtime, Opportunity source, or interface. Independence is a practical design goal, not a promise that every component will be interchangeable.

## 9. Open-source and self-hosting friendly

The project should be understandable, operable, and adaptable by its community. Local/self-hosted use and a possible future hosted offering should both remain viable until deployment boundaries are decided through an architecture decision record.

## 10. Design for global Candidates

Do not encode one country's hiring assumptions as universal defaults. Eligibility must be able to reason about geography, authorization, sponsorship, relocation, language, citizenship, and regional constraints without treating every unknown as a rejection.

## 11. Prefer useful uncertainty over fabricated certainty

The system should distinguish facts, inferences, and missing information. When evidence is incomplete, it should communicate confidence and propose a next investigation step.

## 12. Build the smallest trustworthy system before autonomy

Prioritize a narrow, usable workflow with durable state and explainable decisions. Add automation only after the underlying behavior is reliable, observable, and controllable.

## Human-in-the-loop philosophy

Human review is a product boundary, not merely a fallback. Discovery and analysis may run in the background, but the Candidate decides whether to shortlist, investigate, dismiss, prepare, or submit. Any later workflow that affects employers, recruiters, or public systems must make the pending action and its evidence visible before execution.

## Uncertainty philosophy

Uncertainty should be stored and displayed as useful information. An analysis should identify what is known, what is inferred, what is missing, and whether the gap could change the decision. Exact Eligibility states and confidence representations are intentionally not frozen in Phase 0.

## Evidence and provenance philosophy

Evidence gives Candidate claims an origin. Application content should be traceable to a verified Candidate fact or clearly presented as a draft requiring verification. Provenance should survive revisions so reviewers can understand why a claim exists and correct the underlying Career Profile or Evidence when necessary.
