# Product Navigation & Information Architecture V1 Guide

## 1. Overview & Information Architecture Strategy

Rolevia's interface is structured to reflect an intuitive **AI Career Command Center** for the candidate. While internal architecture, backend repositories, and API schemas use domain-specific engineering names (`TodayRepository`, `Opportunity`, `CareerMemory`, `CareerSignals`, `Decision`, `EvaluationFinding`, `SearchTarget`, `DiscoveryRun`), the user-facing product presents clean, career-centric vocabulary.

```
                           Rolevia Primary Navigation
                                       │
     ┌───────────────────┬─────────────┼─────────────┬───────────────────┐
     │                   │             │             │                   │
  Overview         Discover Jobs    Matches    Applications       Career Insights
 (/overview)        (/discover)    (/matches)  (/applications)      (/insights)
                         │                                               │
             ┌───────────┴───────────┐                       ┌───────────┴───────────┐
             │                       │                       │                       │
         All Jobs            Search Preferences       Agent Activity             Settings
     (Opportunities)          (Search Targets)          (/activity)            (/settings)
                                                                                     │
                                                                               Career Profile
                                                                              (Career Memory)
```

---

## 2. Primary Navigation Map

| Primary Route | User-Facing Name | Description & Functional Purpose |
| :--- | :--- | :--- |
| `/overview` | **Overview** | Daily career command center dashboard showing priority jobs, attention items, recent changes, application activity, and discovery runs. |
| `/discover` | **Discover Jobs** | Browse discovered position listings. Integrates **Search Preferences** as a secondary tab for managing search targets and triggering manual discovery runs. |
| `/matches` | **Matches** | Curated, read-only view of jobs grouped by recommendation priority (High Priority, Consider, Investigate, Low Priority, Blocked). |
| `/applications` | **Applications** | Candidate application tracker managing job application statuses, follow-ups, notes, and activity history. |
| `/insights` | **Career Insights** | Evidence-backed recurring market patterns, demand trends, repeated skill gaps, and capability alignments. |
| `/activity` | **Agent Activity** | Read-only history of persisted job-search runs, their configured sources, result counts, and processing status. |
| `/settings` | **Settings** | User configuration containing **Career Profile** (Career Memory claims & evidence) and appearance/theme selection. |

---

## 3. Vocabulary Mapping (Internal vs External)

| Internal Architecture Symbol | User-Facing Product Vocabulary | Rationale |
| :--- | :--- | :--- |
| `Today` / `TodayRepository` | **Overview** | Clearer executive command center context. |
| `Opportunity` | **Job / Discover Jobs** | Natural candidate terminology. |
| `SearchTarget` | **Search Preferences** | Focuses on user intent rather than entity management. |
| `CareerSignals` | **Career Insights** | Emphasizes actionable market intelligence. |
| `CareerMemory` | **Career Profile** | User-friendly profile and claims interface. |
| `Decision` | **Recommendation** | Clarifies Rolevia's recommendation level. |
| `EvaluationFinding` | **Why this matches / Reason / Evidence** | Transparent evidence rationale. |
| `DiscoveryRun` | **Search activity / Agent activity** | Clear background execution history. |

---

## 4. Architectural Stability & Read-Only Invariants

### Backend Stability Invariant
Backend database tables, ORM schemas (`schema.ts`, `schema-pg.ts`), domain identifiers, intelligence engines (`EligibilityEngine`, `FitEngine`, `QualityEngine`, `DecisionEngine`), repositories (`TodayRepository`, `OpportunityRepository`, `CareerMemoryRepository`), and API endpoints remain 100% frozen. No backend identifiers are renamed.

### Surface Boundaries & Rules
1. **Matches Read-Only Boundary**: Matches is a presentation and curation view over canonical `Decision` state. It does NOT compute fake numeric percentages, re-score jobs, or mutate database state.
2. **Overview Read-Only Boundary**: Overview renders existing `/today` API data without side-effects.
3. **Agent Activity Boundary**: Renders truthful, candidate-scoped `DiscoveryRun` history without implying access to a general task ledger or fabricating artificial activity.
4. **Search Preferences Location**: Integrated cleanly inside **Discover Jobs** -> `Search Preferences` tab.
5. **Career Profile Location**: Integrated cleanly inside **Settings** -> `Career Profile` tab.

---

## 5. Deferred Product Surfaces

The following surfaces are explicitly deferred from V1 primary navigation to prevent dead links or non-functional controls:
- ❌ **Documents** (Application materials / résumé builder — planned for future milestone)
- ❌ **Notifications** (Notification bell / inbox backend — planned for future milestone)
- ❌ **Rolevia Pro / Billing** (No fake subscription badges or fake plan tiers)

---

## 6. Legacy Route Compatibility

To preserve deep links, bookmarks, and test URLs, legacy routes automatically redirect to canonical V1 destinations:
- `/today` -> Redirects to `/overview`
- `/opportunities` -> Redirects to `/discover`
- `/opportunities/:id` -> Directly supported for deep linking
- `/signals` -> Redirects to `/insights`
- `/profile` -> Redirects to `/settings`
- `/search` -> Redirects to `/discover?tab=preferences`
