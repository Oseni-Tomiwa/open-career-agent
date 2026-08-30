# Deterministic Decision Engine V1

## Purpose

The **Decision Engine** translates separate, authoritative upstream outputs—**Eligibility**, **Fit**, and **Opportunity Quality**—into clear, reproducible, and explainable recommendations on how a candidate should spend their attention.

```
Eligibility ─┐
Fit ─────────┼──> Decision Engine ──> Recommendation & Action
Quality ─────┘
```

The Decision Engine is strictly downstream:
- It **does NOT recalculate or re-extract** Eligibility, Fit, or Quality.
- It consumes persisted upstream evaluations, findings, and evidence.
- It preserves the independent authority and epistemic integrity of each dimension.

---

## Canonical Decision Vocabulary

| State | Action | Meaning |
|---|---|---|
| **`high-priority`** | `apply` | Candidate is confirmed eligible, required Fit is strong, and listing Quality is verified and actionable. |
| **`consider`** | `review` | Candidate is eligible, but requirement alignment or listing quality is mixed (moderate fit, manageable gaps, or aging posting). |
| **`investigate`** | `investigate` | Material uncertainty exists (unresolved eligibility or critical listing quality risk) that must be investigated before applying. |
| **`low-priority`** | `review` | Candidate is eligible, but significant requirement gaps exist. |
| **`blocked`** | `do_not_apply` | Current pursuit is blocked by a confirmed upstream fact. `ELIGIBILITY_BLOCKER` preserves Eligibility authority; `LISTING_CLOSED` preserves an explicit operational closure without changing Eligibility. |

---

## Core Invariants & Precedence

1. **Eligibility Gating Invariant (Absolute)**:
   - A confirmed Eligibility Hard Blocker (`ineligible`) **CAN NEVER** be overridden by Strong Fit, Strong Quality, or employer prestige.
   - Decision for a confirmed Eligibility blocker is always **`blocked`** with action **`do_not_apply`**. Eligibility remains the sole authority for whether the Candidate is eligible.
2. **Unknown != No (Investigation Principle)**:
   - Unresolved or missing material eligibility produces **`investigate`**, prompting the candidate to resolve the uncertainty first rather than falsely rejecting them or falsely recommending application.
3. **Quality Risk Isolation**:
   - Quality `risk` (e.g. malformed link, confirmed closed status, severe contradiction) causes an **`investigate`** decision so the user does not waste effort on an unsafe or defunct listing.
   - Quality risk **never makes a candidate ineligible**. An explicit source closure is a `blocked` Decision with `LISTING_CLOSED`; uncertain or remediable Quality risk remains `investigate`.
4. **Fit Prioritization**:
   - Weak Fit lowers priority (`low-priority` or `consider`), but **never creates an ineligibility blocker**.
5. **Human Control Invariant**:
   - A `high-priority` decision with action `apply` signifies recommendation for attention; **it never automatically submits an application**.

---

## State Precedence Rules

1. **Confirmed Eligibility Blocker** $\rightarrow$ **`blocked`** (`do_not_apply`, `ELIGIBILITY_BLOCKER`)
2. **Unresolved / Unknown Eligibility** $\rightarrow$ **`investigate`** (`investigate`)
3. **Missing Upstream Pipeline Data** $\rightarrow$ **`investigate`** (`review` / `investigate`)
4. **Eligible + Explicit Closed/Removed Listing** $\rightarrow$ **`blocked`** (`do_not_apply`, `LISTING_CLOSED`); other critical Quality risks $\rightarrow$ **`investigate`** (`investigate`)
5. **Eligible + Finding-Aware Weak Quality**:
   - If weak solely due to missing transparency (e.g. compensation omitted) + Strong Fit $\rightarrow$ **`high-priority`** (`apply`)
   - If weak due to non-transparency signals (e.g. stale age) + Strong Fit $\rightarrow$ **`consider`** (`review`)
6. **Eligible + Strong Fit + Verified Quality** $\rightarrow$ **`high-priority`** (`apply`)
7. **Eligible + Moderate Fit + Verified Quality** $\rightarrow$ **`consider`** (`review`)
8. **Eligible + Weak Fit + Verified Quality** $\rightarrow$ **`low-priority`** (`review`)

---

## Structured Reason Codes

| Reason Code | Description |
|---|---|
| `ELIGIBILITY_BLOCKER` | Confirmed mandatory requirement conflict. |
| `LISTING_CLOSED` | Source explicitly reports the listing closed or removed. |
| `ELIGIBILITY_UNRESOLVED` | Material eligibility requirement is uncertain or missing candidate evidence. |
| `STRONG_REQUIRED_FIT` | Strong direct evidence match across required dimensions. |
| `MODERATE_FIT` | Partial or transferable requirement alignment. |
| `MATERIAL_FIT_GAPS` | Gaps in required qualifications. |
| `QUALITY_RISK` | Critical quality risk detected on the listing. |
| `QUALITY_UNCERTAINTY` | Listing quality has notable weaknesses or aging signals. |
| `ACTIONABLE_LISTING` | Listing is verified, complete, and operationally actionable. |

---

## Time-Dependent Idempotency & Stale-Input Safety

- **Semantic Input Fingerprint**:
  - Decision input fingerprints hash `engineVersion`, `eligibilityState`, canonical eligibility findings, `fitLevel`, `fitInputFingerprint`, `qualityLevel`, `qualityFreshnessBucket`, and `qualityInputFingerprint`.
  - Database row IDs, volatile persistence timestamps, and array insertion orders are strictly excluded.
- **Stale-Write Protection**:
  - A Decision stores the Eligibility, Fit, and Quality semantic fingerprints it consumed. Its insert transaction succeeds only when those fingerprints still match the unsuperseded Evaluation revision. A later Evaluation supersedes the earlier revision, so an old task cannot become current.
- **Immutable history and provenance**:
  - Quality freshness changes create a superseding Evaluation revision rather than replacing old Quality findings. Decision reasons link to the exact upstream findings, whose Evidence links remain retained.
- **Worker Pipeline Orchestration**:
  ```
  ingestion (source.greenhouse.discover)
    └─> eligibility.evaluate
          └─> fit.evaluate
                └─> quality.evaluate
                      ├─> decision.evaluate
                      └─> [delayed] quality.evaluate (next freshness boundary)
                            └─> superseding Evaluation revision → decision.evaluate
  ```

---

## Boundaries

- **Decision vs. Ranking**: Decision operates on a single opportunity snapshot at a time. It does not compute global percentiles, top 10 lists, or competition scores.
- **Decision vs. Application Tracking**: Decision classifies pursuit merit; it does not advance application workflow state (`Preparing`, `Applied`, `Interview`).
- **Deterministic Explanations**: All summaries and reason codes are generated directly from structured inputs without LLMs.
- **Completion gate**: `high-priority` requires coherent persisted Eligibility, Fit, and Quality inputs with their semantic fingerprints and findings. Unknown, partial, malformed, or missing intelligence cannot be promoted to `high-priority`.
