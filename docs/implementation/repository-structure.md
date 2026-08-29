# Repository and module structure

## Goals

The repository should make the modular monolith visible, allow the Web/API and worker to share behavior without copying it, and keep infrastructure from defining domain meaning. It should be small enough to understand from the root and strict enough that future CLI, MCP, and hosted delivery mechanisms reuse the same application use cases.

Use a pnpm workspace. Do not add Turborepo, Nx, or a custom build system to the first scaffold. Root scripts may use pnpm's recursive, filtered, and parallel execution; package build order follows declared workspace dependencies.

## Proposed layout

```text
.
├── apps/
│   ├── web/                 # React/Vite browser application
│   ├── api/                 # Fastify composition root and HTTP transport
│   └── worker/              # background-process composition root
├── packages/
│   ├── core/                # domain, application use cases, and ports
│   ├── contracts/           # TypeBox boundary schemas and OpenAPI inputs
│   ├── database/            # Drizzle schema, repositories, transactions, jobs
│   ├── sources/             # ATS adapters, raw SourceRecords, normalization
│   ├── providers/           # model/provider adapters behind core ports
│   └── ui/                  # tokens, accessible primitives, product components
├── docs/                    # product, intelligence, architecture, ADRs, implementation
├── tooling/                 # add only when shared executable configuration warrants it
├── package.json             # future root scripts; not created by this task
├── pnpm-workspace.yaml      # future workspace declaration
└── tsconfig.base.json       # future shared compiler baseline
```

This is a target for the next scaffold, not permission to create empty directories preemptively. A package is created when it has a real owner, public surface, and at least one consumer.

## Why these packages

### `packages/core`

Own domain entities, value objects, invariants, domain services, application commands/queries, repository ports, clocks/ID capabilities, and provider capabilities. Internal folders can separate `domain`, `application`, and the existing intelligence concepts without publishing each concept as a package.

Core performs no browser, HTTP, filesystem, database, source-network, or model-provider I/O. Eligibility, Fit, Quality, Evidence, and Decision semantics live here. Keeping domain and application layers together initially avoids a package for every architectural noun.

### `packages/contracts`

Own TypeBox schemas for HTTP input/output, import/export envelopes, Source Adapter boundary records where cross-package sharing is required, and validated provider proposal shapes. Registered HTTP schemas support OpenAPI generation and generated clients.

Contracts are not domain entities. Transport optionality, pagination, serialization, and compatibility concerns should not reshape core models. Mappers at application edges make this distinction explicit.

### `packages/database`

Own Drizzle schema and queries, migrations once implementation begins, SQLite connection policy, repository adapters, transaction helpers, persisted projections, and the durable job ledger. It implements core repository ports and must not become the location of business rules.

Migration files remain versioned implementation artifacts. They are not to be generated in this documentation task.

### `packages/sources`

Own source-specific clients and parsers for Greenhouse, Ashby, and Lever, retained raw-record handling, adapter fixtures, and source-neutral normalization/identity implementations. Adapters produce the agreed SourceRecord boundary; they do not create their own Opportunity or Decision definitions.

### `packages/providers`

Own AI SDK and provider SDK imports, configuration translation, model-call telemetry/provenance capture, and adapters for the provider-neutral capabilities declared by core. Provider response types end here. A local or OpenAI-compatible implementation can be added without changing domain contracts.

### `packages/ui`

Own design tokens, theme mechanics, accessible primitives, data-display conventions, chart wrappers, and reusable career-product components. It may depend on transport-facing view types where appropriate, but never on database, sources, providers, or server composition roots. Product-page composition remains in `apps/web`.

## Dependency direction

```text
apps/web ────────────────> contracts, ui
apps/api ────────────────> core, contracts, database
apps/worker ─────────────> core, contracts, database, sources, providers

database ────────────────> core
sources ─────────────────> core, contracts
providers ───────────────> core, contracts
ui ──────────────────────> contracts

core ────────────────────> no project infrastructure or UI package
contracts ───────────────> no project infrastructure package
```

Composition roots may connect concrete adapters to core ports. Reverse imports are prohibited. Cross-package imports use declared package exports, never another package's `src/` path. Cycles fail linting and type checking.

The API and worker do not import each other. Shared behavior moves into core or a justified infrastructure package; process startup and delivery concerns stay in the app that owns them.

## API and contract ownership

Fastify route modules in `apps/api` own HTTP method/path, authentication hooks when introduced, and response mapping. TypeBox schemas come from `packages/contracts`; handlers call application use cases from core. OpenAPI is generated from registered route schemas and checked for drift in CI. Generated clients are outputs, not a parallel hand-maintained contract.

This preserves future delivery options:

- the web uses a generated HTTP client;
- a CLI can use the same client or invoke application use cases when packaged locally;
- MCP tools adapt MCP inputs to the same application commands/queries;
- integrations and third parties can rely on versioned OpenAPI rather than TypeScript-only RPC metadata.

For that reason, tRPC is not the canonical interface. It would optimize the first TypeScript web client at the expense of a language-neutral external contract.

## Workspace conventions

- Pin the runtime and package-manager versions in repository metadata when scaffolding.
- Use the pnpm `workspace:` protocol for internal dependencies so a registry package cannot silently satisfy a local edge.
- Give each package a deliberately small `exports` map.
- Prefer one root lockfile and centrally aligned versions for foundational tooling.
- Keep runtime dependencies in the consuming package; do not rely on accidental hoisting.
- Keep app-specific environment schemas beside their composition roots; extract shared configuration only after genuine duplication appears.
- Use ESM consistently unless a chosen tool has a documented incompatibility.
- Use project references or another measured TypeScript build strategy only when they improve actual build behavior; do not create configuration ceremony by default.

## Boundaries to enforce

- Browser code cannot import Node-only modules, secrets, database code, or provider SDKs.
- Core cannot import React, Fastify, Drizzle, TypeBox transport DTOs, source SDKs, or AI SDK types.
- Source adapters cannot redefine canonical Opportunity identity or Candidate-specific evaluation rules.
- Database rows cannot be passed through the API as accidental public DTOs.
- Model output is mapped and validated before core considers a proposal.
- UI components may present explanations but cannot calculate canonical Eligibility, Fit, Quality, or ranking.
- ApplicationEvents are appended through application behavior; UI actions do not overwrite pipeline history directly.

## Why no additional packages yet

Separate `domain`, `application`, `intelligence`, `config`, `jobs`, `observability`, and `shared` packages would initially create more manifests and dependency edges than stable boundaries. Use internal modules first. Extract only when ownership, runtime reuse, or independent testing demonstrates a real package boundary. A generic `utils` package is specifically discouraged because it erodes dependency direction.

## Revisit conditions

Reconsider the workspace-only approach when measured local or CI task time makes caching or affected execution valuable, when package count and dependency graphs become difficult to operate safely, or when independent release units genuinely emerge. Evaluate Turborepo and Nx against those measurements; neither is a predetermined next step.

Splitting the repository or modular monolith requires stronger evidence: independently operated teams and release cycles, incompatible runtime/deployment requirements, or a scaling boundary that cannot be isolated within the existing processes. Code organization alone is not such evidence.

## Primary references

- [pnpm workspaces and the `workspace:` protocol](https://pnpm.io/workspaces)
- [pnpm recursive commands](https://pnpm.io/cli/recursive)
- [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces/)
- [Nx concepts](https://nx.dev/docs/concepts)
