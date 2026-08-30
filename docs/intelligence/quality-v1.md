# Deterministic Opportunity Quality Engine V1

## Purpose

Opportunity Quality evaluates the intrinsic trustworthiness, completeness, freshness, and legitimacy of an Opportunity listing.

Crucially, **Opportunity Quality evaluates the Opportunity listing itself—independent of any Candidate qualifications or Fit**.

- A Candidate may have a 95% Fit score for a low-Quality listing (e.g. stale, conflicting information, missing employer identity).
- A Candidate may have a weak Fit score for a high-Quality listing (e.g. fresh direct ATS posting with complete compensation and location transparency).
- Opportunity Quality is strictly candidate-independent and must never alter or be altered by Candidate Claims or Fit.

---

## 12 Quality Dimensions

Quality V1 evaluates 12 deterministic dimensions:

| Dimension | Category | Importance | Possible States | Description |
|---|---|---|---|---|
| `freshness` | Temporal | `important` | `STRONG`, `ADEQUATE`, `WEAK`, `RISK` | Measures elapsed age since the listing was observed or updated. Classified into 4 deterministic buckets (`recent`, `aging`, `stale`, `very_stale`). |
| `source_confidence` | Provenance | `critical` | `STRONG`, `UNKNOWN`, `RISK` | Assesses listing provenance. Direct Greenhouse ATS adapter listings receive `STRONG`; unverified third-party sources receive `UNKNOWN`; missing provenance receives `RISK`. |
| `content_completeness` | Content | `critical`/`important` | `STRONG`, `ADEQUATE`, `WEAK`, `RISK` | Checks that title, organization, and job description are substantive (not placeholder/empty). |
| `compensation_transparency` | Transparency | `transparency` | `STRONG`, `WEAK` | Checks for explicit compensation ranges or fixed amounts. Missing compensation is a transparency weakness (`WEAK`), not a risk of fraud. |
| `location_clarity` | Specificity | `important` | `STRONG`, `WEAK`, `UNKNOWN` | Verifies explicit geographic boundaries versus vague terms like "global" or "various". |
| `work_model_clarity` | Specificity | `important` | `STRONG`, `UNKNOWN` | Checks for explicit remote, hybrid, or on-site classifications. |
| `employment_type_clarity` | Specificity | `transparency` | `STRONG`, `UNKNOWN` | Checks for explicit full-time, part-time, contract, or internship designations. |
| `application_link` | Operational | `critical`/`important` | `STRONG`, `WEAK`, `RISK` | Validates syntax of retained application URL (`http:`/`https:`). Syntactically malformed URLs produce `RISK`. |
| `listing_status` | Operational | `critical` | `ADEQUATE`, `UNKNOWN`, `RISK` | Detects explicit source closure reports (`closed`/`removed` -> `RISK`). Age alone is never treated as confirmed closure (`UNKNOWN`). |
| `contradictions` | Consistency | `critical`/`important` | `STRONG`, `RISK` | Flags conflicting metadata within the same source observation state (e.g. conflicting location or work model). |
| `content_integrity` | Legitimacy | `critical`/`important` | `STRONG`, `RISK` | Detects obvious placeholder text (e.g. "lorem ipsum", "insert description here") or missing external IDs. |
| `observation_history` | Provenance | `transparency` | `UNKNOWN` | Explains observable observation frequency without treating ordinary reposts as inherently suspicious. |

---

## Freshness Buckets and Deterministic Thresholds

Freshness uses an observable timestamp anchor: `sourceUpdatedAt` if provided, otherwise `snapshot.observedAt`.

- **`recent`** (0–14 days old): `STRONG` finding
- **`aging`** (15–30 days old): `ADEQUATE` finding
- **`stale`** (31–60 days old): `WEAK` finding
- **`very_stale`** (61+ days old): `RISK` finding

### Important Semantic Invariant:
**Age alone is never treated as proof that a listing is closed.**
A 200-day-old listing receives a `very_stale` freshness rating (`RISK` finding on freshness), but its `listing_status` remains `UNKNOWN`, not closed.

---

## Aggregation & Overall Quality Level

The overall Quality level is computed deterministically:

1. **`risk`**: If any **`critical`** dimension evaluates to `RISK` (e.g. malformed application link, explicit closed status, empty/placeholder title or organization, internal contradiction).
2. **`strong`**: Weighted score $\ge 0.80$ across all dimensions.
3. **`moderate`**: Weighted score $\ge 0.55$ and $< 0.80$.
4. **`weak`**: Weighted score $< 0.55$.

Weights: `critical` = 3, `important` = 2, `transparency` = 1.
Credits: `STRONG` = 1.0, `ADEQUATE` = 0.75, `UNKNOWN` = 0.5, `WEAK` = 0.35, `RISK` = 0.0.

---

## Time-Dependent Fingerprinting & Scheduled Reevaluation

Because listing age changes over time, Quality evaluations have time-dependent idempotency:

1. **Input Fingerprint**: Includes `engineVersion`, `snapshotFingerprint`, canonical source observations, and the discrete `freshnessBucket` (`recent`, `aging`, `stale`, `very_stale`).
2. **Freshness Boundary**: When evaluated at day 5, the next discrete boundary occurs at day 15 (`aging`).
3. **Durable Reevaluation**: The worker automatically schedules a delayed background task `quality.evaluate` at the exact timestamp of `nextFreshnessBoundary`.
4. **Stale-Write Protection**: Out-of-order writes where `incoming.evaluatedAt < existing.qualityEvaluatedAt` are atomically rejected. Re-evaluating with newer time updates findings and `qualityEvaluatedAt`.

---

## Worker Execution Order

Evaluations execute through a clean, decoupled durable pipeline:

```
ingestion (source.greenhouse.discover)
  └─> eligibility.evaluate
        └─> fit.evaluate
              └─> quality.evaluate
                    └─> [delayed] quality.evaluate (at next freshness boundary)
```

Each stage operates on immutable snapshots and isolated evaluation dimensions.
