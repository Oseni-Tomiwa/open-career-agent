# Eligibility Specification

## Purpose

Eligibility answers: **Can this Candidate realistically pursue this Opportunity?** It evaluates practical constraints before Fit. It does not measure how attractive the Candidate is to the employer, and a high Fit assessment cannot erase an Eligibility blocker.

This specification defines behavior, not storage or implementation types.

## Core model

Eligibility evaluates a set of issue-specific Claims derived from Candidate Evidence and Opportunity Evidence. Each issue should preserve five independent questions:

1. What does the Opportunity require or permit?
2. What relevant fact is known about the Candidate?
3. How strong and authoritative is the Evidence for each Claim?
4. Do the Claims satisfy, conflict, or remain incomparable?
5. Would the result prevent pursuit, require investigation, or leave Eligibility unaffected?

An Eligibility result should expose satisfied conditions, Hard Blockers, material unknowns, contradictions, and the Evidence behind each conclusion. Exact aggregate labels remain unresolved. Working concepts may include eligible, ineligible, eligible with unknowns, and needs investigation.

## Facts, Evidence, confidence, and uncertainty

These concepts must not be collapsed:

| Concept | Meaning | Example |
|---|---|---|
| Fact value | The asserted state of the world | “Sponsorship is available for this role.” |
| Evidence | The retained source supporting or contradicting a Claim | A sentence in the ATS listing with URL and observation date |
| Confidence | Confidence in a named extraction, inference, or evaluation | High confidence that the sentence was extracted correctly |
| Information absence | A search found no statement within a defined source and scope | No sponsorship language found in the captured listing |
| Inference | A conclusion not stated directly but suggested by Evidence | “Must already be authorized” suggests sponsorship is probably unavailable |
| Contradiction | Credible Evidence supports incompatible Claims | ATS says no sponsorship; employer policy says some engineers are sponsored |

An LLM's confidence is metadata about its interpretation, not Evidence that the underlying Claim is true.

### Working value language

Implementations need to represent at least:

- explicit affirmative and explicit negative facts;
- unknown because relevant information was not found;
- probable affirmative or probable negative inference;
- conditional or scoped facts;
- not applicable where a signal does not apply.

Names such as `YES`, `NO`, `UNKNOWN`, `PROBABLY_YES`, and `PROBABLY_NO` are illustrative rather than frozen enums.

Examples:

| Observation | Fact interpretation | Confidence interpretation |
|---|---|---|
| “Visa sponsorship is available.” | Explicit affirmative | High extraction confidence if quoted from the listing |
| “We cannot sponsor visas.” | Explicit negative | High extraction confidence if unambiguous and role-specific |
| Sponsorship is not mentioned | Unknown sponsorship policy | Possibly high confidence that the captured source lacks the information, but low confidence about actual employer behavior |
| “Applicants must have unrestricted authorization.” | Probable negative for sponsorship, subject to context | Medium inference confidence; not equivalent to an explicit no-sponsorship statement |

## Requirement strength

Every Opportunity Requirement used by Eligibility must retain how its force was established.

### Explicit mandatory Requirement

Direct language makes the condition necessary: “must,” “required,” “only,” “cannot,” or an equally clear formulation in context. It may create a Hard Blocker when applicable and contradicted by reliable Candidate Evidence.

### Preferred Requirement

Language such as “preferred,” “a plus,” “nice to have,” or “ideally” indicates desirability rather than a gate. A mismatch may affect Fit, not Eligibility.

### Inferred Requirement

The evaluator derives a likely condition from indirect language or context. It must retain its inference chain and uncertainty. It should normally prompt investigation rather than create a Hard Blocker.

### Ambiguous Requirement

The wording has multiple reasonable interpretations, unclear scope, or insufficient context. It cannot become a Hard Blocker without clarifying Evidence.

The evaluator must consider negation, scope, exceptions, and whether wording applies to the specific Opportunity rather than a general employer policy.

## Hard Blockers

A Hard Blocker is a current incompatibility that makes pursuit unrealistic. It should be asserted only when all of the following hold:

1. **Mandatory:** reliable Evidence establishes an explicit, applicable mandatory Requirement.
2. **Candidate conflict:** reliable Candidate Evidence establishes that the Candidate does not satisfy it, or requires something explicitly unavailable.
3. **Materiality:** failure truly prevents pursuit rather than merely reducing competitiveness.
4. **Scope:** both Claims apply to the same Opportunity, location, time, and Candidate context.
5. **No unresolved override:** no credible contradiction or exception makes the conclusion uncertain.

If any condition is missing, the system should record an unknown, possible blocker, Fit gap, or investigation item—not a confirmed Hard Blocker.

### Typical Hard Blocker examples

- “Must be currently enrolled,” with verified Evidence that the Candidate is not enrolled.
- “US citizens only,” with verified Evidence that the Candidate is not a US citizen.
- “Must hold active Secret clearance,” with verified Evidence that the Candidate does not hold it.
- “We cannot sponsor visas,” with Candidate Evidence showing sponsorship is required.

### Requirements that are not automatically Hard Blockers

- “5+ years preferred” when the Candidate has three verified years.
- “BS preferred” when the Candidate has no degree.
- “Experience with Kubernetes” without clear mandatory language.
- “German is a plus” when the Candidate has no German Evidence.

These may reduce Fit or create a gap. Ambiguous language must never become a Hard Blocker merely because an evaluator finds the inference plausible.

## Eligibility signal coverage

No signal is intrinsically a blocker; wording, scope, Candidate context, and Evidence determine behavior.

| Signal | Questions to evaluate | Possible Eligibility effect |
|---|---|---|
| Opportunity and Candidate location | Where is work performed, and where is the Candidate located? | Block only when an applicable location condition is mandatory and incompatible |
| Remote geography | From which countries, regions, or time zones may remote work occur? | Restricted remote geography may block; “remote” alone proves no global eligibility |
| Work authorization | What authorization is explicitly required, and what does the Candidate hold? | Confirmed mismatch may block; absent policy remains unknown |
| Visa sponsorship | Is sponsorship offered, unavailable, conditional, or unstated? Does the Candidate require it? | Explicit unavailability plus need may block; silence prompts investigation |
| Relocation support | Is physical presence required, and can or will either party support relocation? | Lack of support blocks only when relocation is necessary and the Candidate cannot relocate independently |
| Citizenship or residency | Is a status explicitly mandatory for legal, contractual, or policy reasons? | Confirmed mismatch may block |
| Education | Is a credential mandatory, preferred, or substitutable? | Mandatory and unmet may block; preferred affects Fit |
| Current-student status | Must the Candidate currently be enrolled? | Confirmed mismatch may block |
| Graduation window | Is graduation within a stated range mandatory? | Confirmed out-of-window status may block |
| Experience | Is duration a strict eligibility rule or a hiring preference? | Usually Fit; block only with explicit gating Evidence |
| Seniority | Does the role impose a formal level restriction or describe an expected profile? | Usually Fit; explicit program-level restrictions may affect Eligibility |
| Required languages | Is proficiency legally or operationally mandatory at a defined level? | Confirmed mandatory mismatch may block; “plus” affects Fit |
| Professional licenses | Must a license be active before application or can it be acquired later? | Confirmed mandatory current-license mismatch may block |
| Security clearance | Is active clearance mandatory, or is eligibility to obtain it sufficient? | Confirmed mismatch may block; ambiguity requires investigation |
| Travel | What frequency, destination, and legal ability are required? | Block only when mandatory and incompatible with Candidate constraints |
| Working hours / time zone | Are specific hours mandatory, overlapping, or merely preferred? | Confirmed incompatible mandatory hours may block; otherwise a Preference/Fit issue |

## Deterministic evaluation behavior

Where Claims are explicit, a rule-based comparison should be possible:

1. Extract and retain the Opportunity Requirement with its exact Evidence and strength.
2. Retrieve the relevant Candidate Claim and Evidence; do not fill missing facts by assumption.
3. Normalize only what can be normalized without changing meaning, such as comparable date ranges or location scopes.
4. Determine satisfied, conflicting, unknown, contradictory, or not-applicable status for that issue.
5. Apply the Hard Blocker test.
6. Record what would change the issue result.
7. Aggregate issue results without erasing their Evidence or uncertainty.

Model-assisted extraction or interpretation may propose Claims, but deterministic constraints still govern whether an explicit mismatch qualifies as a Hard Blocker.

## Confidence and completeness

Eligibility must report distinct confidence dimensions:

- **Extraction confidence:** was the source text captured and interpreted accurately?
- **Inference confidence:** how strongly does Evidence support a conclusion that was not explicit?
- **Issue-evaluation confidence:** how reliable is the Candidate–Requirement comparison?
- **Evidence completeness:** have the relevant sources and Candidate facts been observed?

Aggregate confidence must not hide a low-completeness issue that could change the Decision.

## Contradictory Evidence

When Evidence conflicts, the system must retain both sources, link both to the disputed Claim, identify the contradiction, reduce issue certainty, surface the conflict, and recommend investigation when it is decision-relevant.

For example, an ATS listing stating “No sponsorship available” and a company immigration page stating “We sponsor qualified engineering candidates” do not justify silently selecting either answer. The first may be more role-specific; the second may be newer or describe an exception. Source authority is contextual and remains unresolved.

## Eligibility explanation requirements

An Eligibility explanation must answer:

- Which applicable Requirements were evaluated?
- Which were satisfied, blocked, unknown, or contradictory?
- What exact Requirement created each Hard Blocker?
- Which Candidate and Opportunity Evidence supports the result?
- Which conclusions are inferred rather than explicit?
- What missing information should the Candidate investigate?
- What new fact would change the result?

## Unresolved questions

- What final aggregate Eligibility states and transitions should be used?
- Which issue-specific comparisons should be standardized for v0.1?
- What confidence vocabulary provides clarity without false precision?
- How should source authority vary by signal, source scope, jurisdiction, and freshness?
- When may an inferred legal or program constraint become sufficiently reliable to block?
- How should Candidate intent, such as willingness to relocate, interact with Eligibility and Preferences?
- How will regional immigration modules be validated and maintained?
- How should stale authorization, license, clearance, or employer-policy Evidence decay?
