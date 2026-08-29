# ADR-003: React and Vite for the web application

## Status

Accepted for the first application implementation.

## Context

The web application is a first-class, production-intent career intelligence interface. It needs rich routing, responsive information-dense layouts, accessible interactions, visualizations, and robust data/failure states. The architecture separately requires a programmatic API and worker so future web, CLI, MCP, and integrations share application behavior.

React with Vite and Next.js are credible choices. Next.js adds server rendering, server components, route handlers, image optimization, and public-content conventions. The initial product is primarily an authenticated/data-rich application, and its canonical behavior belongs behind an independent API.

## Decision

Use React with Vite for the web application and React Router for application routing. The browser calls the independent programmatic API through generated contracts. Vite produces portable static production assets; a packaged self-hosted deployment may serve those assets through the API/reverse proxy without moving business behavior into frontend-framework handlers.

The first interface must use the actual app shell, navigation, product components, responsive design, accessibility semantics, and real state handling. Fictional seeded data may feed it through the real API. A disposable dashboard or placeholder UI is not an accepted implementation phase.

## Alternatives considered

### Next.js

Deferred. It is compelling for server-rendered public content and integrated full-stack products. In this architecture it would add another server surface and encourage duplicated API/business boundaries before SSR or SEO is required.

### Server-rendered templates without a React application

Rejected because the planned interactive filtering, pipeline, evidence exploration, responsive visualization, and client-state needs warrant a mature component application.

## Consequences

### Positive

- Clear browser/API separation and portable self-hosted static assets
- Mature ecosystem for accessible, data-rich application UI and testing
- Fast development/build feedback with relatively little framework-owned server behavior
- Public API remains equally usable by non-web clients

### Negative

- SSR, server components, image optimization, and public SEO are not built in
- The project must select and maintain routing, server-state, metadata, and asset conventions
- First load can be worse than a well-designed server-rendered page if bundles are not controlled

## Revisit conditions

Re-evaluate when committed first-party public/SEO, SSR, streaming, or content requirements cannot be met cleanly with static/pre-rendered pages or a separately deployed public site, or when measured application performance identifies a framework-level limitation. Next.js is one candidate in that future evaluation, not an inevitable replacement.

