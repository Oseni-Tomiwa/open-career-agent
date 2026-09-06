import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { CompanyMark } from '../../components/CompanyMark.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Icon } from '../../components/Icon.js';
import {
  DecisionBadge,
  DiscoveryRunStatus,
  EligibilityStatus,
} from '../../components/Status.js';
import { WorkspaceSectionHeader } from '../../components/WorkspaceSection.js';
import type {
  Decision,
  EligibilityState,
  TodayDashboardResponse,
} from '../../data/types.js';

function eligibilityState(value: string | null): EligibilityState {
  return value === 'eligible' ||
    value === 'ineligible' ||
    value === 'investigate' ||
    value === 'unknown'
    ? value
    : 'unknown';
}

function decisionState(value: string | null): Decision | null {
  return value === 'high-priority' ||
    value === 'consider' ||
    value === 'investigate' ||
    value === 'low-priority' ||
    value === 'blocked'
    ? value
    : null;
}

export function TodayPage() {
  const { getTodayDashboard, snapshot } = useProductData();
  const [dashboard, setDashboard] = useState<TodayDashboardResponse | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    getTodayDashboard(7, controller.signal)
      .then((data) => {
        if (active) {
          setDashboard(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active && !(err instanceof Error && err.name === 'AbortError')) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load Overview dashboard',
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [getTodayDashboard]);

  if (loading) {
    return (
      <div className="page today-page" role="status">
        <p className="eyebrow">Overview</p>
        <h1 className="workspace-page-title">Preparing today’s brief…</h1>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="page today-page">
        <EmptyState
          description={error ?? 'Overview dashboard is currently unavailable.'}
          title="Error loading dashboard"
        />
      </div>
    );
  }

  const dateFormatted = new Date(dashboard.generatedAt).toLocaleDateString(
    'en-US',
    {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    },
  );
  const priorities = dashboard.priorityOpportunities.map((item) => ({
    item,
    opportunity: snapshot.opportunities.find(
      (candidate) => candidate.id === item.opportunityId,
    ),
  }));
  const attentionCount =
    dashboard.priorityOpportunities.length + dashboard.needsAttention.length;

  return (
    <div className="page today-page">
      <header className="workspace-page-header">
        <div>
          <p className="eyebrow">{dateFormatted}</p>
          <h1 className="workspace-page-title">Today</h1>
          <p className="workspace-page-summary">
            Good afternoon, {dashboard.greetingName}. {dashboard.summaryText}
          </p>
        </div>
        <Link className="button button-secondary" to="/discover">
          Explore all jobs <Icon name="arrow-right" size={16} />
        </Link>
      </header>

      <div className="today-command-grid">
        <section
          className="attention-board"
          aria-labelledby="attention-heading"
        >
          <WorkspaceSectionHeader
            id="attention-heading"
            title="What deserves attention"
            description="Decisions and unknowns with a concrete next step. Eligibility remains the first gate."
            meta={`${attentionCount} items in the current brief`}
          />
          <div className="attention-ledger">
            {priorities.map(({ item, opportunity }) => (
              <article className="attention-row" key={item.opportunityId}>
                <div className="attention-row-identity">
                  {opportunity ? (
                    <CompanyMark company={opportunity.company} size="small" />
                  ) : (
                    <span className="attention-row-mark" aria-hidden="true">
                      {(item.organization ?? 'O').slice(0, 1)}
                    </span>
                  )}
                  <div>
                    <span>{item.organization ?? 'Organization'}</span>
                    <h3>
                      <Link to={`/discover/${item.opportunityId}`}>
                        {item.title}
                      </Link>
                    </h3>
                    <small>{item.location ?? 'Location not stated'}</small>
                  </div>
                </div>
                <div className="attention-row-state">
                  <DecisionBadge decision="high-priority" />
                  <EligibilityStatus state={opportunity?.eligibility ?? null} />
                </div>
                <p>{item.explanation}</p>
                <Link
                  className="attention-row-action"
                  to={`/discover/${item.opportunityId}`}
                >
                  <span>{item.action}</span>
                  <Icon name="arrow-right" size={16} />
                </Link>
              </article>
            ))}
            {dashboard.needsAttention.map((item) => (
              <article
                className="attention-row attention-row-unknown"
                key={`${item.opportunityId}-${item.category}`}
              >
                <div className="attention-row-identity">
                  <span className="attention-row-mark" aria-hidden="true">
                    <Icon name="unknown" size={16} />
                  </span>
                  <div>
                    <span>{item.organization ?? 'Organization'}</span>
                    <h3>
                      <Link to={`/discover/${item.opportunityId}`}>
                        {item.title}
                      </Link>
                    </h3>
                    <small>Eligibility remains unresolved</small>
                  </div>
                </div>
                <div className="attention-row-state">
                  <DecisionBadge decision={decisionState(item.decisionState)} />
                  <EligibilityStatus
                    state={eligibilityState(item.eligibilityState)}
                  />
                </div>
                <p>{item.explanation}</p>
                <Link
                  className="attention-row-action"
                  to={`/discover/${item.opportunityId}`}
                >
                  <span>{item.nextAction}</span>
                  <Icon name="arrow-right" size={16} />
                </Link>
              </article>
            ))}
            {attentionCount === 0 && (
              <p className="ledger-empty">
                Nothing currently needs a decision. New findings will appear
                here when the evidence changes.
              </p>
            )}
          </div>
        </section>

        <aside className="today-brief" aria-label="Current workspace brief">
          <WorkspaceSectionHeader
            title="Brief status"
            description="A factual snapshot, not a performance score."
            meta="Current workspace"
          />
          <dl className="brief-register">
            <div>
              <dt>High priority</dt>
              <dd>
                <strong>{dashboard.priorityOpportunities.length}</strong>
                <small>Ready for candidate review</small>
              </dd>
            </div>
            <div>
              <dt>Needs investigation</dt>
              <dd>
                <strong>{dashboard.needsAttention.length}</strong>
                <small>Unknowns or blockers to resolve</small>
              </dd>
            </div>
            <div>
              <dt>Changed in {dashboard.timeWindowDays} days</dt>
              <dd>
                <strong>{dashboard.recentChanges.length}</strong>
                <small>New or materially updated records</small>
              </dd>
            </div>
          </dl>
          <p className="brief-principle">
            <Icon name="evidence" size={17} /> Recommendations use recorded
            evidence. Missing evidence is never treated as a confirmed negative.
          </p>
        </aside>
      </div>

      <div className="today-workspace-grid">
        <section className="workspace-ledger" aria-labelledby="changes-heading">
          <WorkspaceSectionHeader
            id="changes-heading"
            title="What changed"
            description={`Opportunity changes observed during the last ${dashboard.timeWindowDays} days.`}
            meta="Discovery"
            action={
              <Link to="/discover?sort=freshness">View scan results</Link>
            }
          />
          <div className="change-register">
            {dashboard.recentChanges.map((change) => (
              <Link
                className="change-register-row"
                key={`${change.opportunityId}-${change.occurredAt}`}
                to={`/discover/${change.opportunityId}`}
              >
                <time dateTime={change.occurredAt}>
                  {new Date(change.occurredAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </time>
                <span>
                  <strong>{change.title}</strong>
                  <small>{change.organization ?? 'Organization'}</small>
                </span>
                <p>{change.headline}</p>
                <Icon name="arrow-right" size={16} />
              </Link>
            ))}
            {dashboard.recentChanges.length === 0 && (
              <p className="ledger-empty">
                No opportunity changes were recorded in this window.
              </p>
            )}
          </div>
        </section>

        <div className="today-secondary-stack">
          <section
            className="workspace-ledger"
            aria-label="Career Profile signals"
          >
            <WorkspaceSectionHeader
              title="Career Profile signals"
              description="Claims that could change an opportunity decision."
              meta="Evidence health"
              action={<Link to="/settings">Review profile</Link>}
            />
            {dashboard.careerMemoryAttention.length > 0 ? (
              <ul className="signal-register">
                {dashboard.careerMemoryAttention.map((item) => (
                  <li key={item.claimKind}>
                    <Icon name="warning" size={17} />
                    <div>
                      <strong>{item.headline}</strong>
                      <p>{item.explanation}</p>
                      <small>
                        Affects {item.affectedOpportunityCount} opportunities
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ledger-empty ledger-empty-confirmed">
                <Icon name="check" size={17} /> No unresolved Career Profile
                evidence questions are in this brief.
              </p>
            )}
          </section>

          <section
            className="workspace-ledger"
            aria-label="Application pipeline"
          >
            <WorkspaceSectionHeader
              title="Application pipeline"
              description="Candidate-recorded activity only."
              meta="In progress"
              action={<Link to="/applications">Open pipeline</Link>}
            />
            {dashboard.applicationActivity.length > 0 ? (
              <ul className="activity-register">
                {dashboard.applicationActivity.map((item) => (
                  <li key={`${item.opportunityId}-${item.status}`}>
                    <span
                      className="application-status-dot"
                      data-status={item.status}
                    />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.nextAction}</p>
                    </div>
                    <span>{item.status.replace('_', ' ')}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ledger-empty">
                No application activity is present in the current dashboard
                response.
              </p>
            )}
          </section>

          <section className="workspace-ledger" aria-label="System activity">
            <WorkspaceSectionHeader
              title="System activity"
              description="Recent discovery work, shown as an audit trail."
              meta="Processing"
              action={<Link to="/activity">View activity</Link>}
            />
            {dashboard.discoveryActivity.length > 0 ? (
              <ul className="activity-register system-register">
                {dashboard.discoveryActivity.map((run) => (
                  <li key={run.runId}>
                    <Icon name="source" size={17} />
                    <div>
                      <strong>{run.searchTargetName}</strong>
                      <p>{run.sourceSystem}</p>
                    </div>
                    <DiscoveryRunStatus status={run.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ledger-empty">
                No discovery runs are included in the current dashboard
                response.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default TodayPage;
