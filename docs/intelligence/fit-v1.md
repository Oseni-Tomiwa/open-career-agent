# Deterministic Fit Engine V1

## Scope and boundary

Fit V1 answers: **How well does the Candidate's demonstrated Evidence match what this Opportunity asks for?** It is deterministic, versioned as `fit-v1`, and independent from Eligibility, Opportunity Quality, and Decision policy.

Ordinary skill, experience, seniority, education-preference, and domain gaps are Fit findings. Work authorization, sponsorship, citizenship, clearance, strict geography, and current-student gates remain Eligibility concerns and are excluded by the Fit extractor. Strong Fit neither implies Eligibility nor overrides an Eligibility blocker. Fit emits no ranking or application recommendation.

## Inputs and outputs

The engine consumes one immutable `OpportunitySnapshot` and the Candidate's current `CandidateClaim` set. Material findings retain the exact requirement excerpt and snapshot reference, Candidate Claim references, and linked Evidence records where those records exist.

The output contains:

- engine version `fit-v1`;
- qualitative overall level `strong`, `moderate`, or `weak`;
- deterministic summary;
- extracted requirements; and
- structured findings.

The overall level is a policy classification, not a probability or percentage.

## Deterministic extraction

The extractor first turns HTML-like content into bounded text fragments. It inspects fragments with explicit requirement or preference cues and normalizes only a deliberately small audited term table. The title contributes seniority only for explicit junior, senior, staff, or principal markers.

Each requirement retains:

- dimension and normalized value;
- label;
- `required`, `preferred`, or `optional` modality;
- exact source excerpt and snapshot reference;
- extraction confidence; and
- minimum years when an explicit duration is present.

Explicit alternatives such as “AWS, GCP, or Azure” form one alternative requirement; any listed option may satisfy it. Negated statements such as “you don't need to be a Ruby specialist” are not requirements. Eligibility-only fragments are excluded.

This is intentionally not a general career ontology or full natural-language parser. Unrecognized terms are omitted rather than guessed.

## Dimensions

V1 can emit requirements in these bounded dimensions when a current deterministic rule supports them:

- technical skills and frameworks;
- tools/platforms;
- programming languages;
- backend, frontend, platform, and DevOps specialization;
- explicit relevant-experience duration;
- explicit title seniority;
- selected domain experience;
- project Evidence supporting an extracted capability requirement;
- architecture/system-design terms;
- cloud/DevOps terms; and
- data/database terms.

Project Evidence can demonstrate a capability. A project claim never supplies professional tenure.

## Candidate Evidence semantics

- `SUPPORTED`: usable positive Evidence; a direct non-project match is normally `STRONG_MATCH`.
- `INFERRED`: cautious positive input; a direct alignment is `PARTIAL`, not established fact.
- `UNKNOWN`: no positive or negative conclusion; produces `UNKNOWN` when it bears directly on the requirement.
- `CONFLICTING`: retains uncertainty and produces `UNKNOWN` rather than a confident positive.
- `UNSUPPORTED`: does not improve Fit and is not treated as proof of inability.
- no claim: produces `NO_EVIDENCE`, explicitly not a negative Candidate Claim.

`GAP` is reserved for an evidenced mismatch, such as a material seniority shortfall. An explicit supported duration below a requested duration produces `PARTIAL`. Unknown duration produces `UNKNOWN` or `NO_EVIDENCE`; exact years are never fabricated.

## Finding states

| State | Meaning |
|---|---|
| `STRONG_MATCH` | Supported Candidate Evidence directly satisfies the requirement. |
| `MATCH` | Direct supported alignment with a qualification, including project-demonstrated capability, but without an implied tenure claim. |
| `PARTIAL` | Only part of the requested depth/scope is supported, or the aligned claim is inferred. |
| `TRANSFERABLE` | An explicit V1 mapping supports related capability, never exact experience. |
| `GAP` | Candidate Evidence establishes a material mismatch. |
| `NO_EVIDENCE` | No usable positive Evidence was found; this does not assert lack of ability. |
| `UNKNOWN` | Direct Candidate information is unknown, ambiguous, or conflicting. |

## Transferability mappings

Mappings are directional and auditable:

- Docker → Kubernetes;
- Express → Fastify;
- Fastify → Express;
- AWS → Azure or GCP;
- Azure → AWS or GCP; and
- GCP → AWS or Azure.

No configured relationship means no transfer inference. A transfer finding receives 0.6 aggregation credit but remains visibly different from a direct match.

## Aggregation

Aggregation is reproducible from findings:

| Finding | Credit |
|---|---:|
| `STRONG_MATCH` | 1.0 |
| `MATCH` | 0.9 |
| `TRANSFERABLE` | 0.6 |
| `PARTIAL` | 0.5 |
| `GAP`, `NO_EVIDENCE`, `UNKNOWN` | 0.0 |

When required requirements exist, only required findings determine the base level: average credit of at least 0.8 is `strong`, below 0.35 is `weak`, and the remainder is `moderate`. Preferred and optional gaps therefore cannot reduce strong fulfillment of all required requirements. When there are no required requirements, preferred findings are used, but the maximum level is `moderate`. With no extracted required or preferred findings, Fit is `weak` because deterministic Evidence is insufficient.

## Persistence, history, and idempotency

Fit populates the Fit fields and `fit` findings of the existing shared `Evaluation`; it does not overwrite Eligibility and leaves Quality null. `fitEngineVersion`, a deterministic summary, and an input fingerprint are retained. Finding Evidence includes a source-verified requirement excerpt and linked Candidate Evidence where present.

The input fingerprint covers the snapshot fingerprint, engine version, and a canonical ordering of Candidate Claim kind, value, relevant scope, epistemic state, confidence, and linked Evidence type/state/source/excerpt. Persistence row IDs and creation/update timestamps are deliberately excluded because they do not change semantic Candidate knowledge. Candidate + snapshot + version + identical fingerprint is unique, so duplicate task delivery cannot append another Fit result. A changed Candidate knowledge state, relevant Evidence, snapshot, or engine version can produce a new historical result.

The Fit dimension on a shared Evaluation is write-once. Its summary, version, fingerprint, findings, and finding Evidence are claimed and persisted in one transaction only while every Fit field is null. A stale Fit task therefore cannot replace a completed Fit dimension. Eligibility fields and findings use separate columns and finding categories and are never included in a Fit update; a later Quality implementation has the same unambiguous category/column boundary.

The worker schedules `fit.evaluate` after `eligibility.evaluate`, regardless of the Eligibility result. Engine internals remain independent.

## Known limitations and future bounded-model role

- The term table deliberately has limited recall and omits unknown technologies and domains.
- Requirement cues, alternatives, negation, duration, and title seniority cover explicit wording only.
- Alternative lists are treated as “any one” and cannot yet represent nested combinations such as “two of these five.”
- Dated employment intervals are not yet a structured Candidate Claim, so V1 consumes explicit supported duration claims rather than calculating overlapping tenure.
- Ambiguous titles, responsibility depth, recency, architecture scope, and nuanced project relevance remain unknown or unextracted.
- Generic concepts not in the term table, such as arbitrary “infrastructure-as-code” wording, may be omitted.

A later bounded model may propose requirements or transfer relationships for validation, with exact excerpts and derivation provenance. It must not change V1 findings, fabricate Candidate facts, treat missing Evidence as negative Evidence, or bypass the Eligibility boundary.
