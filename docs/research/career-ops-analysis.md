# `career-ops` Reference Analysis

## Research boundary

This analysis uses only the research supplied during Phase 0. It is not a code audit or a claim about the project's complete current capabilities. `career-ops` is an inspiration and reference system; Open Career Agent is intended to be independently designed rather than copied.

## Strengths observed

- A local-first philosophy aligns with Candidate control and privacy.
- AI-provider and runtime agnosticism reduces unnecessary lock-in.
- Human-in-the-loop application submission preserves control over consequential actions.
- Zero- or low-token discovery before expensive AI evaluation supports efficient processing.
- Structured ATS discovery offers a focused alternative to arbitrary browser automation.
- Explainable evaluation treats reasoning as part of the product output.
- Candidate truthfulness rules recognize the risk of fabricated career claims.
- Application tracking preserves continuity after discovery and evaluation.
- Job legitimacy and red-flag analysis broadens evaluation beyond Candidate Fit.

## Useful principles

1. Prefer deterministic discovery when structured public ATS data is sufficient.
2. Delay expensive AI evaluation until after cheaper filtering and normalization.
3. Keep application submission under human control.
4. Make evaluation understandable rather than returning only a score.
5. Treat truthfulness and durable application state as core workflow concerns.
6. Evaluate posting legitimacy and warning signals as well as match.

## Limitations relative to our product direction

The supplied research does not establish that `career-ops` covers the full direction proposed for Open Career Agent. In particular, it does not provide enough evidence to claim:

- a distinct global Eligibility layer covering sponsorship, authorization, geography, relocation, and related hard constraints;
- an Opportunity-centric domain beyond jobs;
- a formal separation of Eligibility, Fit, and Opportunity Quality;
- evidence provenance across a durable Candidate career memory;
- outcome-informed recommendation learning;
- a platform core intended for web, API, CLI, MCP, and integrations;
- a defined extensibility model for sources, providers, notifications, and regional modules.

These are differences in documented direction, not criticisms of the reference project. Unknown capabilities should not be interpreted as absent capabilities.

## Ideas worth learning from

- Preserve local-first and provider-independent constraints during later architecture work.
- Treat structured ATS ingestion as a first-class discovery path.
- Make cheap deterministic work precede expensive intelligence.
- Retain human review before application submission.
- Carry truthfulness rules into the design of Candidate Evidence and generated materials.
- Keep application status visible and durable for downstream workflows.
- Include legitimacy and red-flag signals in Opportunity Quality without prematurely fixing a scoring formula.
