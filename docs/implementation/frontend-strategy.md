# Frontend and product-interface strategy

## Product stance

The web application is a first-class product surface. The first implemented interface must be the real application shell and real product workflows, even while it reads fictional seeded data through the real API. A disposable dashboard, temporary admin panel, generic AI SaaS template, or collection of placeholder boxes is explicitly out of scope.

The interface should be professional, information-dense, calm, and explainable. Visual richness is useful when it clarifies identity, hierarchy, Evidence, uncertainty, state, or change; decorative imagery must not crowd the work.

## Framework decision

Use React with Vite and React Router for the authenticated web application.

The accepted architecture already places application behavior behind an independent API and requires a separately operable worker. A Vite application makes that boundary obvious and produces static client assets that are easy to serve in local/self-hosted deployments. React's component and accessibility ecosystem is strong for the dashboard, detail, filtering, pipeline, and visualization work.

Use React Router's data APIs for route hierarchy, URL state, pending navigation, and route-level errors. Use a dedicated query cache such as TanStack Query for server-state fetching, invalidation, optimistic actions where safe, and background refresh. Do not duplicate canonical data into a broad client store. Local UI state should remain local; share it only when multiple routes truly need it.

### Why not Next.js for the application

Next.js is a credible option and provides server rendering, server components, route handlers, image optimization, and strong public-page support. Those strengths do not outweigh its costs here:

- the product is primarily an authenticated, data-rich application rather than a public content site;
- using Next route handlers for business behavior would blur the independent API boundary;
- self-hosting introduces a Next server and runtime behavior in addition to the API and worker;
- server/client component decisions would add a second server composition surface without a current SSR requirement.

If public marketing or indexable content becomes important, it may be deployed separately or pre-rendered. Revisit the application framework only when committed SSR, SEO, streaming, or public-content requirements cannot be met cleanly at that boundary. Next.js is an option in that evaluation, not a predetermined migration.

## Product information architecture

The first shell should support genuine navigation and responsive hierarchy for:

- Today or dashboard: prioritized opportunities, freshness, worker/system status, and next actions
- Opportunities: search, filter, sort, saved states, and comparison-ready cards/list rows
- Opportunity detail: role/company/source identity, Eligibility, Fit, Quality, Evidence, provenance, snapshots, and actions
- Applications: pipeline, durable events, next steps, and history
- Profile and Evidence: candidate facts, preferences, confidence, provenance, and gaps
- Sources/settings: configured sources, scan status, provider capability, export/import, and local privacy controls

Routes, navigation labels, and mobile behavior should be validated during design; this list defines capability, not final copy.

Opportunity cards must surface enough decision context to be useful without opening every item: identity, location/work mode, freshness, Eligibility state and blocker/unknown summary, distinct Fit and Quality signals, source, and Candidate action state. Details progressively disclose explanations and Evidence rather than compressing them into a single score.

## Design system

Use Tailwind CSS backed by project-owned CSS custom properties and semantic design tokens. Use Radix Primitives for accessible interaction behavior where native HTML is insufficient. shadcn/ui may be used selectively as editable, source-owned component code, with the Radix primitive choice pinned explicitly; its defaults are not the product's visual language.

Do not install a broad component catalog in advance. Add a primitive when a real product screen needs it, then adapt it to project tokens and interaction conventions.

CSS Modules would provide strong local ownership and readable authored CSS, but shared responsive/state conventions would require more repeated composition across a large dashboard. Pure vanilla CSS has the smallest tooling surface and remains appropriate inside global token/base layers, but offers less guardrail for consistently assembling many dense responsive views. A pre-styled component suite is rejected because it would make accessibility fixes and product identity depend on a vendor theme. The selected combination keeps CSS variables as the durable theming contract, Tailwind as the composition tool, and Radix/native HTML as the behavior layer.

The token system will define, without choosing final brand values in this phase:

- semantic foreground, surface, border, focus, and data-display roles;
- a deliberate spacing and responsive-density scale;
- typography roles and numeric/tabular treatment;
- radii, elevation, borders, and layering;
- duration/easing with reduced-motion behavior;
- Eligibility states including eligible, blocked, conditional, and unknown;
- separate Fit and Quality scales;
- uncertainty, conflict, stale, partial, loading, success, warning, and failure states;
- chart series, comparison, selection, missing-data, and confidence conventions;
- light and dark theme mappings.

Color must never be the only state carrier. Pair semantic color with text, icon, shape/pattern, and accessible names. Fit and Quality remain visually and semantically separate, and unknown is never styled as a negative answer.

Use one coherent SVG icon family, with product-specific icons added only when the family cannot convey the concept. Icons complement labels; they do not replace unclear actions. Final fonts, logo, brand palette, illustration style, and product name remain deferred.

## Responsive and accessible interaction

Design desktop, tablet, and mobile behavior together rather than shrinking a desktop table after implementation.

- Dense desktop views may use tables or split panes; smaller views use prioritized cards and progressive disclosure.
- Filters and sort state remain URL-addressable and keyboard operable.
- Touch targets, visible focus, logical tab order, headings, landmarks, labels, and error associations are required.
- Dialogs, menus, popovers, tabs, and comboboxes use well-tested accessible primitives and preserve expected keyboard behavior.
- Charts include textual summaries and accessible data tables or equivalent inspectable values.
- Motion indicates relationship or state change, remains subtle, and respects `prefers-reduced-motion`.
- Layout must tolerate long company/role names, missing fields, localization growth, zoom, and large text.

Automated accessibility checks are a gate for common failures, not proof of accessibility. Critical workflows also receive keyboard and screen-reader review.

## Data and state presentation

Every meaningful surface is designed for:

- loading and skeleton states that resemble the destination layout;
- empty states that explain what is absent and provide a relevant next action;
- scoped errors with retry or recovery rather than a blank screen;
- partial, stale, unknown, and conflicting data that remains visibly distinct;
- worker/provider/source outages that do not hide deterministic results;
- optimistic updates only when reversal is safe and user intent remains clear.

The UI consumes API projections. It must not calculate canonical Eligibility, Fit, Quality, Decision, identity, or pipeline history. Source citations and Evidence links should remain adjacent to the conclusion they support.

## Visual assets

### Company and source identity

Use source-provided company logos only when technically reliable and permitted. Fetch through a controlled server-side allowlist/cache or store a managed reference rather than hotlinking arbitrary scraped URLs from the browser. Every logo has an immediate text/monogram fallback, fixed dimensions, and an image-error path; a failure must never break or reflow an opportunity card.

ATS/source icons should be project-owned assets or correctly licensed vendor marks with documented provenance. Do not imply endorsement.

### Candidate, illustration, and marketing assets

Candidate avatars are optional and privacy-aware, with initials as the baseline fallback. Product illustrations, onboarding visuals, and empty-state art should be project-owned or generated for the project with provenance and usage rights recorded. Use them only when they teach, orient, or add appropriate delight. Avoid random stock photography and do not make scraped imagery a functional dependency.

Future screenshots and marketing images should use fictional publishable data and a repeatable capture process. Do not expose real Candidate Evidence or source credentials.

### Charts

Choose chart components per real analytical question, not to decorate a dashboard. Wrap the selected chart library behind project conventions for tokens, labels, tooltips, responsive sizing, missing values, keyboard alternatives, and tables. Delay the library choice until the first concrete chart set is designed; a chart dependency is not required merely to scaffold the shell.

## Image and content security

- Browser bundles receive no source, AI, or server credentials. Only explicitly public environment variables may be exposed by Vite.
- Establish a Content Security Policy at the serving/reverse-proxy boundary and keep allowed image/connect origins narrow.
- Treat job descriptions, source markup, user fields, and model output as untrusted text.
- Prefer structured text rendering. If a justified feature accepts HTML, sanitize through a maintained allowlist library on a controlled boundary; never use raw HTML insertion for source content.
- External URLs use validated schemes and safe link behavior.
- Model instructions embedded in source descriptions are content, not commands; the provider boundary must isolate them from system instructions and capabilities.

## Seeded data is not a dummy UI

The first scaffold should seed fictional, deterministic records through the same database and API paths used by the product. The dataset should include:

- a realistic Candidate profile, Preferences, Claims, and Evidence;
- opportunities from each planned source with logos and fallback cases;
- eligible, blocked, conditional, unknown, conflicting, stale, and partial states;
- distinct low/medium/high Fit and Quality combinations;
- source provenance, snapshots, evaluations, and decision explanations;
- saved, shortlisted, investigating, dismissed, and application-pipeline states;
- ApplicationEvents and recoverable source/provider failures.

This data exists to exercise production components, routing, responsive layouts, filters, explanations, and state handling immediately. Hard-coded cards or a separate mock-only interface that will later be replaced are not acceptable.

## Performance approach

- Split code by route and load expensive visualization/editor features only when needed.
- Paginate or virtualize large opportunity sets only after representative measurements; preserve accessibility when doing so.
- Keep server state normalized at the API rather than shipping raw source payloads.
- Reserve image dimensions and lazy-load non-critical assets.
- Measure interaction latency, bundle size, layout shift, and list performance in representative seeded scenarios.

## Primary references

- [Vite guide](https://vite.dev/guide/)
- [Vite production builds](https://vite.dev/guide/build.html)
- [Next.js self-hosting guide](https://nextjs.org/docs/app/guides/self-hosting)
- [React Router modes](https://reactrouter.com/start/modes)
- [Tailwind theme variables](https://tailwindcss.com/docs/theme)
- [Radix Primitives introduction](https://www.radix-ui.com/primitives/docs/overview/introduction)
- [Radix accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility)
- [shadcn/ui documentation](https://ui.shadcn.com/docs)
