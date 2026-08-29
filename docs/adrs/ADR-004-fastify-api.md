# ADR-004: Fastify for an independent API application

## Status

Accepted for the first application implementation.

## Context

The modular monolith needs a stable interactive/programmatic API for the web and future CLI, MCP, integrations, and third parties. It must validate contracts, provide predictable errors, remain testable without network orchestration, and share application behavior with a separate worker without turning logical modules into services.

Fastify, Hono, NestJS, and frontend-framework request handlers are credible approaches. The project needs strong Node/JSON Schema integration and explicit composition more than multi-runtime portability or a framework-managed dependency-injection model.

## Decision

Implement the API as an independent Fastify application. Use TypeBox schemas through Fastify's Type Provider for request/response validation and serialization, generate OpenAPI from registered route schemas, and generate clients for consumers.

Fastify exists only in the API composition and transport layers. Route handlers adapt validated input to framework-neutral application use cases. The worker composes the same core use cases directly and does not call the API as an internal microservice.

## Alternatives considered

### Hono

Deferred. Its small Web Standards API and runtime portability are attractive, but edge/multi-runtime deployment is not a current need and Fastify better matches the selected Node schema/plugin/testing conventions.

### NestJS

Rejected for the initial implementation. Its comprehensive module and DI model would add decorators, metadata, and framework abstractions to boundaries the architecture already defines explicitly.

### Frontend-framework handlers or tRPC-only backend

Rejected as the canonical API. They optimize the first web client but weaken the independent, language-neutral boundary required by future consumers.

## Consequences

### Positive

- Runtime-validated, documented contracts with efficient response serialization
- Encapsulated route/plugin composition and focused in-process integration tests
- Clear separation among HTTP, application, and domain behavior
- One programmatic boundary for web and future external clients

### Negative

- The project must define application conventions, dependency composition, and error policy
- Generated OpenAPI/client drift must be enforced in CI
- Fastify-specific schemas/hooks must remain out of core code

## Revisit conditions

Re-evaluate when supported deployment targets make Web Standards runtime portability a primary requirement, when team/project scale demonstrates that stronger framework-enforced module/DI conventions would reduce rather than add complexity, or when measured Fastify limitations block required protocol behavior. The API must remain an independent application boundary regardless of a framework change unless a separate ADR changes that architecture.

