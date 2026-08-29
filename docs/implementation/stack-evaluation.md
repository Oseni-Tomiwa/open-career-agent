# Implementation stack evaluation

## Status

Accepted implementation direction for the first application scaffold. This document selects a concrete stack without changing the product model or the architecture in `docs/architecture/`.

## Decision summary

The first implementation will be a TypeScript-first pnpm workspace on Node.js 24 LTS. It will contain a React and Vite web application, an independent Fastify API, and a separate Fastify-independent worker process. Shared domain and application code will remain framework-neutral. SQLite remains canonical persistence under ADR-001 and will be accessed through Drizzle ORM and Drizzle Kit migrations.

Transport and external-data contracts will be TypeBox schemas. Fastify will use those schemas for validation and OpenAPI generation, and generated clients will serve the web application and later CLI, MCP, integration, or third-party consumers. Model access will sit behind a project-owned provider-neutral port; the initial adapter may use the AI SDK, but provider types will not enter domain code.

This is one modular monolith and one versioned deployment unit, with separate web/API and worker process roles. It is not a collection of services.

## Decision matrix

| Area | Candidates considered | Selected | Why | Disadvantages | Revisit conditions |
|---|---|---|---|---|---|
| Language and runtime | TypeScript/Node; TypeScript plus Python; other split runtimes | TypeScript on Node.js 24 LTS | One runtime covers web, API, worker, rules, adapters, SQLite, provider calls, and later CLI/MCP while keeping contracts and contributor tooling cohesive | Node is not the best ecosystem for every future data-science or document task | A bounded workload has a demonstrated Python-only or materially better library and its value exceeds cross-runtime, deployment, and contract cost |
| Web framework | React + Vite; Next.js | React + Vite | Fits an authenticated, data-rich client over an independent API; yields a portable static production bundle; keeps domain behavior out of a frontend server | No built-in SSR, server components, image optimizer, or full-stack conventions | Committed first-party public/SEO or SSR requirements cannot be met cleanly by a separate public frontend or pre-rendering |
| UI system | Tailwind + owned tokens/Radix; CSS Modules; vanilla CSS; broad component suite | Tailwind + CSS-variable tokens + Radix; selective source-owned shadcn/ui | Supports responsive density and consistent semantic states while retaining accessible behavior and a distinct product language | Requires class/convention discipline and deliberate restyling; source-owned components become our maintenance responsibility | Styling scale, runtime theming, accessibility, or maintenance measurements show the approach is impeding the product |
| Backend/API | Fastify; Hono; NestJS; frontend-framework handlers | Independent Fastify application | JSON Schema validation/serialization, encapsulated plugins, low abstraction, strong testing, and clear modular-monolith composition | More application conventions must be owned than in NestJS; heavier than Hono's minimal core | Runtime portability becomes a primary constraint, or project scale demonstrates a need for stronger framework-enforced DI/module conventions |
| API contracts | TypeBox schema-first + OpenAPI; OpenAPI-first files; Zod/shared TS; tRPC | TypeBox schema-first, generated OpenAPI and clients | One runtime-valid JSON Schema source supports Fastify, model validation, documentation, and non-web consumers | Generator compatibility and contract drift need CI checks; domain and transport types remain distinct | External consumers require a design-first governance process that is better served by canonical OpenAPI documents |
| Runtime validation | TypeBox; Zod; Valibot; framework-only schemas | TypeBox | Native JSON Schema values, static TypeScript inference, Fastify Type Provider support, and reuse for structured external/model boundaries | Less application-centric refinement ergonomics than Zod in some cases; schemas must not be confused with domain truth | Schema expressiveness, generated-contract compatibility, or bundle measurements reveal a material limitation |
| Database access | Drizzle; Prisma; Kysely; direct SQLite | Drizzle ORM + Drizzle Kit + `node:sqlite` | Typed SQL-oriented access, transactions, explicit migrations, low runtime weight, official SQLite and PostgreSQL dialect support | Dialect-specific schemas/migrations mean a later database move is real migration work, not a configuration toggle | Query complexity, driver limitations, or measured migration needs demonstrate a better fit; ADR-001 revisit conditions trigger a persistence evaluation |
| Durable background work | Own ledger; queue library; Redis-backed queue | Small domain-specific SQLite job ledger | Meets leasing, retry, scheduling, idempotency, recovery, and visibility needs without external infrastructure | The project owns concurrency and recovery correctness | Multiple/horizontally scaled workers, throughput, routing, or operational needs exceed the measured ledger limits |
| AI provider access | Provider SDKs; multi-provider library; direct HTTP | Project port with an AI SDK adapter initially | Avoids repeated provider plumbing while keeping provider-neutral domain contracts and future local/OpenAI-compatible adapters possible | Adds an abstraction dependency and may not expose every provider feature uniformly | Needed provider capability is inaccessible, local endpoint compatibility is poor, or the library begins leaking into domain contracts |
| Workspace | pnpm workspaces; npm workspaces; pnpm + Turborepo; Nx | pnpm workspaces without a task orchestrator | Strict declared dependencies, `workspace:` linking, recursive scripts, and minimal operational surface | No remote cache or sophisticated affected-project graph initially | Measured CI/local task time or workspace scale makes caching and affected execution materially valuable |
| Tests | Vitest/Testing Library/Playwright; Node test runner; larger framework suites | Vitest + Testing Library + Playwright | One fast TypeScript runner across core and server, behavior-oriented components, and real-browser workflows/accessibility | Three testing APIs and browser installation are still required | A selected runtime feature cannot be tested reliably, or suite scale demands different specialization |

## DECIDED

- TypeScript is the v0.1 implementation language; Python is not a default service or intelligence runtime.
- Node.js 24 LTS is the pinned runtime line for the first scaffold.
- pnpm workspaces manage the monorepo; no Turborepo or Nx initially.
- The web application uses React, Vite, and React Router and calls an independent Fastify API.
- The UI uses project-owned semantic tokens with Tailwind and Radix behavior primitives; shadcn/ui is selective editable source, not the visual identity.
- The API and worker are separate processes composed from shared application and domain modules.
- TypeBox owns runtime boundary schemas; registered API schemas produce OpenAPI, from which clients are generated.
- SQLite is the only canonical v0.1 store. Drizzle is the database access and migration layer.
- Background work uses a small database-backed job ledger, not Redis or an external queue.
- Provider integrations implement a project-owned capability interface. Model output is untrusted and runtime validated.
- Vitest, Testing Library, and Playwright form the testing stack.
- ESLint, Prettier, strict TypeScript, import-boundary checks, and CI verification are baseline quality tooling.

## DEFERRED

- Final product name, logo, brand colors, and final typefaces
- Production cloud, container/orchestration platform, and packaging format
- Authentication provider and hosted tenancy model
- Billing, analytics, email, and observability vendors
- Vector database or embedding store; none is required by v0.1
- Final ranking formula and model/provider configuration
- The exact AI models and whether a local provider ships in v0.1
- Document-generation implementation; add a second runtime only if a concrete document workload justifies it
- Public marketing-site architecture; it need not share the authenticated application framework
- An external queue, distributed cache, or monorepo task orchestrator

## Why TypeScript-first

The planned work is dominated by typed product workflows: source ingestion, deterministic normalization and rules, transactional state changes, API contracts, a browser application, and a worker. None requires Python to be credible. A TypeScript/Python split would immediately add dependency management, process supervision, serialization contracts, debugging paths, and deployment artifacts while providing no identified v0.1 capability.

Python remains a legitimate later implementation detail for an isolated capability such as a uniquely strong document, scientific, or model tool. It should enter through a versioned capability boundary only after a representative spike demonstrates the benefit. The presence of AI alone is not that evidence.

## Compatibility with accepted architecture

- Domain/application packages contain Eligibility, Fit, Quality, Evidence, Decision, and Application behavior. Neither React nor Fastify defines those meanings.
- `Source Adapter -> SourceRecord -> Normalizer -> Opportunity/OpportunitySnapshot` remains the ingestion path.
- Deterministic parsing, identity, and rules run before bounded model assistance.
- Candidate, Opportunity, Evidence, snapshots, evaluations, decisions, applications, ApplicationEvents, source records, and job state remain durable.
- Human-readable files are versioned export/import artifacts, never a second writable authority.
- No provider response writes domain state directly, and provider failure cannot erase deterministic results.
- An application submission remains a deliberate human-authorized command.

## Primary references

- [Node.js 24 LTS migration guide and support window](https://nodejs.org/en/blog/migrations/v22-to-v24)
- [Vite production builds](https://vite.dev/guide/build.html)
- [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting)
- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/)
- [Drizzle SQLite support](https://orm.drizzle.team/docs/sqlite/get-started-sqlite)
- [pnpm workspaces](https://pnpm.io/workspaces)
- [AI SDK provider management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management)
