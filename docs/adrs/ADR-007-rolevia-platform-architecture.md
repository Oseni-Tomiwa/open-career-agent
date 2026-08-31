# ADR-007: Rolevia Multi-Client Platform Architecture & Boundaries

* **Status:** Accepted
* **Deciders:** Rolevia Core Architecture Team
* **Date:** 2026-08-31

## Context & Problem Statement

Rolevia is evolving from a web/API application into a multi-client platform supporting Rolevia Web, Rolevia Desktop (Tauri), Rolevia Mobile (React Native/Expo), Rolevia Cloud, and Rolevia Self-Hosted. We must establish firm architectural boundaries to prevent duplication of domain logic, intelligence engines, API contracts, or persistence behavior across clients.

## Decision Drivers

1. Maintain a single unified repository (monorepo) without premature split.
2. Prevent server-only code (intelligence engines, database ORM, workers, source adapters) from leaking into client bundles.
3. Provide a single, portable, typed API client (`@oca/api-client`) for all frontend runtimes (Browser, Tauri WebView, React Native, Node tests).
4. Preserve existing deterministic intelligence contracts (`Eligibility`, `Fit`, `Quality`, `Decision`) and Applications optimistic concurrency semantics (`STALE_WRITE`).
5. Maintain SQLite as the single-tenant self-hosting persistence baseline while defining explicit PostgreSQL migration triggers for Rolevia Cloud.

## Considered Options

1. **Option 1**: Keep ad-hoc `fetch` calls scattered across client repositories and duplicate Types.
2. **Option 2**: Create a portable, typed shared API client package (`@oca/api-client`) wrapping `@oca/schemas` contracts with transport error mapping.
3. **Option 3**: Bundle intelligence engines and SQLite into mobile/desktop applications.

## Decision Outcome

**Chosen Option: Option 2**. We establish `@oca/api-client` as the universal transport boundary for all Rolevia clients.

### Positive Consequences
* **Client Portability**: Web, Desktop, and Mobile clients share 100% of API transport, contract validation, and typed error handling.
* **Security & Bundle Isolation**: Server-only intelligence engines, database dependencies, and source adapters are strictly isolated to core API/Worker backends.
* **Contract Integrity**: Response validation at the transport boundary catches API schema drift immediately.
* **Clean Persistence Layer**: SQLite remains simple and lightweight for self-hosting; PostgreSQL migration is reserved for horizontally scaled cloud deployments.

### Negative Consequences
* Web repositories must map raw API DTOs to UI view models rather than accessing domain entities directly.
