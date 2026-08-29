# Testing and quality strategy

## Principles

Tests should protect product meaning and failure behavior, not mirror implementation structure. Most confidence should come from fast deterministic core tests, with focused SQLite/API/worker integration tests and a small set of high-value browser workflows. The same fictional scenarios should remain useful from domain evaluation through UI acceptance.

Use the smallest coherent tool set:

- **Vitest** for TypeScript unit, contract, component, API, database, and worker tests;
- **Testing Library** for user-observable React component behavior; and
- **Playwright** for real-browser workflows, responsive behavior, and automated accessibility checks with `@axe-core/playwright`.

Vitest is selected over adding Node's built-in test runner because the repository already needs Vite-aware TypeScript/JSX and component support. One runner reduces configuration and assertion/mock differences across core and server packages. Playwright remains separate because browser behavior cannot be established by a DOM simulation.

## Test layers

| Layer | Primary focus | Tools and boundary |
|---|---|---|
| Domain unit | invariants, state transitions, Eligibility, Fit, Quality, Decisions, Claims/Evidence, identity rules | Vitest; pure inputs, deterministic clocks/IDs |
| Behavioral scenarios | existing intelligence examples and combinations of blockers, unknowns, conflicts, confidence, and explanation | table-driven Vitest fixtures derived from `docs/intelligence/scenarios.md` |
| Normalization | source-to-neutral mapping, missing fields, timestamps, provenance, deterministic identity signals | Vitest fixture tests; no network |
| Source adapter contract | pagination, rate limits, malformed/untrusted records, stable IDs, error mapping | Vitest against recorded/minimal fictional fixtures and local HTTP fakes |
| Persistence integration | repositories, constraints, transactions, snapshots/history, migrations, job claims | Vitest with a fresh temporary SQLite database per test group |
| API integration | schemas, status/problem responses, authorization seams, use-case wiring, OpenAPI | Fastify injection under Vitest; real database for selected vertical slices |
| Worker integration | leases, retries, backoff, crash recovery, shutdown, idempotency, partial provider/source failure | Vitest with fake clock, deterministic handlers, and SQLite |
| UI component | keyboard interaction, labels, conditional states, responsive component logic, server-state outcomes | Testing Library under Vitest; test behavior, not implementation classes |
| Browser/E2E | navigation, filters, detail/evidence, user decisions, pipeline events, mobile shell, failure recovery | Playwright against real web/API/worker composition and seeded SQLite |
| Accessibility | semantics, focus, keyboard, contrast/state alternatives, zoom and screen-reader usability | axe-assisted Playwright plus manual review |

## Intelligence scenarios as executable behavior

Translate each scenario into versioned fixtures with Candidate facts/Evidence, OpportunitySnapshot/source Evidence, expected Eligibility state and reasons, separate expected Fit and Quality signals, uncertainty/conflicts, and expected Decision explanation. Test assertions should protect semantic outcomes and provenance without freezing incidental prose or an undeclared final ranking formula.

Add regression scenarios whenever a real bug changes a conclusion, loses an unknown, merges distinct opportunities, or breaks provenance. Keep model-assisted tests at the validated proposal boundary; core behavior must be testable without a provider or network call.

## Source Adapter and normalization tests

- Maintain small, licensed-or-fictional fixtures representing each supported source and notable schema variants.
- Test raw record retention and retrieval metadata before normalization.
- Verify absent, malformed, conflicting, and adversarial fields remain explicit.
- Assert adapters conform to one SourceRecord schema and cannot emit source-specific domain entities.
- Test rate-limit, timeout, pagination-loop, duplicate-page, and partial-fetch behavior with a local fake server.
- Keep optional live-source smoke tests quarantined, credential-gated, non-blocking for ordinary contributors, and safe against source terms/rate limits.

Fixture refresh is reviewed; blindly overwriting expected output can conceal upstream drift.

## SQLite and repository tests

Use isolated on-disk temporary SQLite databases where locking, multiple connections, or crash recovery matters; use in-memory databases only for behavior that is genuinely equivalent. Apply the real migration sequence to empty databases and test upgrade fixtures from supported prior schemas once releases exist.

Cover:

- foreign keys, uniqueness, stable IDs, and transaction rollback;
- append-oriented snapshots, Evaluations, Decisions, and ApplicationEvents;
- human-readable export/import round trips without treating files as canonical;
- concurrent API/worker writes, busy handling, and documented latency targets;
- consistent backup/restore and migration validation;
- repository mapping that preserves unknowns and provenance.

Database tests should make engine assumptions visible. Do not substitute a generic repository mock for integration behavior where transactions or locking are the risk.

## Job-ledger tests

Use a controllable clock and multiple logical worker identities. Verify:

- only one valid lease owns a claim;
- network/model work occurs outside transactions;
- expired leases are reclaimable and stale tokens cannot complete work;
- retryable and permanent failures transition differently;
- backoff, jitter bounds, maximum attempts, and final failure are observable;
- duplicate delivery produces one domain effect;
- recurring scheduling survives restart;
- shutdown stops new claims and safely completes or abandons in-flight work;
- one failed source/provider leaves deterministic and unrelated work available.

Include representative concurrent-write tests on supported local hardware. Those measurements help enforce ADR-001's SQLite revisit conditions.

## API and contract tests

- Validate successful and failing examples for every public schema.
- Use Fastify injection for most route integration tests; no bound port is required.
- Test stable public problem details and confirm internal errors/secrets are redacted.
- Generate OpenAPI deterministically and fail CI if the committed artifact/client is stale.
- Add compatibility checks when the first external contract is released.
- Test that unknown response fields and versioned imports follow a documented compatibility policy.

Schema-valid model output still receives domain tests. Include invalid JSON, schema mismatch, refusal, truncation, malicious source instructions, and provider outage cases.

## Web testing

Testing Library tests should query by role, label, name, and visible behavior. Avoid snapshots of large component trees and assertions on styling implementation. Use focused visual regression only after stable high-value surfaces and supported viewports exist; it is deferred from the minimum scaffold.

Playwright's first critical flows should cover:

1. open the real responsive shell and navigate without a mouse;
2. filter/sort opportunities and preserve URL state;
3. inspect an opportunity's Eligibility, Fit, Quality, Evidence, source, uncertainty, and history;
4. shortlist/investigate/dismiss and observe the durable Decision;
5. advance an Application through a human-authorized action and see an ApplicationEvent;
6. recover from empty, partial, source-failure, provider-failure, and stale-data states;
7. exercise a narrow mobile viewport and light/dark/system themes.

Automated axe checks catch common violations but do not cover all WCAG or product usability. Before a release, manually check full keyboard operation, focus order/restoration, headings/landmarks, zoom/reflow, high contrast, reduced motion, and representative screen-reader output.

## Code quality baseline

Use Prettier for formatting and ESLint flat configuration for correctness, React hooks/accessibility rules, unsafe TypeScript patterns, and package import boundaries. Avoid stylistic lint rules that compete with Prettier.

Enable TypeScript `strict` plus at least `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, and `useUnknownInCatchVariables`. Boundary data begins as `unknown` and is validated. Do not use broad `any` or assertions to bypass untrusted input.

Enforce:

- package export maps and declared workspace dependencies;
- no cross-package source-path imports or dependency cycles;
- core's prohibition on UI, framework, database, source SDK, and provider SDK imports;
- no browser imports from server-only packages;
- exhaustive handling for closed domain state unions;
- safe logging/redaction and no committed secrets.

## CI and review expectations

Every change should leave these checks green, with root commands provided by the later scaffold:

1. formatting check;
2. lint and import-boundary check;
3. strict type check;
4. unit and behavioral scenario tests;
5. database, API, and worker integration tests;
6. production builds for all apps/packages;
7. OpenAPI/generated-client drift and migration integrity checks;
8. Playwright critical flows and accessibility checks at an appropriate CI tier;
9. dependency and secret scanning appropriate to the repository.

Reviews should require an ADR for changes that reverse accepted cross-cutting decisions. A migration, generated client, fixture, or lockfile change is reviewed rather than treated as opaque output. Do not require arbitrary coverage percentages; use coverage to locate untested risk and require direct tests for domain decisions, boundary validation, and failure recovery.

## Primary references

- [Vitest guide](https://vitest.dev/guide/)
- [React Testing Library introduction](https://testing-library.com/docs/react-testing-library/intro/)
- [Playwright accessibility testing](https://playwright.dev/docs/next/accessibility-testing)
