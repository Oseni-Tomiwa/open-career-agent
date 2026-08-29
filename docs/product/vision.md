# Product Vision

## Status

This document records the Phase 0 product direction. It does not approve an implementation architecture, scoring formula, technology stack, or permanent product name.

## Problem

Career searches produce more opportunities than a candidate can investigate well. Search and ranking tools often blur together three different questions: whether the candidate can pursue an opportunity, how well it matches them, and whether the opportunity itself is credible and worthwhile. That is especially costly for global candidates facing geography, authorization, sponsorship, language, education, or relocation constraints.

Candidates also need help turning their experience into applications without inventing claims. Missing information compounds the problem: a posting that says nothing about sponsorship, for example, does not prove that sponsorship is unavailable.

## Product thesis

An effective career product should continuously discover opportunities, determine whether they are realistically attainable for a candidate, explain fit and opportunity quality separately, help prepare truthful evidence-backed applications, track outcomes, and eventually learn what improves that candidate's prospects.

The practical question is:

> Of all the opportunities available to me, which ones are actually worth my time, why, and what should I do next?

## Long-term vision

The long-term direction is an open-source career intelligence platform whose intelligence core can support a web dashboard, CLI, API, MCP, and integrations or plugins. It should remain friendly to local and self-hosted use, avoid fundamental dependence on an AI coding CLI, and preserve provider independence where practical.

Over time, outcomes such as response rates, interview conversion, successful resume variants, effective markets, recurring skill gaps, and source performance may improve recommendations. This feedback loop is a direction, not a v0.1 commitment.

## What the product is

- A decision-support system for prioritizing career opportunities.
- A global-candidate-aware system that evaluates hard constraints and uncertainty.
- An explainable evaluation workflow separating Eligibility, Fit, and Opportunity Quality.
- A candidate-controlled record of Career Profile, Preferences, Evidence, actions, and outcomes.
- A foundation for truthful, provenance-aware application preparation.
- An independently designed open-source platform informed by reference systems.

## What the product is not

It is not intended to be a generic AI resume builder, job scraper, auto-apply bot, ChatGPT wrapper, or clone of `career-ops` or `ai-job-search`. Automated mass application submission is explicitly not a goal. The platform may eventually prepare application material or communications, but consequential actions remain under human control.

## Opportunity-centric domain direction

**Opportunity** is the central domain concept. A job is the primary planned v0.1 Opportunity type. Internships, apprenticeships, graduate programs, fellowships, and other career opportunities may be represented later, but Phase 0 does not define their detailed models.

The other primary concept is **Candidate**:

```text
Candidate                         Opportunity
├── Career Profile               ├── Source
├── Evidence                     ├── Eligibility Analysis
└── Preferences                  ├── Fit Analysis
                                 └── Quality Analysis

             Candidate + Opportunity
                        ↓
              Decision / Evaluation
                        ↓
       save · shortlist · investigate · dismiss
                  · prepare/apply later
```

These relationships are conceptual, not database schemas.

## Major differentiators

### Global Eligibility intelligence

Eligibility asks whether a Candidate can realistically pursue an Opportunity. It is separate from Fit and may consider geography, remote restrictions, work authorization, sponsorship, relocation, education, student status, experience, seniority, language, citizenship, security clearance, and other hard blockers. Missing evidence is represented explicitly: **unknown is not equivalent to no**. Exact eligibility states remain unresolved; possible states include eligible, ineligible, eligible with unknowns, and needs investigation.

### Explainable matching

Evaluation separates:

1. **Eligibility:** Can the Candidate realistically pursue the Opportunity?
2. **Fit:** How well does the Opportunity match the Candidate?
3. **Opportunity Quality:** Is the Opportunity worth pursuing?

Fit may consider skills, relevant experience, seniority, project relevance, career direction, and compensation alignment. Quality may consider freshness, legitimacy, company confidence, compensation transparency, hiring signals, and red flags. No scoring formula is approved.

### Evidence-backed career memory

Candidate claims should trace to verified work history, projects, repositories, portfolios, certifications, education, or candidate-entered facts. The product must not fabricate employment, projects, technologies, metrics, responsibilities, education, certifications, or achievements.

### Continuous career intelligence

The system should eventually learn from outcomes while keeping inference explainable and candidate-controlled. Outcome-trained calibration is outside v0.1.

### Platform architecture and open extensibility

The long-term intelligence core should support multiple interfaces and future extension points such as Opportunity source adapters, AI providers, notification providers, integrations, and regional Eligibility modules. A complete SDK or plugin marketplace is not part of v0.1.

## Success philosophy

Success is not the number of applications submitted. It is helping a Candidate spend attention on realistically attainable, suitable, worthwhile Opportunities; understand the reasons and unknowns; act with control; and produce truthful materials. The smallest trustworthy system is preferable to premature autonomy.
