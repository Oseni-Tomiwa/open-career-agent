# `ai-job-search` Reference Analysis

## Research boundary

This analysis uses only the research supplied during Phase 0. It is not a code audit or a claim about the project's complete current capabilities. `ai-job-search` is an inspiration and reference system; Open Career Agent is intended to be independently designed rather than copied.

## Strengths observed

- A clear setup → scrape → rank → apply → interview → outcome lifecycle makes the Candidate journey understandable.
- Candidate Profile enrichment recognizes that evaluation quality depends on profile quality.
- A drafter/reviewer workflow introduces review into application generation.
- ATS/PDF validation treats generated artifacts as outputs that need verification.
- Outcome tracking preserves signals beyond the initial application.
- Skill-gap analysis can turn evaluation into actionable career insight.
- Feeding outcomes into future search decisions supports continuous improvement.

## Useful principles

1. Design around an end-to-end Candidate lifecycle rather than isolated generation tasks.
2. Improve the Candidate Profile before expecting reliable matching.
3. Separate drafting from review and validate generated artifacts.
4. Preserve outcomes so later decisions can learn from real results.
5. Explain recurring skill gaps as actionable information.

## Limitations relative to our product direction

The supplied research does not establish that `ai-job-search` covers the full direction proposed for Open Career Agent. In particular, it does not provide enough evidence to claim:

- a distinct global Eligibility layer covering sponsorship, authorization, geography, relocation, and related hard constraints;
- a formal separation of Eligibility, Fit, and Opportunity Quality;
- an Opportunity-centric domain beyond jobs;
- provenance rules that tie every generated career claim to verified Evidence;
- a local-first and self-hosting philosophy;
- AI-provider independence;
- a platform core intended for web, API, CLI, MCP, and integrations;
- extensible Opportunity source or regional Eligibility modules.

These are differences in documented direction, not criticisms of the reference project. Unknown capabilities should not be interpreted as absent capabilities.

## Ideas worth learning from

- Keep the Candidate lifecycle legible from onboarding through outcome.
- Make Profile enrichment an explicit onboarding responsibility.
- Use review and validation stages for later evidence-backed application preparation.
- Ensure application and outcome states remain durable.
- Use skill-gap signals to explain Fit, while keeping personalized learning plans outside v0.1.
- Reserve outcome feedback for a later phase after the core evaluation workflow is trustworthy.
