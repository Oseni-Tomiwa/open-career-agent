import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { CompanyMark } from '../../components/CompanyMark.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { DecisionBadge, EligibilityStatus } from '../../components/Status.js';
import { fitPresentation } from '../../data/fitPresentation.js';
import { WorkspaceSectionHeader } from '../../components/WorkspaceSection.js';
import type { Opportunity } from '../../data/types.js';

type CategoryTab =
  | 'ALL'
  | 'HIGH_PRIORITY'
  | 'CONSIDER'
  | 'INVESTIGATE'
  | 'LOW_PRIORITY'
  | 'BLOCKED';
const categories: readonly [CategoryTab, string][] = [
  ['ALL', 'All Matches'],
  ['HIGH_PRIORITY', 'High Priority'],
  ['CONSIDER', 'Consider'],
  ['INVESTIGATE', 'Investigate'],
  ['LOW_PRIORITY', 'Low Priority'],
  ['BLOCKED', 'Blocked'],
];
const decisionToCategory: Record<string, CategoryTab> = {
  'high-priority': 'HIGH_PRIORITY',
  consider: 'CONSIDER',
  investigate: 'INVESTIGATE',
  'low-priority': 'LOW_PRIORITY',
  blocked: 'BLOCKED',
};

export default function MatchesPage() {
  const { snapshot, loadOpportunity } = useProductData();
  const [selectedCategory, setSelectedCategory] = useState<CategoryTab>('ALL');
  const [selectedId, setSelectedId] = useState(
    snapshot.opportunities[0]?.id ?? '',
  );
  const opportunities = snapshot.opportunities;
  const filtered = useMemo(
    () =>
      opportunities.filter(
        (opp) =>
          selectedCategory === 'ALL' ||
          decisionToCategory[opp.decision ?? ''] === selectedCategory,
      ),
    [opportunities, selectedCategory],
  );
  const selected = filtered.find((opp) => opp.id === selectedId) ?? filtered[0];
  const selectedIdForDetail = selected?.id ?? '';
  const selectedDetailLoaded = (selected?.history.length ?? 0) > 0;

  useEffect(() => {
    if (!selectedIdForDetail || selectedDetailLoaded) return;
    const controller = new AbortController();
    void loadOpportunity(selectedIdForDetail, controller.signal).catch(() => {
      // The summary remains usable if detail retrieval fails.
    });
    return () => controller.abort();
  }, [loadOpportunity, selectedIdForDetail, selectedDetailLoaded]);
  const count = (category: CategoryTab) =>
    category === 'ALL'
      ? opportunities.length
      : opportunities.filter(
          (opp) => decisionToCategory[opp.decision ?? ''] === category,
        ).length;

  return (
    <div className="page matches-page">
      <PageHeader
        eyebrow="Decision workspace"
        title="Matches"
        description="Triage persisted recommendations, then inspect the separate eligibility, fit, quality, and evidence basis."
        variant="operational"
      />
      <div
        aria-label="Recommendation filters"
        className="workspace-tabs matches-filters"
      >
        {categories.map(([key, label]) => (
          <button
            aria-pressed={selectedCategory === key}
            className={`button ${selectedCategory === key ? 'button-primary' : 'button-secondary'}`}
            key={key}
            onFocus={(event) =>
              event.currentTarget.scrollIntoView({
                block: 'nearest',
                inline: 'nearest',
              })
            }
            onClick={() => {
              setSelectedCategory(key);
              setSelectedId('');
            }}
            type="button"
          >
            {label} <span aria-hidden="true">{count(key)}</span>
          </button>
        ))}
      </div>
      {selected ? (
        <div className="match-workspace">
          <section
            aria-labelledby="match-queue-heading"
            className="match-queue"
          >
            <WorkspaceSectionHeader
              id="match-queue-heading"
              meta="Decision queue"
              title={`${filtered.length} opportunities`}
              description="Select a record to inspect its decision basis."
            />
            <div className="match-records">
              {filtered.map((opp) => (
                <button
                  aria-label={`Inspect ${opp.role} at ${opp.company.name}`}
                  aria-pressed={opp.id === selected.id}
                  className="match-record"
                  data-selected={opp.id === selected.id}
                  key={opp.id}
                  onClick={() => setSelectedId(opp.id)}
                  type="button"
                >
                  <CompanyMark company={opp.company} size="small" />
                  <span className="match-record-identity">
                    <strong>{opp.role}</strong>
                    <small>
                      {opp.company.name} · {opp.location}
                    </small>
                  </span>
                  <DecisionBadge decision={opp.decision} />
                  <Icon name="arrow-right" size={16} />
                </button>
              ))}
            </div>
          </section>
          <aside
            aria-label={`Inspection for ${selected.role}`}
            className="match-inspector"
          >
            <p className="eyebrow">Selected opportunity</p>
            <div className="match-inspector-heading">
              <div>
                <h2>{selected.role}</h2>
                <p>
                  {selected.company.name} · {selected.location}
                </p>
              </div>
              <DecisionBadge decision={selected.decision} />
            </div>
            <section className="match-decision-basis">
              <span className="metric-label">
                {recommendationHeading(selected.decision)}
              </span>
              <p>
                {selected.explanation ||
                  'Evaluated against candidate requirements'}
              </p>
            </section>
            <dl className="match-stage-list">
              <div>
                <dt>Eligibility</dt>
                <dd>
                  <EligibilityStatus state={selected.eligibility} />
                  <small>
                    {selected.eligibilityExplanation ??
                      selected.eligibilityLabel}
                  </small>
                </dd>
              </div>
              <div>
                <dt>Fit</dt>
                <dd>
                  <strong>{fitPresentation(selected)}</strong>
                  {selected.fitScore !== null && (
                    <small>{selected.fitScore} / 100</small>
                  )}
                  <small>
                    Candidate evidence compared with role requirements
                  </small>
                </dd>
              </div>
              <div>
                <dt>Quality</dt>
                <dd>
                  <strong>{selected.quality ?? 'Not evaluated'}</strong>
                  {selected.qualityScore !== null && (
                    <small>{selected.qualityScore} / 100</small>
                  )}
                  <small>
                    Source, freshness, specificity, and listing clarity
                  </small>
                </dd>
              </div>
              <div>
                <dt>Finding evidence</dt>
                <dd>
                  {selectedDetailLoaded ? (
                    <>
                      <strong>
                        {selected.evidence.length} linked evidence{' '}
                        {selected.evidence.length === 1 ? 'record' : 'records'}
                      </strong>
                      {selected.completeness !== null && (
                        <small>
                          {selected.completeness}% assessed coverage
                        </small>
                      )}
                      <small>
                        {selected.decisiveFindingIds.length > 0
                          ? `${selected.decisiveFindingIds.length} decision-linked ${selected.decisiveFindingIds.length === 1 ? 'finding' : 'findings'}`
                          : selected.eligibility === 'investigate' &&
                              selected.eligibilitySignals.length === 0
                            ? 'No finding was synthesized for the absent extractable eligibility constraint.'
                            : 'No findings are linked directly to the decision.'}
                      </small>
                    </>
                  ) : (
                    <>
                      <strong>Loading analysis…</strong>
                      <small>
                        Counts come from the current evaluation detail.
                      </small>
                    </>
                  )}
                </dd>
              </div>
            </dl>
            <div className="match-inspector-actions">
              <Link
                className="button button-primary"
                to={`/discover/${selected.id}`}
              >
                Inspect full analysis <Icon name="arrow-right" size={15} />
              </Link>
            </div>
          </aside>
        </div>
      ) : (
        <section className="workspace-empty-state">
          <p className="eyebrow">Decision queue</p>
          <h2>No matches in this category</h2>
          <p>
            Rolevia has not produced a persisted recommendation in this state.
          </p>
        </section>
      )}
    </div>
  );
}

function recommendationHeading(decision: Opportunity['decision']): string {
  if (!decision) return 'Not evaluated:';
  if (decision === 'blocked') return 'Why this job is blocked:';
  if (decision === 'investigate') return 'What needs investigation:';
  if (decision === 'low-priority') return 'Why this is lower priority:';
  return 'Why Rolevia recommends this:';
}
