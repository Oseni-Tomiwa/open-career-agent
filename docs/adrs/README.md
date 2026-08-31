# Architecture Decision Records

## What is an ADR?

An architecture decision record (ADR) is a short, durable document that captures a consequential technical decision, its context, the options considered, the chosen outcome, and its tradeoffs. It records why a decision was made so future contributors do not have to reconstruct the reasoning from code or conversation history.

## Why this project will use ADRs

Phase 0 intentionally avoided freezing architecture before the product boundary was understood. As technical work approaches, ADRs make the distinction between proposal and approval explicit, preserve uncertainty and dissent, and let decisions be superseded without rewriting history.

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

## Records

- [ADR-001: Canonical persistence for v0.1](ADR-001-canonical-persistence.md) — Accepted
- [ADR-002: TypeScript and Node.js implementation runtime](ADR-002-typescript-node-runtime.md) — Accepted
- [ADR-003: React and Vite for the web application](ADR-003-react-vite-web.md) — Accepted
- [ADR-004: Fastify for an independent API application](ADR-004-fastify-api.md) — Accepted
- [ADR-005: Drizzle for SQLite database access and migrations](ADR-005-drizzle-database-access.md) — Accepted
- [ADR-006: pnpm workspace without an initial task orchestrator](ADR-006-pnpm-workspace.md) — Accepted
- [ADR-007: Rolevia multi-client platform architecture and boundaries](ADR-007-rolevia-platform-architecture.md) — Accepted
- [ADR-008: Cloud identity and authorization boundary](ADR-008-cloud-identity-authorization.md) — Accepted

## Suggested record structure

Future ADRs should include:

1. **Status:** proposed, accepted, superseded, or rejected.
2. **Context:** the problem, constraints, and known unknowns.
3. **Options considered:** credible alternatives and their tradeoffs.
4. **Decision:** the approved choice and scope.
5. **Consequences:** benefits, costs, risks, and follow-up work.

New records should use the structure above and link superseding decisions rather than rewriting accepted history.
