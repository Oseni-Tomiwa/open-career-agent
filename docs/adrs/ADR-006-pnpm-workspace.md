# ADR-006: pnpm workspace without an initial task orchestrator

## Status

Accepted for the first application implementation.

## Context

The modular monolith needs three process entry points and a small set of shared packages with enforceable dependency direction. It does not yet need independently released services or dozens of packages. npm workspaces, pnpm workspaces, Turborepo, and Nx can all organize this shape, with different dependency strictness and orchestration cost.

## Decision

Use one pnpm workspace and lockfile. Start with `apps/web`, `apps/api`, and `apps/worker`, plus the justified `core`, `contracts`, `database`, `sources`, `providers`, and `ui` packages described in the repository strategy. Use pnpm recursive/filtered scripts and the `workspace:` protocol. Do not add Turborepo or Nx to the first scaffold.

Keep the code in one repository and ship process roles as one versioned deployment unit. Enforce package exports, declared dependencies, no cross-package source imports, no dependency cycles, and architectural import boundaries through TypeScript and linting.

## Alternatives considered

### npm workspaces

Rejected for the initial scaffold. They are viable, but pnpm's strict dependency model, explicit workspace protocol, filtering, and recursive execution better support the desired boundaries.

### pnpm with Turborepo

Deferred. Task caching and affected execution can help later, but the current graph is small enough that an orchestrator would add configuration before there is measured latency to solve.

### Nx

Deferred. Its project graph, generators, caching, and enforcement are powerful for a larger workspace, but exceed the first scaffold's needs.

### Separate repositories

Rejected. API and worker share domain/application behavior and release together; separate repositories would add version coordination without an independent product or operations boundary.

## Consequences

### Positive

- Small, visible repository and toolchain
- Strict local dependency declaration and unambiguous local package linking
- Easy filtered development and one-command full-stack operation
- Shared changes remain atomic across web, API, worker, and packages

### Negative

- No remote task cache or sophisticated affected-project scheduling initially
- The project owns root-script conventions and import-boundary lint configuration
- Poorly chosen packages could create cycles or become generic dumping grounds

## Revisit conditions

Evaluate a task orchestrator when measured local or CI times, package count, or task dependencies make caching/affected execution materially valuable. Evaluate repository splitting only when independent ownership, release cadence, deployment lifecycle, or incompatible runtime requirements justify its coordination cost. Neither Turborepo, Nx, nor multiple repositories is an inevitable next step.
