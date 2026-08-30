# Intelligence and AI Provider Boundary

## Purpose

The intelligence boundary keeps ordinary application logic, deterministic rules, model-assisted interpretation, and human authority distinct. An AI model is an optional capability behind the architecture—not the architecture itself.

The domain behavior remains defined by the [intelligence specifications](../intelligence/README.md), regardless of whether a rule, model, or human produced a proposed interpretation.

## Work classifications

- **Deterministic:** same validated inputs and policy version should produce the same result without model judgment.
- **Model-assisted:** a model may propose an interpretation for validation; deterministic/domain constraints still govern acceptance.
- **Model-optional:** the system must have a useful deterministic or human-review path without a model; a model may improve recall, explanation, or convenience.
- **Human-required:** Candidate or authorized human judgment is authoritative before the consequential state change.

A task may contain more than one classification at different stages.

## Classification by task

| Task | Primary classification | Required behavior |
|---|---|---|
| ATS fetching | Deterministic | Use documented/public source behavior, retain responses and errors; no model needed |
| Structured source parsing | Deterministic | Map explicit fields and preserve missing/parse-failure distinctions |
| Cross-source normalization | Deterministic | Apply versioned mappings; never invent absent values |
| Exact identity/deduplication | Deterministic | Use source IDs, URLs, fingerprints, and scoped rules |
| Uncertain duplicate candidates | Model-optional | Semantic similarity may propose links; uncertain results never silently merge |
| Explicit Requirement extraction | Deterministic first | Extract headings, structured fields, and clear phrases with exact Evidence |
| Ambiguous free-text Requirement interpretation | Model-assisted | Produce scoped Claim proposals with excerpt, strength, and inference provenance; validate before domain use |
| Sponsorship phrase extraction | Deterministic first; model-assisted for ambiguity | Explicit yes/no phrases retain quotes; absence stays unknown; indirect language is an inference |
| Eligibility Hard Blocker decision | Deterministic over validated Claims | Apply mandatory + Candidate conflict + materiality + scope + no unresolved override; a model cannot bypass the test |
| Exact skill matching | Deterministic | Match normalized supported Candidate Claims to explicit Requirements |
| Semantic skill matching | Model-optional | Propose uncertain/related matches with provenance; never turn absence into a Candidate fact |
| Transferable-skill reasoning | Deterministic for approved V1 mappings; otherwise model-assisted or human-reviewed | Explain the relationship and retain Candidate Evidence; an unapproved relationship remains unresolved and is never presented as exact experience |
| Observable Quality signals | Deterministic first | Freshness, source provenance, redirects, duplicates, and inconsistencies are computed from Evidence |
| Quality interpretation | Model-assisted where useful | Summarize observable risk without declaring employer intent or definitive “ghost jobs” |
| Explanation assembly | Deterministic essential; model-optional prose | A structured explanation is always available; model rewriting cannot change Claims, certainty, or Decision |
| Candidate Claim drafting | Model-assisted | Every material Claim passes deterministic provenance and safety checks |
| Material Candidate inference | Human-required before use as fact | Confirmation must create/link adequate Evidence; model confidence is insufficient |
| Application submission | Human-required | Materials being generated or prepared never imply submission |

## Deterministic pipeline expectations

The system should complete as much work as possible before invoking a model:

1. fetch and retain Source Records;
2. parse structured fields;
3. normalize source-neutral observations;
4. perform exact identity and duplicate checks;
5. filter records using explicit Candidate Preferences where safe;
6. extract known deterministic Requirement and sponsorship phrases;
7. evaluate explicit Eligibility comparisons; and
8. identify only the unresolved work that could benefit from model assistance.

This reduces cost and latency while making failures and regressions reproducible.

## Model-assisted proposal boundary

A model response is an untrusted proposal. Before entering domain state it must:

- conform to a provider-neutral expected response shape;
- reference the exact Candidate or Opportunity Evidence used;
- distinguish extracted fact from inference and information absence;
- carry provider/model, operation, prompt/template version, time, and input-reference provenance;
- pass domain validation and claim-safety rules;
- preserve contradictions and qualifiers;
- avoid unsupported Candidate Claims; and
- fail closed into partial/unknown/review state when validation fails.

Model output never silently overwrites Source Records, Candidate Evidence, Requirements, or deterministic conclusions. A correction or alternative interpretation is a new proposed Claim linked to its derivation.

## AI Provider boundary

The application may define provider-neutral capabilities such as “interpret Requirements from bounded Evidence” or “propose transferable-skill explanations.” The boundary should accept domain-neutral task input references and return validation-ready proposals rather than provider SDK objects.

Requirements:

- core domain modules do not import provider-specific request, response, tool, or error types;
- credentials and provider configuration remain server-side;
- prompts are implementation assets, not canonical domain state;
- provider selection can eventually be configured per supported capability;
- local models remain possible if they satisfy the same validation and provenance contract;
- provider retries, rate limits, timeouts, and failures are isolated from deterministic state; and
- switching provider cannot change non-negotiable domain invariants.

The complete provider SDK and routing strategy are intentionally not designed here.

## Confidence boundary

Provider-reported probability, sampling behavior, or self-described confidence must not become factual Evidence. The system retains separate extraction confidence, inference confidence, Evaluation confidence, and Evidence completeness as defined by the intelligence specifications.

High confidence that no sponsorship phrase was found still leaves actual sponsorship availability unknown.

## Explanation behavior

Canonical explanations should first be assembled from structured Claims, Evidence, assessment results, contradictions, and policy reasons. A model may optionally improve readability, but the rewritten explanation must be checked for semantic equivalence and must not add facts, certainty, or recommendations.

The non-model explanation path ensures local operation remains useful when no provider is configured or a provider fails.

## Candidate claim safety

Only Supported and faithful Supported-rephrase Claims may enter generated application materials automatically. Material Inferences require human confirmation and adequate Evidence. Unsupported Claims are rejected. Employers, dates, technologies, metrics, team sizes, certifications, education, responsibilities, and outcomes are never invented.

Claim validation runs after every model drafting or rewriting step, not only at final export.

## External-content security

Job descriptions, company pages, resumes, portfolio content, and model responses are untrusted data. They must be clearly separated from system instructions and capability configuration. Model calls should minimize supplied content and deny external text authority to request tools, secrets, network access, or policy changes.

Prompt injection and data exfiltration require a dedicated future threat model. Until then, model-assisted external-content processing should use least privilege, no browser/source credentials, no unnecessary Candidate Evidence, and explicit output validation.

## Failure behavior

- Fetching or deterministic state remains committed when a later model task fails.
- Failed or invalid model proposals do not modify canonical Claims.
- Assessments can be visibly partial; Decision policy must not present certainty unsupported by completed inputs.
- Retry uses the background-processing policy and cannot create duplicate domain effects.
- A provider outage degrades model-assisted features rather than corrupting discovery, Application history, or user-entered facts.

## Unresolved decisions

- Exact deterministic phrase and Requirement extractors
- Semantic matching and embeddings/vector-search need
- Provider-neutral capability contract and SDK
- Model routing, configuration, and local-model support level
- Prompt/template versioning and evaluation
- Validation strictness and human-review UX
- Confidence representation and calibration
- Threat model and prompt-injection mitigations
- Cost, latency, privacy, and provider-retention policies
