# ADR-008: Cloud identity and authorization boundary

- **Status:** Accepted
- **Deciders:** Rolevia Core Architecture Team
- **Date:** 2026-08-31

## Context

The local product identifies career data with a client-provided Candidate ID.
A hosted multi-user service must instead authenticate a person, associate that
User with one or more Candidate domain subjects, and enforce ownership before
candidate-scoped repositories are called. The design must preserve trusted local
operation and support browser and future native clients without coupling the
domain to an auth vendor.

## Options considered

1. Adopt an external auth provider and expose its user model throughout the API.
2. Use first-party email/password authentication with opaque persisted sessions.
3. Build magic-link email authentication, including delivery and token flows.

An external provider would add vendor and operational coupling before a provider
has been selected. Magic links require production email delivery that is outside
this foundation. Both can be reconsidered behind the same principal boundary.

## Decision

Choose first-party email/password authentication with salted `scrypt` password
hashes and random opaque sessions whose token digests, expiry, and revocation are
persisted. Browser transport uses an HttpOnly SameSite cookie plus exact-Origin
checks on mutations. Native clients can request the same session credential as a
bearer token and store it using platform secure storage.

`User` is an account and `Candidate` is a distinct career-domain entity.
`user_candidates` records grants and a primary Candidate. All Cloud product
requests resolve an `AuthenticatedPrincipal` to a User and centrally verify any
path/query Candidate against those grants. Domain repositories remain unaware
of authentication transports or providers.

Development and self-hosted modes use one explicitly configured trusted
Candidate and do not force Cloud sign-in UI. This trusted mode must not be
publicly exposed. Cloud mode never consults the Vite development Candidate.

## Consequences

Sessions are revocable across API processes sharing a database, existing URLs
and the portable API client remain usable, and a future provider/OIDC adapter can
produce the same principal without changing career-domain code. The service now
owns password security and account recovery responsibilities. Email
verification, password reset, distributed rate limiting, production deployment,
and privacy workflows remain required before public SaaS launch.
