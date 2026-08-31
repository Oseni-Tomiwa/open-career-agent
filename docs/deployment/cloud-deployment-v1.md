# Rolevia Cloud Deployment V1 — Architecture & Operations Guide

## 1. Production Architecture Topology

```
                                  Internet
                                     │
                                   HTTPS
                                     │
                        ┌────────────┴────────────┐
                        │                         │
                 app.rolevia.com           api.rolevia.com
                 (Rolevia Web)             (Rolevia API)
                  Static SPA                      │
                        │                         │
                        │                       Cloud PostgreSQL
                        │                       (Managed DB)
                        │                         │
                        └──────── CORS / API ─────┤
                                                  │
                                           Rolevia Worker
                                           (Background Process)
                                                  │
                                             ATS Sources
                                      Greenhouse / Lever / Ashby
```

### Component Overview
1. **Rolevia Web (`@oca/web`)**: Production React SPA static asset bundle (`apps/web/dist`). Deployed to static edge hosting (Cloudflare Pages, Vercel, Netlify, or S3/CloudFront) with SPA rewrite rules routing `/*` to `/index.html`.
2. **Rolevia API (`@oca/api`)**: High-performance Node.js Fastify server running in Cloud mode (`IDENTITY_MODE=cloud`, `DATABASE_ENGINE=postgres`). Exposes REST API, enforces authentication, CORS, rate limiting, and request limits.
3. **Rolevia Worker (`@oca/worker`)**: Persistent background process that continuously polls and claims background tasks (`discovery.run`, `eligibility.evaluate`, `fit.evaluate`, `quality.evaluate`, `decision.evaluate`) using PostgreSQL-safe `FOR UPDATE SKIP LOCKED` locking semantics.
4. **Cloud PostgreSQL**: Managed database instance (e.g. AWS RDS PostgreSQL, GCP Cloud SQL, or Neon) running PostgreSQL 16. Shared by API and Worker.

---

## 2. Production Commands

| Component | Operation | Production Command |
| :--- | :--- | :--- |
| **Web** | Build | `pnpm --filter @oca/web build` |
| **Web** | Deploy Artifact | Distribute contents of `apps/web/dist` |
| **API** | Start Server | `pnpm --filter @oca/api start` |
| **Worker** | Start Process | `pnpm --filter @oca/worker start` |
| **PostgreSQL** | Run Release Migrations | `pnpm --filter @oca/database db:migrate:postgres` |

---

## 3. Environment Variable & Secret Inventory

| Variable Name | Component | Classification | Description & Production Value |
| :--- | :--- | :--- | :--- |
| `APP_ENV` | Shared | CONFIG | Set to `production` in live environments. |
| `IDENTITY_MODE` | Shared | CONFIG | Set to `cloud` for multi-user authentication. |
| `DATABASE_ENGINE` | Shared | CONFIG | Must be `postgres` in Cloud mode. |
| `DATABASE_URL` | API, Worker | SECRET | Connection string (`postgres://user:pass@host:5432/dbname?sslmode=require`). |
| `API_HOST` | API | CONFIG | Default `0.0.0.0` for container environments. |
| `API_PORT` | API | CONFIG | Production port (e.g. `3000` or `8080`). |
| `WEB_ORIGIN` | API | CONFIG | Exact production Web origin (e.g., `https://app.rolevia.com`). |
| `SESSION_TTL_HOURS` | API | CONFIG | Session duration in hours (default `168` / 7 days). |
| `VITE_API_BASE_URL` | Web | PUBLIC CONFIG | Public API URL compiled into web bundle (e.g. `https://api.rolevia.com`). |
| `VITE_PRODUCT_DATA_SOURCE` | Web | PUBLIC CONFIG | Must be `api` for Cloud production builds. |
| `VITE_DEPLOYMENT_MODE` | Web | PUBLIC CONFIG | Set to `cloud` for production web builds. |
| `WORKER_POLL_INTERVAL_MS` | Worker | CONFIG | Task polling frequency (default `1000`ms). |
| `WORKER_LEASE_DURATION_MS` | Worker | CONFIG | Task lease timeout (default `30000`ms). |

---

## 4. HTTPS, Authentication & Security Configuration

### Auth Topology & Domain Strategy
- **Web Domain**: `app.rolevia.com`
- **API Domain**: `api.rolevia.com`
- **TLS Termination**: Managed by cloud proxy / load balancer (e.g., Cloudflare or AWS ALB). All requests arriving at API must use HTTPS.

### Cookie & Header Rules
- **Cookie Name**: `rolevia_session`
- **Cookie Attributes**: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=604800` (7 days), `Secure` (enforced when `APP_ENV=production`).
- **Bearer Token Support**: Full `Authorization: Bearer <token>` support for API clients.
- **CORS Configuration**: Restricts allowed origins strictly to `WEB_ORIGIN` (`https://app.rolevia.com`) with `credentials: true`.
- **Security Headers**: API sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.

---

## 5. Rate Limiting V1 & Request Body Limits

- **Rate Limiting**: Protects unauthenticated auth endpoints (`/auth/register` and `/auth/login`) with a sliding-window bucket (5 requests / minute per IP).
- **HTTP 429 Response**: Returns `TOO_MANY_REQUESTS` code with a `Retry-After: <seconds>` header.
- **Account Existence Leakage**: Prevented. Rate limits apply at the endpoint level before credentials or account lookup occur.
- **Deployment Constraint**: Rate Limiting V1 uses an in-memory bucket. V1 deployment is constrained to a **single API process replica** (or load balancer with sticky sessions).
- **Request Payload Limit**: Fastify configured with `bodyLimit: 1_048_576` (1 MB) to prevent denial-of-service payload attacks while supporting large Career Memory updates.

---

## 6. PostgreSQL Production Configuration & Safety

- **Engine Enforcement**: `IDENTITY_MODE=cloud` rejects SQLite startup; `DATABASE_ENGINE=postgres` and valid `DATABASE_URL` are strictly required.
- **Connection Pooling**: `pg.Pool` initialized with `max: 20` connections per process.
- **Test Safety Guard**: Database client contains a safety assertion (`assertSafeTestDatabaseUrl`) preventing test suites from executing against production PostgreSQL instances.

---

## 7. Production Release Procedure

### Canonical Release Order
1. **Build Artifacts**: Compile TypeScript packages and web bundle (`pnpm build`).
2. **Execute Migrations ONCE**: Run PostgreSQL release migration command:
   ```bash
   DATABASE_ENGINE=postgres DATABASE_URL="..." pnpm --filter @oca/database db:migrate:postgres
   ```
3. **Deploy API Service**: Rolling update or restart of `Rolevia API` container.
4. **Deploy Worker Service**: Restart `Rolevia Worker` container.
5. **Deploy Web Service**: Upload `apps/web/dist` to static hosting.
6. **Health & Readiness Check**: Verify `GET /health` (200) and `GET /ready` (200).
7. **Execute Smoke Test**: Run `tsx scripts/production-smoke.ts --apiUrl https://api.rolevia.com`.

---

## 8. Rollback Strategy

- **Application Code Rollback**: Application services (API/Worker) can be rolled back immediately to the previous container image tag.
- **Database Schema Rollback**: Database migrations are designed to be strictly forward-compatible. Database fields and tables are non-destructive, permitting older API binaries to operate safely alongside newer database schemas.

---

## 9. Monitoring, Health & Resilience

- **Liveness (`GET /health`)**: Returns HTTP 200 `{ status: "ok" }` when node process is running.
- **Readiness (`GET /ready`)**: Returns HTTP 200 `{ status: "ready" }` if PostgreSQL database is reachable and migrations are complete; returns HTTP 503 `{ status: "not_ready" }` if DB is down.
- **Worker ATS Resilience**: Worker tolerates ATS source outages (Greenhouse, Lever, Ashby) without crashing. Source failures result in bounded `FAILED` task states with exponential backoff and jittered retries.
- **Graceful Shutdown**: Both API and Worker handle `SIGTERM` and `SIGINT` signals, draining active requests, releasing background task leases, and closing database connection pools cleanly.

---

## 10. Backup & Recovery Policy

- **Automated Daily Backups**: Managed PostgreSQL instance configured for automated daily full snapshots.
- **Point-in-Time Recovery (PITR)**: Enable WAL (Write-Ahead Logging) archiving for 7-day point-in-time recovery.
- **Backup Retention**: 30 days minimum retention for production database backups.
- **Backup Isolation**: Backup snapshots stored in separate isolated storage accounts.

---

## 11. Known Public-Launch Blockers

Before opening Rolevia Cloud to unrestricted public self-registration, the following features must be implemented in future milestones:

1. **Email Verification**: User registration currently accepts self-reported email without confirmation links.
2. **Password Reset**: Automated password recovery via email token is not implemented.
3. **User Privacy & Account Deletion**: Self-service GDPR account deletion workflow for cascading removal of user candidates and claims.
4. **Terms of Service & Privacy Policy**: Formal legal terms and privacy disclosures.
