# Repository and module structure

## Goals

The repository should make the modular monolith visible, allow the Web/API and worker to share behavior without copying it, and keep infrastructure from defining domain meaning. It should be small enough to understand from the root and strict enough that future CLI, MCP, and hosted delivery mechanisms reuse the same application use cases.

Use a pnpm workspace. Do not add Turborepo, Nx, or a custom build system to the first scaffold. Root scripts may use pnpm's recursive, filtered, and parallel execution; package build order follows declared workspace dependencies.

## Initial implemented layout

```text
.
├── apps/
│   ├── web/                 # React/Vite browser application
│   ├── api/                 # Fastify composition root and HTTP transport
│   └── worker/              # background-process composition root
├── packages/
│   ├── domain/              # portable domain identifiers and value concepts
│   ├── schemas/             # TypeBox boundary schemas and OpenAPI inputs
│   ├── database/            # Drizzle schema, repositories, transactions, jobs
│   └── config/              # validated browser/API/worker configuration
├── docs/                    # product, intelligence, architecture, ADRs, implementation
├── package.json             # root scripts and pinned toolchain
├── pnpm-workspace.yaml      # workspace declaration
└── tsconfig.base.json       # strict shared compiler baseline
```

This is the intentionally small first scaffold. A package is created when it has a real owner, public surface, and at least one consumer. Source, provider, intelligence, UI, MCP, and CLI packages remain deferred until working code needs those boundaries.

## Why these packages

### `packages/domain`

Initially owns only portable identifiers and Opportunity-type concepts. It will later own domain entities, value objects, invariants, domain services, and capability/repository ports as those behaviors are implemented.

Domain performs no browser, HTTP, filesystem, database, source-network, or model-provider I/O. Eligibility, Fit, Quality, Evidence, and Decision semantics will live here rather than in delivery or infrastructure code. Internal modules should be preferred over a package for every architectural noun.

### `packages/schemas`

Initially owns TypeBox health, readiness, service metadata, and API error schemas. It will own HTTP input/output, import/export envelopes, Source Adapter boundary records where cross-package sharing is required, and validated provider proposal shapes. Registered HTTP schemas support OpenAPI generation and generated clients.

Schemas are not domain entities. Transport optionality, pagination, serialization, and compatibility concerns should not reshape domain models. Mappers at application edges make this distinction explicit.

### `packages/database`

Own Drizzle schema and queries, migrations, SQLite connection policy, repository adapters, transaction helpers, persisted projections, and the durable task ledger. It will implement domain repository ports and must not become the location of business rules.

Migration files are reviewed, versioned implementation artifacts. The first migration creates only the durable background-task ledger and its append-oriented transition events.

### `packages/config`

Own validated browser-safe and server configuration parsers. Browser exports contain no Node or secret-reading behavior. API and worker composition roots select their own environment values and pass narrow configuration to concrete capabilities.

## Dependency direction

```text
apps/web ────────────────> schemas, config/browser
apps/api ────────────────> schemas, database, config/server
apps/worker ─────────────> database, config/server

database ────────────────> config/server (migration command only)

domain ──────────────────> no project package
schemas ─────────────────> no project infrastructure package
config ──────────────────> no project infrastructure package
```

Composition roots may connect concrete adapters to domain ports. Reverse imports are prohibited. Cross-package imports use declared package exports, never another package's `src/` path. Cycles fail linting and type checking.

API and worker will depend on domain when implemented application use cases require it; the technical health/task scaffold does not add an unused dependency merely to draw that future arrow.

The API and worker do not import each other. Shared behavior moves into domain or a justified infrastructure package; process startup and delivery concerns stay in the app that owns them.

## API and contract ownership

Fastify route modules in `apps/api` own HTTP method/path, authentication hooks when introduced, and response mapping. TypeBox schemas come from `packages/schemas`; handlers will call application use cases from domain/application modules. OpenAPI is generated from registered route schemas and validated in tests. Generated clients will be outputs, not a parallel hand-maintained contract, once product endpoints justify generation.

This preserves future delivery options:

- the web will use a generated HTTP client once product endpoints justify generation;
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
- Domain cannot import React, Fastify, Drizzle, TypeBox transport DTOs, source SDKs, or AI SDK types.
- Source adapters cannot redefine canonical Opportunity identity or Candidate-specific evaluation rules.
- Database rows cannot be passed through the API as accidental public DTOs.
- Model output is mapped and validated before domain behavior considers a proposal.
- UI components may present explanations but cannot calculate canonical Eligibility, Fit, Quality, or ranking.
- ApplicationEvents are appended through application behavior; UI actions do not overwrite pipeline history directly.

## Why no additional packages yet

Separate `application`, `intelligence`, `sources`, `providers`, `ui`, `jobs`, `observability`, and `shared` packages would initially create more manifests and dependency edges than stable boundaries. Use internal modules first. Extract only when ownership, runtime reuse, or independent testing demonstrates a real package boundary. A generic `utils` package is specifically discouraged because it erodes dependency direction.

## Revisit conditions

Reconsider the workspace-only approach when measured local or CI task time makes caching or affected execution valuable, when package count and dependency graphs become difficult to operate safely, or when independent release units genuinely emerge. Evaluate Turborepo and Nx against those measurements; neither is a predetermined next step.

Splitting the repository or modular monolith requires stronger evidence: independently operated teams and release cycles, incompatible runtime/deployment requirements, or a scaling boundary that cannot be isolated within the existing processes. Code organization alone is not such evidence.

## Primary references

- [pnpm workspaces and the `workspace:` protocol](https://pnpm.io/workspaces)
- [pnpm recursive commands](https://pnpm.io/cli/recursive)
- [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces/)
- [Nx concepts](https://nx.dev/docs/concepts)
