# Architecture

## Status

These documents define the logical architecture for the first usable version. The implementation strategy now selects a language/runtime, web and API frameworks, database access layer, and repository structure without selecting a cloud, AI provider/model, authentication provider, or complete deployment platform.

## Documents

- [System overview](system-overview.md)
- [Conceptual domain model](domain-model.md)
- [Persistence](persistence.md)
- [Background processing](background-processing.md)
- [Source adapters and Opportunity identity](source-adapters.md)
- [Intelligence and AI provider boundary](intelligence-boundary.md)
- [Deployment model](deployment-model.md)
- [Architecture decision records](../adrs/README.md)
- [Architecture diagrams](../diagrams/README.md)
- [Implementation stack evaluation](../implementation/stack-evaluation.md)
- [Repository structure](../implementation/repository-structure.md)
- [Frontend strategy](../implementation/frontend-strategy.md)
- [Backend strategy](../implementation/backend-strategy.md)
- [Testing strategy](../implementation/testing-strategy.md)
- [Development experience](../implementation/development-experience.md)

## Recommended architecture

- A modular monolith with explicit logical modules.
- One deployment unit with separate Web/API and worker process roles in v0.1.
- SQLite as canonical v0.1 local/self-hosted persistence, with versioned human-readable export rather than dual-write files.
- A database-backed durable job ledger with one write-heavy worker by default; no external queue until measured requirements justify one.
- `Source Adapter → SourceRecord → Normalizer → Opportunity/OpportunitySnapshot`, keeping source structures outside the core domain.
- Deterministic extraction, normalization, filtering, and identity rules before bounded model assistance.
- AI providers behind a provider-neutral, validated proposal boundary.
- Append-oriented OpportunitySnapshots, Evaluations, Decisions, and ApplicationEvents where historical explanation matters.
- TypeScript on Node.js 24 LTS in a pnpm workspace, with React/Vite for the web, an independent Fastify API, and a separate worker.
- TypeBox boundary schemas with generated OpenAPI/clients, and Drizzle for SQLite access and migrations.

## Architectural working principles

- Modular monolith before microservices.
- Domain logic independent from presentation.
- Domain logic independent from AI providers.
- Durable state and explicit provenance.
- Deterministic before probabilistic.
- Idempotent background processing.
- Uncertainty and contradictions preserved.
- Source Records treated as untrusted input.
- Human authority for consequential actions.
- Local/self-hosted and future hosted viability.
- Observable failures instead of silent corruption.

These architectural choices follow the [product principles](../product/principles.md) and [intelligence specifications](../intelligence/README.md). They do not redefine Eligibility, Fit, Opportunity Quality, Evidence, or Decision behavior.

## Unresolved decisions

- Authentication and authorization
- Product-domain physical schema and future task-ledger evolution
- Exact Source Adapter API
- Concrete AI provider/model configuration, semantic matching, embeddings, and vector search
- Ranking formula and caching
- Packaging, hosted tenancy, encryption, secrets management, and observability

Unresolved choices should remain proposals until evidence justifies an ADR.
