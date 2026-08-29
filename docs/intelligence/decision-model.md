# Decision and Ranking Model

## Purpose

A Decision translates a separate Eligibility, Fit, and Opportunity Quality Evaluation into guidance about where the Candidate should spend attention. It is a recommendation, not an application action. No final mathematical ranking formula is approved.

## Behavioral constraints

1. Confirmed Eligibility Hard Blockers gate immediate-application recommendations.
2. Fit never overrides a confirmed Hard Blocker.
3. A material Eligibility unknown normally creates investigation work, not automatic rejection.
4. Opportunity Quality changes priority but cannot make an ineligible Candidate eligible.
5. Missing Candidate Evidence must not be treated as a supported match or an automatic mismatch unless the Candidate explicitly confirms absence.
6. Contradictions that could change a Decision must be surfaced and normally prevent a certainty-heavy recommendation.
7. Decisions must retain their supporting Evidence, policy reasons, confidence, completeness, and change conditions.
8. A numeric Fit value, if introduced later, cannot be compared without Eligibility context.

Therefore, a technically perfect Opportunity with a confirmed Hard Blocker must not rank as an immediate application recommendation. An Opportunity with lower Fit but confirmed Eligibility may deserve more immediate attention than one with higher Fit and unavailable work authorization.

## Working decision vocabulary

The following labels describe behavior and are not frozen enums.

### High priority

Justified when:

- no confirmed Hard Blocker exists;
- material Eligibility issues are sufficiently evidenced;
- Fit has strong supported matches for important Requirements;
- Quality has no unresolved severe warning signal; and
- Evidence completeness is adequate for action.

The explanation should name decisive matches, any remaining non-material gaps, and why action is timely.

### Consider

Justified when the Opportunity is realistically pursuable but Fit, Quality, timing, or evidence completeness is mixed rather than clearly strong. This may include partial matches, manageable gaps, or moderate Quality concerns that do not require resolution before ordinary review.

### Investigate

Justified when a missing, inferred, ambiguous, stale, or contradictory fact could materially change Eligibility or priority. Unknown sponsorship for a Candidate who requires sponsorship is the canonical example. The Decision must name the question, current Evidence, and what answer would change the outcome.

### Low priority

Justified when no confirmed Hard Blocker exists but supported Fit is weak, important non-gating Requirements are missing, Candidate Preferences conflict, Quality is low, or stronger Opportunities deserve attention first. Low priority must not be used as a disguised ineligible state.

### Ineligible

Justified only when at least one confirmed Hard Blocker passes the Eligibility test: an applicable explicit mandatory Requirement conflicts with adequate Candidate Evidence, is material to pursuit, and has no unresolved exception or contradiction.

The explanation must quote or reference the blocking Requirement, identify the conflicting Candidate fact, and state what change could remove the blocker.

## Decision policy without a final formula

Decision behavior can be specified as ordered constraints rather than weights:

1. **Check confirmed blockers.** If present, return an ineligible recommendation for current pursuit, while preserving Fit and Quality explanations.
2. **Check material Eligibility uncertainty.** If resolving an unknown or contradiction could produce a blocker, prefer investigate over immediate-application priority.
3. **Check severe Quality risk.** If observable risk makes the Opportunity unsafe or unreliable, lower priority or investigate without changing Eligibility or Fit.
4. **Compare supported Fit and Candidate Preferences.** Among realistically pursuable Opportunities, stronger supported alignment generally raises priority.
5. **Consider Quality and timeliness.** Fresh, transparent, well-sourced Opportunities generally deserve attention ahead of otherwise similar lower-Quality records.
6. **Expose the reasons.** Never emit a label or rank without decisive Evidence, unknowns, and change conditions.

This ordering is a behavioral contract, not a scoring formula. Later ranking research may justify weights or calibration, but it must preserve the gates and explanations above.

## Ranking behavior

Ranking should organize attention within meaningful decision groups rather than imply false comparability:

- Confirmed ineligible Opportunities should not outrank actionable Opportunities for immediate application, regardless of Fit.
- Investigate items should remain visible when the missing answer has high decision value.
- Among eligible or sufficiently eligible Opportunities, supported Fit may be the primary differentiator, moderated by Quality, Candidate Preferences, freshness, and evidence completeness.
- Low Quality can lower or hold an otherwise high-Fit Opportunity for review.
- Low Fit does not make a high-Quality Opportunity a strong Candidate match.
- Ties or near-ties should expose tradeoffs rather than manufacture precise separation.

Example: an “87% Fit” Opportunity with clear Eligibility may deserve higher priority than a “96% Fit” Opportunity requiring unavailable authorization. The percentages are illustrative only; no percentage model is approved.

## Decision evidence

Every Decision should conceptually retain:

- the separate Eligibility, Fit, and Quality results;
- confirmed Hard Blockers and the Evidence supporting both sides of each conflict;
- decisive matched, partial, missing, uncertain, and transferable Requirements;
- positive and negative Quality signals;
- material unknowns and contradictions;
- confidence and completeness attached to each decisive conclusion;
- the policy constraint that selected the Decision;
- recommended investigation, if any; and
- facts or Evidence that would change the Decision.

## Decision changes and durability

A Decision is a time-bound conclusion from observed Evidence. It should be re-evaluated when material Candidate facts, Opportunity content, source freshness, contradictions, or Candidate Preferences change. A new Decision should not erase the Evidence or explanation for the earlier one; future outcome learning requires knowing what was believed at the time.

The Candidate remains free to shortlist, dismiss, or pursue against the recommendation. Human actions and system Decisions should be distinguishable.

## Confidence in Decisions

Decision confidence depends on the reliability and completeness of decisive conclusions, not the average confidence of every extracted field. One unresolved sponsorship question can make an otherwise detailed Evaluation unsuitable for a high-priority recommendation.

The Decision should distinguish:

- confidence that decisive source information was extracted correctly;
- confidence in any inference used by policy;
- confidence that the Evaluation comparison is sound; and
- completeness of Evidence needed for the recommendation.

It must not convert high confidence in information absence into high confidence about the missing real-world fact.

## Unresolved questions

- What final user-facing Decision labels and transitions are clearest?
- Should investigation urgency be separate from application priority?
- How should Candidate risk tolerance and Preferences influence Decision policy?
- Which Quality warnings should hold a recommendation rather than merely lower priority?
- What ranking formula or calibration, if any, can be justified after dogfooding?
- How should rank stability and changes be explained over time?
- How should stale Evidence trigger re-evaluation?
- Which decisions can be deterministic, and where is bounded model reasoning appropriate?
