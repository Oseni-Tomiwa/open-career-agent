# ADR-002: TypeScript and Node.js implementation runtime

## Status

Accepted for the first application implementation.

## Context

The platform needs a browser UI, API, background worker, SQLite access, source adapters, deterministic normalization and intelligence rules, provider integrations, and later CLI/MCP delivery. A TypeScript-only runtime and a TypeScript-plus-Python split are both credible. A split might unlock Python-specific libraries but would immediately require cross-runtime contracts, two dependency/security toolchains, more process supervision, and more complex local/self-hosted packaging.

No v0.1 workload currently depends on a uniquely valuable Python capability. AI provider calls and runtime-validated structured output are well supported from Node.js.

## Decision

Use TypeScript across the web, API, worker, core, adapters, and provider boundary, running server processes on a pinned Node.js 24 LTS release line. Python is not a v0.1 service or default intelligence runtime.

Use strict TypeScript and runtime validation at every untrusted boundary. Static types do not replace schema validation or domain invariants.

## Alternatives considered

### TypeScript plus Python intelligence service

Deferred. It offers strong scientific, data, and document ecosystems, but there is no defined v0.1 capability whose benefit pays for a second service boundary and toolchain.

### Python-first backend with TypeScript web

Rejected for the initial implementation. It still requires two ecosystems and gives up straightforward sharing for API contracts, CLI/MCP, and server/web tooling without solving an identified problem.

## Consequences

### Positive

- One language, package graph, type checker, formatter/linter, and primary test runner
- Direct code sharing across API and worker while preserving module boundaries
- Lower contributor and local/self-hosted deployment complexity
- Strong alignment with React, generated clients, Node SQLite access, and later TypeScript CLI/MCP work

### Negative

- Some future data-science, local-model, or document libraries may be less capable than Python alternatives
- CPU-heavy work requires deliberate process/offload design to avoid blocking Node's event loop
- Shared language can tempt contributors to share infrastructure types across forbidden boundaries

## Revisit conditions

Reconsider a second runtime when a concrete, representative workload demonstrates a material capability, correctness, performance, or maintenance advantage unavailable from the TypeScript stack, and the advantage exceeds the cost of deployment, observability, versioned contracts, security patching, and contributor support.

Any added runtime must implement a narrow capability boundary. It does not become the owner of domain truth merely because it performs model, data, or document work.

