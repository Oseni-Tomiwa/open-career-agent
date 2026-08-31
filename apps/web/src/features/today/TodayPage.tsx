import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { CompanyMark } from '../../components/CompanyMark.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { EmptyState } from '../../components/EmptyState.js';
import { EligibilityStatus } from '../../components/Status.js';
import { OpportunitySummary } from '../opportunities/OpportunitySummary.js';
import type { TodayDashboardResponse } from '../../data/types.js';

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
      <div className="page today-page">
        <PageHeader
          description="Aggregating canonical intelligence and current candidate attention..."
          eyebrow="Loading"
          title="Overview"
        />
        <div
          className="app-loading"
          style={{ padding: '2rem', textAlign: 'center' }}
        >
          <p>Loading candidate attention dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !dashboard) {
    return (
      <div className="page today-page">
        <PageHeader
          description="Could not load candidate dashboard data."
          eyebrow="Error"
          title="Overview"
        />
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

  // Map priority opportunities to existing snapshot opportunities if available for full UI widget rendering
  const priorityOpportunities = dashboard.priorityOpportunities.map((prio) => {
    const matched = snapshot.opportunities.find(
      (o) => o.id === prio.opportunityId,
    );
    if (matched) return matched;
    return {
      id: prio.opportunityId,
      company: {
        id:
          prio.organization?.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? 'org',
        name: prio.organization ?? 'Organization',
        initials: (prio.organization ?? 'O').slice(0, 2).toUpperCase(),
        mark: 'none' as const,
        color: '#475569',
      },
      role: prio.title,
      summary: prio.explanation,
      description: [prio.explanation],
      location: prio.location ?? 'Location not stated',
      country: '',
      workModel: 'Not stated',
      remotePolicy: 'Not stated',
      compensation: null,
      employmentType: 'Not stated',
      seniority: 'Not stated',
      technologies: [],
      source: 'Recorded opportunity',
      sourceReference: prio.opportunityId,
      freshness: prio.freshnessBucket ?? 'recent',
      publishedAt: prio.observedAt,
      updatedAt: prio.observedAt,
      sponsorship: 'Unknown' as const,
      relocation: 'Unknown' as const,
      eligibility: null,
      eligibilityLabel: 'Not included in this overview projection',
      fit: null,
      fitScore: null,
      quality: null,
      qualityScore: null,
      decision: 'high-priority' as const,
      decisionLabel: 'High priority',
      decisiveFindingIds: [],
      explanation: prio.explanation,
      nextAction: prio.action === 'apply' ? 'Apply' : prio.action,
      completeness: null,
      requirements: [],
      eligibilitySignals: [],
      fitSignals: [],
      qualitySignals: [],
      evidence: [],
      history: [],
      tags: prio.reasonCodes,
    };
  });

  return (
    <div className="page today-page">
      <PageHeader
        description={dashboard.summaryText}
        eyebrow={dateFormatted}
        title={`Good afternoon, ${dashboard.greetingName}`}
        actions={
          <Link className="button button-secondary" to="/discover">
            Explore all jobs
          </Link>
        }
      />

      {/* 01: Priority Opportunities */}
      <section
        aria-labelledby="priority-heading"
        className="section-block priority-section"
      >
        <div className="section-heading">
          <div>
            <p className="section-index">01</p>
            <h2 id="priority-heading">Priority matches</h2>
            <p>Actionable roles ranked with Eligibility before Fit.</p>
          </div>
          <span className="section-count">
            {dashboard.priorityOpportunities.length} ready
          </span>
        </div>
        {priorityOpportunities.length > 0 ? (
          <div className="priority-list">
            {priorityOpportunities.map((opportunity) => (
              <OpportunitySummary
                key={opportunity.id}
                opportunity={opportunity}
              />
            ))}
          </div>
        ) : (
          <div
            className="empty-card"
            style={{
              padding: '1.5rem',
              background: 'var(--surface-color, #f8fafc)',
              borderRadius: '8px',
              color: 'var(--text-muted, #64748b)',
            }}
          >
            No high-priority matches right now. Keep discovering new jobs.
          </div>
        )}
      </section>

      {/* Today Grid */}
      <div className="today-grid">
        {/* 02: Recent Changes */}
        <section aria-labelledby="changed-heading" className="section-block">
          <div className="section-heading compact">
            <div>
              <p className="section-index">02</p>
              <h2 id="changed-heading">Since your last scan</h2>
            </div>
            <Link to="/discover?sort=freshness">View scan results</Link>
          </div>
          {dashboard.recentChanges.length > 0 ? (
            <div className="change-list">
              {dashboard.recentChanges.map((change) => (
                <Link
                  key={`${change.opportunityId}-${change.occurredAt}`}
                  to={`/discover/${change.opportunityId}`}
                >
                  <CompanyMark
                    company={{
                      id: change.organization?.toLowerCase() ?? 'org',
                      name: change.organization ?? 'Org',
                      initials: (change.organization ?? 'O').slice(0, 2),
                      mark: 'none',
                      color: '#475569',
                    }}
                    size="small"
                  />
                  <span>
                    <strong>{change.title}</strong>
                    <small>{change.organization ?? 'Organization'}</small>
                  </span>
                  <span className="change-copy">{change.headline}</span>
                  <Icon name="arrow-right" size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <p
              className="empty-copy"
              style={{ color: '#64748b', fontSize: '0.875rem' }}
            >
              No recent changes in the last {dashboard.timeWindowDays} days.
            </p>
          )}
        </section>

        {/* 03: Needs Attention / Investigation */}
        <section
          aria-labelledby="investigation-heading"
          className="section-block investigation-section"
        >
          <div className="section-heading compact">
            <div>
              <p className="section-index">03</p>
              <h2 id="investigation-heading">Needs investigation</h2>
            </div>
            <span className="section-count">Recommendation-relevant items</span>
          </div>
          {dashboard.needsAttention.length > 0 ? (
            <ul className="investigation-list">
              {dashboard.needsAttention.map((item) => (
                <li key={`${item.opportunityId}-${item.category}`}>
                  <Icon
                    name={
                      item.category === 'blocked_closed' ? 'blocker' : 'unknown'
                    }
                  />
                  <div>
                    <Link to={`/discover/${item.opportunityId}`}>
                      {item.title} · {item.organization ?? 'Organization'}
                    </Link>
                    <p>{item.explanation}</p>
                    <small>{item.nextAction}</small>
                  </div>
                  <EligibilityStatus
                    state={
                      item.eligibilityState === 'eligible' ||
                      item.eligibilityState === 'ineligible' ||
                      item.eligibilityState === 'investigate'
                        ? item.eligibilityState
                        : 'unknown'
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p
              className="empty-copy"
              style={{ color: '#64748b', fontSize: '0.875rem' }}
            >
              All current jobs are clear.
            </p>
          )}
        </section>
      </div>

      {/* Today Lower Grid */}
      <div className="today-grid lower-grid">
        {/* 04: Application Activity */}
        <section aria-labelledby="activity-heading" className="section-block">
          <div className="section-heading compact">
            <div>
              <p className="section-index">04</p>
              <h2 id="activity-heading">Application activity</h2>
            </div>
            <Link to="/applications">Open pipeline</Link>
          </div>
          {dashboard.applicationActivity.length > 0 ? (
            <div className="application-briefs">
              {dashboard.applicationActivity.map((app) => (
                <div key={`${app.opportunityId}-${app.status}`}>
                  <span
                    className="application-status-dot"
                    data-status={app.status}
                  />
                  <div>
                    <strong>{app.status.replace('_', ' ')}</strong>
                    <span>
                      {app.title} · {app.organization ?? 'Organization'}
                    </span>
                    <small>{app.nextAction}</small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p
              className="empty-copy"
              style={{ color: '#64748b', fontSize: '0.875rem' }}
            >
              No active applications.
            </p>
          )}
        </section>

        {/* 05: Career Memory Attention */}
        <section
          aria-labelledby="signals-heading"
          className="section-block career-signals"
        >
          <div className="section-heading compact">
            <div>
              <p className="section-index">05</p>
              <h2 id="signals-heading">Career Profile attention</h2>
            </div>
            <Link to="/settings">Review Career Profile</Link>
          </div>
          {dashboard.careerMemoryAttention.length > 0 ? (
            <div className="memory-attention-list">
              {dashboard.careerMemoryAttention.map((item) => (
                <div key={item.claimKind} style={{ marginBottom: '1rem' }}>
                  <strong>{item.headline}</strong>
                  <p
                    style={{
                      fontSize: '0.875rem',
                      color: '#475569',
                      margin: '0.25rem 0',
                    }}
                  >
                    {item.explanation}
                  </p>
                  <Link
                    to="/profile"
                    style={{ fontSize: '0.8125rem', color: '#2563eb' }}
                  >
                    Provide evidence in Profile →
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p
              className="empty-copy"
              style={{ color: '#64748b', fontSize: '0.875rem' }}
            >
              Your Career Profile is up to date and all evidence questions are
              resolved.
            </p>
          )}
        </section>
      </div>

      {/* 06: Discovery Activity */}
      {dashboard.discoveryActivity.length > 0 && (
        <section
          aria-labelledby="discovery-activity-heading"
          className="section-block"
          style={{ marginTop: '2rem' }}
        >
          <div className="section-heading compact">
            <div>
              <p className="section-index">06</p>
              <h2 id="discovery-activity-heading">Discovery activity</h2>
            </div>
            <Link to="/search">Manage discovery targets</Link>
          </div>
          <div
            className="discovery-activity-list"
            style={{ display: 'grid', gap: '0.75rem' }}
          >
            {dashboard.discoveryActivity.map((run) => (
              <div
                key={run.runId}
                style={{
                  padding: '0.75rem 1rem',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.875rem',
                }}
              >
                <div>
                  <strong>{run.searchTargetName}</strong> ({run.sourceSystem})
                  <span
                    style={{
                      marginLeft: '0.5rem',
                      fontSize: '0.75rem',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background:
                        run.status === 'COMPLETED' ? '#dcfce7' : '#fee2e2',
                      color: run.status === 'COMPLETED' ? '#166534' : '#991b1b',
                    }}
                  >
                    {run.status}
                  </span>
                </div>
                <div style={{ color: '#64748b', fontSize: '0.8125rem' }}>
                  {run.acceptedCount} accepted · {run.rejectedCount} rejected ·{' '}
                  {new Date(run.startedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default TodayPage;
