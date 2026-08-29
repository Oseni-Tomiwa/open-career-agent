# Architecture Decision Records

## What is an ADR?

An architecture decision record (ADR) is a short, durable document that captures a consequential technical decision, its context, the options considered, the chosen outcome, and its tradeoffs. It records why a decision was made so future contributors do not have to reconstruct the reasoning from code or conversation history.

## Why this project will use ADRs

Phase 0 intentionally avoids freezing architecture before the product boundary is understood. Once technical work begins, ADRs will make the distinction between proposal and approval explicit, preserve uncertainty and dissent, and let decisions be superseded without rewriting history.

An ADR should be written when a choice:

- materially constrains later implementation;
- is costly to reverse;
- affects multiple parts of the system or contributor workflows;
- changes privacy, security, portability, reliability, or operating boundaries; or
- resolves an issue for which multiple credible options exist.

Small, local implementation details do not need ADRs.

## Decisions expected to need ADRs

- canonical persistence model
- monorepo or other repository structure
- primary backend runtime
- AI provider abstraction
- background job architecture
- Opportunity source adapter interface
- authentication model
- hosted versus local deployment boundaries

Other decisions may qualify as the system is specified. Listing an example here does not select an option.

## Suggested record structure

Future ADRs should include:

1. **Status:** proposed, accepted, superseded, or rejected.
2. **Context:** the problem, constraints, and known unknowns.
3. **Options considered:** credible alternatives and their tradeoffs.
4. **Decision:** the approved choice and scope.
5. **Consequences:** benefits, costs, risks, and follow-up work.

No architecture decisions have been recorded yet.
