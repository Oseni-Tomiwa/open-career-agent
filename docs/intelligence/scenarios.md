# Intelligence Scenarios

## How to read these scenarios

These examples exercise the behavioral specifications. `HIGH_PRIORITY`, `CONSIDER`, `INVESTIGATE`, `LOW_PRIORITY`, and `INELIGIBLE` are working Decision labels, not final enums. Each result assumes the cited Evidence is current and correctly scoped unless uncertainty is stated. Real Evaluations must consider all relevant Requirements; these scenarios isolate particular issues for clarity.

## 1. Explicit sponsorship available

- **Opportunity Evidence:** The role-specific ATS listing states, “Visa sponsorship is available for qualified candidates,” observed today.
- **Relevant Candidate Evidence:** The Candidate confirms they require employer sponsorship for the Opportunity country; the fact is current.
- **Eligibility interpretation:** The sponsorship need is compatible with the explicit role policy. Other authorization conditions remain separately evaluable.
- **Hard Blocker:** None from sponsorship.
- **Fit impact:** None. Sponsorship is an Eligibility condition, not a skill match.
- **Uncertainty:** “Qualified candidates” may hide conditions not described; extraction confidence is high, while policy completeness is moderate.
- **Recommended Decision:** `CONSIDER`, subject to Fit and Quality; it may become `HIGH_PRIORITY` if those analyses are strong.
- **Explanation:** Role-specific Evidence explicitly supports sponsorship, so sponsorship should not suppress the Opportunity. Investigate any undefined sponsorship conditions if they become material.

## 2. Explicit no sponsorship and Candidate requires it

- **Opportunity Evidence:** The current ATS listing states, “We cannot provide visa sponsorship for this position.”
- **Relevant Candidate Evidence:** The Candidate has confirmed they require sponsorship to work in the Opportunity country.
- **Eligibility interpretation:** An explicit, role-specific mandatory limitation conflicts with a current Candidate need.
- **Hard Blocker:** Confirmed sponsorship blocker, absent credible exception or contradictory Evidence.
- **Fit impact:** Fit may still be evaluated and may be high; it does not remove the blocker.
- **Uncertainty:** Low if both Claims are current, scoped, and uncontradicted.
- **Recommended Decision:** `INELIGIBLE` for current pursuit.
- **Explanation:** The employer explicitly cannot provide something the Candidate requires. The Decision would change if the Candidate obtained independent authorization or role-specific policy changed.

## 3. Sponsorship not mentioned

- **Opportunity Evidence:** The complete captured ATS listing contains no sponsorship or work-authorization statement.
- **Relevant Candidate Evidence:** The Candidate requires sponsorship.
- **Eligibility interpretation:** Sponsorship availability is unknown. No negative policy was observed.
- **Hard Blocker:** None; absence of a statement is not proof of unavailability.
- **Fit impact:** None directly. Fit should be evaluated independently.
- **Uncertainty:** High confidence that the captured listing lacks sponsorship language; low confidence about the employer's actual sponsorship behavior.
- **Recommended Decision:** `INVESTIGATE` if sponsorship determines pursuit.
- **Explanation:** The missing policy could change Eligibility. Check role-specific application questions or ask the employer; do not silently convert unknown to no.

## 4. Ambiguous existing-authorization wording

- **Opportunity Evidence:** The listing says, “Applicants should have existing authorization to work in the UK,” without “must,” sponsorship language, or an explanation of exceptions.
- **Relevant Candidate Evidence:** The Candidate requires sponsorship to work in the UK.
- **Eligibility interpretation:** The wording supports a probable negative sponsorship inference but is not an explicit prohibition. “Should” and the missing policy leave ambiguity.
- **Hard Blocker:** None confirmed.
- **Fit impact:** None directly; the issue belongs to Eligibility.
- **Uncertainty:** Medium confidence in the negative inference, high confidence in the extracted text, and low policy completeness.
- **Recommended Decision:** `INVESTIGATE`.
- **Explanation:** Existing authorization appears expected, but the Evidence is insufficient for a Hard Blocker. A role-specific confirmation of no sponsorship would change the Decision to `INELIGIBLE`.

## 5. Current-student Requirement with non-student Candidate

- **Opportunity Evidence:** A graduate internship listing states, “Applicants must be currently enrolled for the full internship period.”
- **Relevant Candidate Evidence:** Current education records and Candidate confirmation show the Candidate graduated last year and is not enrolled.
- **Eligibility interpretation:** A clear, applicable program Requirement conflicts with verified current status.
- **Hard Blocker:** Confirmed enrollment blocker.
- **Fit impact:** Skills and project Fit may be strong but cannot override program Eligibility.
- **Uncertainty:** Low if the listing and enrollment Evidence are current and no exception is stated.
- **Recommended Decision:** `INELIGIBLE`.
- **Explanation:** Current enrollment is explicitly mandatory and unmet. The result would change only with current enrollment or an employer-confirmed exception.

## 6. Degree preferred and Candidate has no degree

- **Opportunity Evidence:** The listing states, “Bachelor's degree in computer science preferred.”
- **Relevant Candidate Evidence:** The Candidate confirms no degree and provides supported project and work Evidence.
- **Eligibility interpretation:** A preference is not an Eligibility gate.
- **Hard Blocker:** None.
- **Fit impact:** Record a missing preferred credential; transferable work or project Evidence may offset some Fit impact but does not become a degree.
- **Uncertainty:** Low about Requirement strength; the employer's practical weighting of the preference is unknown.
- **Recommended Decision:** `CONSIDER` if other important Requirements match.
- **Explanation:** The Candidate lacks a preferred credential, which may reduce Fit but does not make pursuit unrealistic.

## 7. Years-of-experience mismatch

- **Opportunity Evidence:** The listing says, “5+ years of backend engineering experience,” but does not identify it as a legal, program, or automatic screening gate.
- **Relevant Candidate Evidence:** Verified work history establishes three years of relevant backend experience.
- **Eligibility interpretation:** Treat the duration as a Fit expectation unless additional Evidence establishes a strict eligibility gate.
- **Hard Blocker:** None on the supplied Evidence.
- **Fit impact:** Partially matched; reduce relevant-experience Fit and retain the two-year gap.
- **Uncertainty:** The Requirement's practical strictness is ambiguous, though the duration comparison is well evidenced.
- **Recommended Decision:** `CONSIDER` or `LOW_PRIORITY` based on other supported Fit and Quality signals.
- **Explanation:** Three verified years partially satisfy the requested experience. Do not mark ineligible without adequate Evidence that five years is mandatory for pursuit.

## 8. Preferred skill missing

- **Opportunity Evidence:** The listing says, “Kubernetes experience preferred.”
- **Relevant Candidate Evidence:** The profile contains Docker and deployment Evidence but no Kubernetes Claim or Candidate-confirmed absence.
- **Eligibility interpretation:** No Eligibility effect because the skill is preferred.
- **Hard Blocker:** None.
- **Fit impact:** Kubernetes is an uncertain or missing preferred match. Container deployment Evidence may be identified as transferable, but not as proof of Kubernetes experience.
- **Uncertainty:** It is unknown whether the Candidate has unrecorded Kubernetes experience; the wording's preferred strength is clear.
- **Recommended Decision:** `CONSIDER` if mandatory Requirements match.
- **Explanation:** Record the skill gap and related transferable Evidence. Do not invent Kubernetes experience or treat the preference as a gate.

## 9. Citizenship Requirement

- **Opportunity Evidence:** The listing explicitly states, “This role is open to US citizens only due to contract requirements.”
- **Relevant Candidate Evidence:** The Candidate confirms citizenship of another country and no US citizenship; the Claim is current.
- **Eligibility interpretation:** The explicit, applicable citizenship restriction conflicts with Candidate Evidence.
- **Hard Blocker:** Confirmed citizenship blocker, absent an employer-confirmed exception or contradictory role-specific Evidence.
- **Fit impact:** Technical Fit remains separate and may still be described.
- **Uncertainty:** Low if the requirement scope and Candidate Claim are unambiguous.
- **Recommended Decision:** `INELIGIBLE`.
- **Explanation:** The role is explicitly restricted to a citizenship status the Candidate does not hold. Work authorization alone would not satisfy the stated Requirement.

## 10. Active security-clearance Requirement

- **Opportunity Evidence:** The listing says, “Active Secret clearance is required at the time of application.”
- **Relevant Candidate Evidence:** The Candidate confirms they have no security clearance.
- **Eligibility interpretation:** The Requirement asks for current possession, not merely eligibility to obtain clearance.
- **Hard Blocker:** Confirmed clearance blocker.
- **Fit impact:** Domain or technical Fit may be strong but cannot satisfy the clearance Requirement.
- **Uncertainty:** Low if “active” and “at the time of application” are role-specific and current.
- **Recommended Decision:** `INELIGIBLE`.
- **Explanation:** Candidate Evidence conflicts with an explicit current-clearance gate. The result could change if the employer accepts later clearance or the Candidate obtains it.

## 11. Conflicting sponsorship Evidence

- **Opportunity Evidence:** The ATS listing says, “No sponsorship available.” A current employer immigration page says, “We sponsor qualified engineering candidates.” Both sources are official and observed today.
- **Relevant Candidate Evidence:** The Candidate requires sponsorship.
- **Eligibility interpretation:** The role-specific source suggests a blocker, while the general policy suggests a possible exception. The conflict may be explained by role scope but is not resolved by assumption.
- **Hard Blocker:** Possible, not confirmed while the material contradiction remains unresolved.
- **Fit impact:** None directly; Fit remains independent.
- **Uncertainty:** High decision-relevant uncertainty despite high extraction confidence for both statements.
- **Recommended Decision:** `INVESTIGATE`.
- **Explanation:** Retain and show both sources. Ask whether the general engineering policy applies to this role; do not silently prefer the favorable or unfavorable answer.

## 12. High technical Fit but low Opportunity Quality

- **Opportunity Evidence:** The Candidate-facing listing strongly matches the role, but it is nine months old, its application link redirects to an unrelated form, location differs across two copies, and no current employer careers-page version is found.
- **Relevant Candidate Evidence:** Verified skills, projects, and experience directly match the important technical Requirements.
- **Eligibility interpretation:** No confirmed blocker on available Evidence, but the listing's current availability is uncertain.
- **Hard Blocker:** None.
- **Fit impact:** High supported technical Fit.
- **Uncertainty:** High Quality uncertainty: the observable signals do not prove a “ghost job” or fraud, but they undermine confidence that this is a current, legitimate application path.
- **Recommended Decision:** `INVESTIGATE` or `LOW_PRIORITY`, not immediate high priority.
- **Explanation:** Strong Candidate alignment does not repair low listing Quality. Verify the role on an official current source before sharing information or investing application effort.

## 13. Mandatory working-hours conflict

- **Opportunity Evidence:** The role states, “All team members must work 09:00–17:00 Pacific Time; alternative schedules are unavailable.”
- **Relevant Candidate Evidence:** The Candidate confirms they cannot work those hours and can offer only a non-overlapping schedule.
- **Eligibility interpretation:** A clear operational condition conflicts with a current Candidate constraint.
- **Hard Blocker:** Confirmed working-hours blocker for the present Candidate context.
- **Fit impact:** Skills and experience Fit remain independently evaluable.
- **Uncertainty:** Low if the role wording and Candidate availability are current; time-zone conversion should be checked deterministically, including daylight-saving changes.
- **Recommended Decision:** `INELIGIBLE` under current availability.
- **Explanation:** The mandatory schedule and Candidate availability do not overlap, and the listing rules out alternatives. A change in Candidate availability or employer flexibility would change the Decision.

## Scenario-derived test invariants

Future automated tests should be able to express at least these expectations:

- explicit sponsorship availability does not penalize a Candidate merely for needing sponsorship;
- explicit sponsorship unavailability plus verified need creates a blocker;
- absent sponsorship information creates an unknown, not a negative fact;
- ambiguous authorization language does not create a confirmed blocker;
- explicit student, citizenship, clearance, or schedule gates can block when Candidate Evidence conflicts;
- preferred education or skills affect Fit rather than Eligibility;
- experience duration normally affects Fit unless strict gating Evidence exists;
- contradictory material Evidence produces investigation;
- high Fit cannot override low Quality risk or an Eligibility blocker; and
- every conclusion retains the Evidence and facts that would change it.
