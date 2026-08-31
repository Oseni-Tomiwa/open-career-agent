# PLATFORM FOUNDATION V1 — ARCHITECTURE & BOUNDARIES DOCUMENT

## 1. Executive Overview & Primary Goal

Rolevia is transitioning from a single web/API monorepo into a multi-client, enterprise-grade candidate care platform (**Rolevia Platform**). The platform will support five target deployment modes and clients without duplicating core domain logic, deterministic intelligence engines, API schemas, or persistence boundaries:

1. **Rolevia Web**: React + Vite SPA client (browser).
2. **Rolevia Desktop**: Tauri-based native shell targeting macOS, Windows, and Linux.
3. **Rolevia Mobile**: React Native / Expo client targeting iOS and Android.
4. **Rolevia Cloud**: High-availability multi-tenant cloud API + Worker backend.
5. **Rolevia Self-Hosted / Local**: Dockerized single-tenant / small-team backend powered by API + Worker + SQLite.

### Architectural Invariant
Every client (Web, Desktop, Mobile) consumes the same canonical API transport (`@oca/api-client`) and TypeBox contracts (`@oca/schemas`). Deterministic intelligence engines (`Eligibility`, `Fit`, `Quality`, `Decision`), database ORM layer (`@oca/database`), background task workers (`@oca/worker`), and source adapters (`@oca/sources`) remain strictly server/core-side.

```
                         Rolevia Platform

                    ┌────────────────────┐
                    │   Rolevia Cloud    │
                    │                    │
                    │ API                │
                    │ Workers            │
                    │ Intelligence       │
                    │ Discovery          │
                    │ Hosted Database    │
                    └─────────┬──────────┘
                              │
               ┌──────────────┼──────────────┐
               │              │              │
               ▼              ▼              ▼
             Web           Desktop         Mobile
                         macOS/Windows    iOS/Android
                          /Linux maybe

And separately:

                    Self-Hosted Rolevia
                           │
                    API + Worker
                           │
                        SQLite
```

---

## 2. Monorepo Architecture & Future Split Criteria

Rolevia remains a unified monorepo managed via `pnpm` workspace. 

### Why Monorepo Remains Appropriate
- **Single Source of Truth**: All shared TypeBox API contracts (`@oca/schemas`), domain identifiers (`@oca/domain`), and client transport (`@oca/api-client`) are shared across clients without version drift or NPM publishing overhead.
- **Atomic Refactoring**: API schema updates instantly update the shared API client and validate frontend compilation across all clients via `pnpm typecheck`.
- **Zero-Drift CI**: A single `pnpm test` runs all unit, integration, schema validation, and intelligence tests in seconds.

### Explicit Future Criteria for Splitting Repositories
The repository should only be split if one of the following criteria is met:
1. **Material Access Control Divergence**: Proprietary cloud monetization/billing microservices require private access while the core platform remains open-source.
2. **Release Lifecycle Incompatibility**: Mobile client app store approval releases require an isolated release branch/tag process that blocks rapid core API iteration.
3. **Build/Repository Scale Limits**: Monorepo build times exceed acceptable developer feedback loops despite caching.
4. **Independently Managed Engineering Teams**: Native mobile and core engine teams require distinct codebase ownership and independent git commit histories.

---

## 3. Package Classification Matrix

To prevent browser/mobile bundles from accidentally importing Node.js native dependencies, SQLite binaries, or server secrets, workspace packages are strictly classified:

| Package | Classification | Environment | Responsibilities & Exports |
|---|---|---|---|
| `@oca/schemas` | **SHARED CONTRACT** | Universal | TypeBox schemas & TypeScript types for all API endpoints, models, and inputs. Zero dependencies. |
| `@oca/domain` | **CLIENT-SAFE** | Universal | Pure domain identifiers, claim state machine validators (`canTransitionClaimState`), and discovery match logic. |
| `@oca/api-client` | **CLIENT-SAFE** | Universal | Typed HTTP transport (`RoleviaApiClient`), `ApiClientError` hierarchy, URL sanitizer (`isSafeHttpUrl`). No DOM/browser globals required. |
| `@oca/config` | **SPLIT CONTRACT** | Split | `./browser`: Client-safe public config validation (`VITE_API_BASE_URL`, `VITE_DEVELOPMENT_CANDIDATE_ID`).<br>`./server`: Server-only environment parsing (`SQLITE_DATABASE_PATH`, `GREENHOUSE_BOARDS`). |
| `@oca/database` | **SERVER-ONLY** | Node.js / Server | Drizzle ORM schemas, SQLite client, migrations, `ApplicationRepository`, `CareerMemoryRepository`, `TaskLedger`. |
| `@oca/intelligence` | **SERVER-ONLY** | Node.js / Server | Frozen deterministic engines (`Eligibility`, `Fit`, `Quality`, `Decision`). |
| `@oca/sources` | **SERVER-ONLY** | Node.js / Server | ATS source ingestion & adapters (`GreenhouseAdapter`). |
| `@oca/worker` | **SERVER-ONLY** | Node.js / Server | Background worker polling loop, task execution, decision workflow. |

---

## 4. Shared API Client (`@oca/api-client`)

The `@oca/api-client` package provides a runtime-portable, typed HTTP client wrapper around Rolevia REST endpoints:

### Key Features
- **Runtime Portability**: Compatible with Node.js, Web Browsers, Tauri WebViews, and React Native/Expo. Accepts an optional custom `fetcher` implementation and `AbortSignal`.
- **Response Contract Validation**: All HTTP responses are validated at the transport boundary using TypeBox (`Value.Check(schema, responseBody)`).
- **Typed Error Hierarchy**:
  - `NetworkError`: Server offline, DNS failure, connection timeout.
  - `ValidationError`: Response or input failed TypeBox contract check.
  - `NotFoundError`: HTTP 404 (mapped to `null` for resource lookups like `getOpportunity`).
  - `ConflictError`: HTTP 409 (preserves `STALE_WRITE` optimistic concurrency semantics for `updateApplication`).
  - `UnauthorizedError` & `ForbiddenError`: HTTP 401 / 403 for future authentication.
  - `ServerError`: HTTP 5xx.
- **View-Model Decoupling**: Returns raw API/domain-shaped data. Presentation mapping (badge colors, layout text) remains inside client UI code (`apps/web`).

---

## 5. Configuration & Candidate Identity Boundary

### Public Client Config vs. Server Secrets
- **Public Client Config** (`VITE_API_BASE_URL`, `VITE_DEVELOPMENT_CANDIDATE_ID`, `VITE_PRODUCT_DATA_SOURCE`): Exposed to browser/desktop/mobile runtime. Contains **zero secrets**.
- **Server-Only Configuration** (`SQLITE_DATABASE_PATH`, `GREENHOUSE_BOARDS`, future database credentials / OAuth client secrets): Never bundled into client builds.

### Candidate Identity Boundary
In development, `VITE_DEVELOPMENT_CANDIDATE_ID` or header options supply candidate identity. In cloud mode, candidate identity will be resolved via authenticated session context (`Authorization: Bearer <token>`). Clients are untrusted; candidate IDs passed by clients will be verified against session grants.

---

## 6. Database Strategy & PostgreSQL Migration Triggers

### Current SQLite Baseline
Single-tenant self-hosting and local development rely on SQLite managed via Drizzle ORM (`packages/database`). All SQLite specifics (syntax, JSON columns, migrations) are encapsulated inside `packages/database`.

### PostgreSQL Migration Triggers for Rolevia Cloud
Rolevia Cloud will migrate persistence from SQLite to PostgreSQL only when specific operational triggers are met:
1. **Multi-Instance Horizontal Scaling**: Cloud API and Worker instances are scaled horizontally behind a load balancer and require concurrent remote database connections.
2. **High-Throughput Concurrent Writes**: Continuous background worker ingestion and multi-user candidate activity exceed SQLite write lock thresholds.
3. **Enterprise Operational Requirements**: Managed database features (point-in-time recovery, automated read replicas, row-level security) are required for cloud SLA guarantees.

---

## 7. Client & Deployment Target Boundaries

- **Web Target**: React + Vite SPA consuming `@oca/api-client`.
- **Desktop Target (Tauri)**: Lightweight native webview shell wrapping the Web client and consuming `@oca/api-client` (cloud or self-hosted API).
- **Mobile Target (React Native / Expo)**: Native iOS/Android apps consuming `@oca/api-client`. Mobile clients **never** run local workers, SQLite databases, or source scrapers.
- **Self-Hosted Backend**: Single Docker container / process running API + Worker + SQLite.
- **Fully-Local Desktop Mode (Future)**: Bundled local API + Worker + SQLite running on-device for 100% offline desktop usage. Deferred to a future milestone.

---

## 8. External URL Safety & Bundle Verification

- **External URL Sanitizer**: All external links (e.g., application source URLs) are validated using `isSafeHttpUrl(url)`, strictly enforcing `http:` or `https:` protocols to prevent `javascript:` or `data:` XSS exploits.
- **Bundle Safety Verification**: Web production builds (`apps/web/dist`) are verified to contain zero references to `@oca/database`, `better-sqlite3`, `drizzle-orm`, or server-only modules.

---

## 9. Validation Results

```bash
pnpm typecheck    # PASS (100% clean across all 11 workspace packages)
pnpm test         # PASS (296/296 tests pass cleanly)
pnpm build        # PASS (100% clean production workspace builds)
pnpm format:check # PASS (100% formatted)
pnpm lint         # PASS (0 errors)
```
