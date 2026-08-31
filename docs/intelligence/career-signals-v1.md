# Career Signals V1 — Architecture & Aggregation Layer

## Overview

**Career Signals V1** is a candidate-scoped, evidence-backed market aggregation layer built into Rolevia / Open Career Agent. It answers the fundamental question:

> *"What recurring patterns is Rolevia seeing across the candidate's real opportunity market?"*

Career Signals operates strictly as a **read-only view model** built directly on top of canonical, persisted evaluations, findings, decision lineages, and candidate memory claims.

---

## Architectural Invariants

1. **Strict Candidate Scope & Isolation**:
   Signals are evaluated strictly for the requesting `CandidateId`. Cross-candidate data leak is strictly impossible.

2. **Canonical Opportunity Deduplication**:
   Aggregations operate at the canonical `Opportunity` level, consuming only active `DiscoveryMatch` records. When multiple search targets match the exact same opportunity, it is counted exactly **ONCE**.

3. **Active Unclosed Opportunity Market**:
   Confirming a listing as `CLOSED` (via decision `BLOCKED` with reason `LISTING_CLOSED`) excludes that listing from current market signals.

4. **Current Unsuperseded Intelligence Only**:
   Only active, unsuperseded `Evaluation` records (`isNull(evaluations.supersededAt)`) contribute to active market signals.

5. **Non-Prescriptive Evidence-Based Design**:
   Signals state objective facts and occurrence counts (e.g. *"Kubernetes appears in 12 current roles; 8 Fit findings show NO_EVIDENCE"*). Signals NEVER output ungrounded AI advice, career recommendations, or probabilistic scores.

6. **Zero Side-Effects (Read-Only)**:
   Career Signals MUST NEVER write `CandidateClaims`, `Evidence`, `Eligibility`, `Fit`, `Quality`, `Decision`, `Applications`, or `SearchTargets`, and MUST NEVER trigger reevaluations.

---

## Aggregated Signal Families

Rolevia computes seven deterministic signal families:

| Signal Family | Threshold | Description |
| :--- | :--- | :--- |
| `repeated-gap` | $\ge 2$ roles | Repeated missing or weak evidence findings across candidate market roles. |
| `strong-alignment` | $\ge 2$ roles | Recurring strong fit matches demonstrating domain capability alignment. |
| `transferable` | $\ge 2$ roles | Capabilities evaluated as transferable across roles. |
| `eligibility-uncertainty` | $\ge 2$ roles | Recurring unresolved eligibility requirements (e.g., location, visa). |
| `eligibility-blocker` | $\ge 1$ role | Hard eligibility blockers preventing candidate application. |
| `evidence-gap` | $\ge 2$ roles | Required skills in candidate market missing from verified/supported Candidate Memory claims. |
| `market-demand` | $\ge 2$ roles | Most frequent skill & experience dimensions across candidate's active market. |

---

## Deterministic Ordering

Signals within each family are deterministically ordered by:
1. **Affected Opportunity Count / Occurrence Count DESC**
2. **Dimension Key ASC** (alphabetical tie-breaker)

---

## Data Flow & Endpoints

```
Database (DiscoveryMatch, Evaluation, Findings, Claims, Decisions)
       │
       ▼
CareerSignalsRepository.getCareerSignals(candidateId)
       │
       ▼
REST API (GET /candidates/:candidateId/career-signals)
       │
       ▼
@oca/api-client (client.getCareerSignals)
       │
       ▼
Rolevia Web UI (/signals — CareerSignalsPage)
```
