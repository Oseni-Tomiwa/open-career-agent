# User Journeys

## Primary v0.1 journey

```text
Create Career Profile
        ↓
Configure Opportunity Preferences
        ↓
Discover Opportunities
        ↓
Normalize + Deduplicate
        ↓
Eligibility Analysis
        ↓
Fit Analysis
        ↓
Opportunity Quality Analysis
        ↓
Rank
        ↓
Dashboard
        ↓
Shortlist · Investigate · Dismiss
        ↓
Application Pipeline
```

The dashboard should answer: **What Opportunities deserve my attention today?**

## 1. Onboarding — v0.1

The Candidate creates a Career Profile containing skills, experience, projects, basic Evidence, and Opportunity preferences. The workflow distinguishes Candidate-entered or verified facts from missing information. It does not manufacture details to complete the profile.

**Outcome:** a Candidate has enough structured, evidence-aware information to begin discovery and evaluation, while incomplete fields remain explicit.

## 2. Opportunity discovery — v0.1

Background scanning collects job Opportunities through planned Greenhouse, Ashby, and Lever source adapters. Deterministic processing is preferred when public structured ATS data is sufficient. Collected records are normalized around the Opportunity concept and deduplicated before expensive analysis.

**Outcome:** the Candidate receives a manageable set of distinct, current Opportunity records with their source retained.

## 3. Opportunity evaluation — v0.1

The system evaluates each Candidate–Opportunity pair in sequence:

1. Eligibility identifies hard blockers, supporting signals, and decision-relevant unknowns.
2. Fit considers how the Opportunity aligns with the Candidate without overriding Eligibility.
3. Opportunity Quality considers whether the posting itself appears worth pursuing.
4. Ranking combines explainable results without hiding their separate meanings.

The scoring formula, exact states, and confidence model remain unresolved.

**Outcome:** the Candidate can understand why an Opportunity is prioritized, blocked, or uncertain.

## 4. Shortlist, investigate, or dismiss — v0.1

From the dashboard or Opportunity detail, the Candidate chooses:

- **Shortlist** when the Opportunity deserves active attention.
- **Investigate** when missing information could change the decision.
- **Dismiss** when the Opportunity is not worth further effort.

Saving may preserve an Opportunity without yet assigning it to one of these decision states. User choices and analysis context should remain durable for downstream workflows.

**Outcome:** attention is converted into an intentional, reviewable decision.

## 5. Application pipeline — v0.1

The Candidate moves selected Opportunities through a basic application pipeline. The state must remain durable and visible to later workflows. v0.1 does not include automated submission or mass application behavior.

**Outcome:** the Candidate can track progress without losing the evaluation and Evidence that informed the application.

## 6. Feedback loop — future

After v0.1, recorded outcomes may help identify response rates, interview conversion, effective resume versions, promising markets and role categories, recurring skill gaps, rejection patterns, and source effectiveness. Any calibration must remain explainable, privacy-conscious, and resistant to drawing certainty from sparse data.

**Future boundary:** outcome-trained recommendation calibration, personalized learning plans, interview assistance, offer negotiation, and advanced automation are not part of v0.1.
