# Competitive Gap Analysis

## Purpose and evidence boundary

This matrix compares the limited Phase 0 research supplied for two reference systems with the working direction for Open Career Agent. It is not a complete competitive audit. The projects are sources of useful ideas, not products to clone.

Status labels mean:

- **KNOWN:** supported by the supplied research.
- **WORKING DIRECTION:** proposed for Open Career Agent, but not implemented or necessarily specified.
- **UNRESOLVED:** not established by the supplied research, or not yet decided for Open Career Agent.

“UNRESOLVED” does not mean a reference system lacks the capability; it means this research cannot make that claim.

| Capability | `career-ops` | `ai-job-search` | Open Career Agent direction |
|---|---|---|---|
| Discovery | **KNOWN:** zero/low-token discovery | **KNOWN:** scraping appears in the documented lifecycle | **WORKING DIRECTION:** background discovery with cheap deterministic processing first |
| Source adapters | **KNOWN:** structured ATS discovery | **UNRESOLVED:** specific adapter model not established | **WORKING DIRECTION:** Greenhouse, Ashby, and Lever adapters in v0.1; extension points later |
| Candidate Profile | **KNOWN:** Candidate truthfulness rules imply Candidate information is used; exact profile model is unresolved | **KNOWN:** Candidate Profile enrichment | **WORKING DIRECTION:** Career Profile with skills, experience, projects, basic Evidence, and Preferences |
| Eligibility | **UNRESOLVED:** distinct Eligibility analysis not established | **UNRESOLVED:** distinct Eligibility analysis not established | **WORKING DIRECTION:** evaluate Eligibility before and separately from Fit |
| Sponsorship / work authorization | **UNRESOLVED:** not established | **UNRESOLVED:** not established | **WORKING DIRECTION:** explicit global Eligibility signals with unknown distinct from no |
| Fit | **KNOWN:** explainable evaluation; exact dimensions are unresolved | **KNOWN:** ranking; exact Fit model is unresolved | **WORKING DIRECTION:** explainable skills, experience, seniority, project, direction, and compensation dimensions; formula unresolved |
| Opportunity Quality | **KNOWN:** legitimacy and red-flag analysis | **UNRESOLVED:** separate Quality analysis not established | **WORKING DIRECTION:** separate Quality analysis for freshness, legitimacy, transparency, signals, and red flags; formula unresolved |
| Evidence | **KNOWN:** Candidate truthfulness rules | **UNRESOLVED:** claim provenance not established | **WORKING DIRECTION:** evidence-backed career memory and provenance; verification model unresolved |
| Application generation | **UNRESOLVED:** exact generation workflow not established; human-in-the-loop submission is known | **KNOWN:** drafter/reviewer workflow and ATS/PDF validation | **WORKING DIRECTION:** truthful preparation may come later; not a required v0.1 capability |
| Application tracking | **KNOWN:** application tracking | **KNOWN:** lifecycle continues through application and outcome | **WORKING DIRECTION:** basic durable pipeline in v0.1 |
| Outcomes | **UNRESOLVED:** outcome use not established | **KNOWN:** outcome tracking and feedback into future decisions | **WORKING DIRECTION:** capture supports a future feedback loop; outcome-trained calibration is outside v0.1 |
| Skill gaps | **UNRESOLVED:** not established | **KNOWN:** skill-gap analysis | **WORKING DIRECTION:** recurring gaps are a long-term insight; personalized learning plans are outside v0.1 |
| Dashboard | **UNRESOLVED:** not established | **UNRESOLVED:** not established | **WORKING DIRECTION:** first-class v0.1 web dashboard answering what deserves attention today |
| API | **UNRESOLVED:** not established | **UNRESOLVED:** not established | **WORKING DIRECTION:** basic v0.1 API supporting the web app; broader public API unresolved |
| CLI | **UNRESOLVED:** runtime agnosticism is known; interface details are not | **UNRESOLVED:** not established | **WORKING DIRECTION:** long-term interface; not complete in v0.1 |
| MCP | **UNRESOLVED:** not established | **UNRESOLVED:** not established | **WORKING DIRECTION:** long-term interface; complete implementation outside v0.1 |
| Self-hosting | **KNOWN:** local-first philosophy | **UNRESOLVED:** not established | **WORKING DIRECTION:** local/self-hosted friendly; hosted boundaries unresolved |
| AI provider independence | **KNOWN:** AI-provider/runtime agnosticism | **UNRESOLVED:** not established | **WORKING DIRECTION:** provider independence where practical; abstraction unresolved |
| Extensibility | **UNRESOLVED:** complete extension model not established | **UNRESOLVED:** complete extension model not established | **WORKING DIRECTION:** future sources, AI providers, notifications, integrations, and regional modules; SDK unresolved |

## Gap the product intends to address

The central working gap is not another generation or scraping feature. It is an Opportunity decision model that treats **Eligibility**, **Fit**, and **Opportunity Quality** as separate, explainable concepts; respects unknown information; and grounds Candidate claims in Evidence. For v0.1, that direction is paired with focused ATS discovery and a durable human-controlled workflow.

## What remains unresolved

The research does not approve a scoring formula, state model, persistence architecture, AI abstraction, adapter interface, or hosted deployment model. These require later specifications and architecture decision records.
