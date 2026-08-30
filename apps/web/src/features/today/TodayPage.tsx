import { Link } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { CompanyMark } from '../../components/CompanyMark.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { EmptyState } from '../../components/EmptyState.js';
import { EligibilityStatus } from '../../components/Status.js';
import { OpportunitySummary } from '../opportunities/OpportunitySummary.js';

export function TodayPage() {
  const { dataSource, snapshot } = useProductData();
  if (dataSource === 'api') {
    return (
      <div className="page today-page">
        <PageHeader
          description="Today aggregation is not connected to canonical API intelligence in Phase 1."
          eyebrow="Development mode"
          title="Today"
        />
        <EmptyState
          description="Use Opportunities for API-backed list and detail data. Today remains intentionally unavailable in API mode."
          title="Not available in API mode yet"
        />
      </div>
    );
  }
  const priorities = snapshot.opportunities
    .filter((opportunity) => opportunity.decision === 'high-priority')
    .slice(0, 3);
  const investigations = snapshot.opportunities
    .filter(
      (opportunity) =>
        opportunity.decision === 'investigate' ||
        opportunity.eligibility === 'unknown',
    )
    .slice(0, 4);
  const changed = snapshot.opportunities.filter(
    (opportunity) => opportunity.changed || opportunity.isNew,
  );
  const activeApplications = snapshot.applications.filter((application) =>
    ['Preparing', 'Assessment', 'Interview', 'Offer'].includes(
      application.status,
    ),
  );

  return (
    <div className="page today-page">
      <PageHeader
        description="Two opportunities are ready for action, while three questions could materially change your shortlist."
        eyebrow="Saturday · 29 August"
        title={`Good afternoon, ${snapshot.profile.name.split(' ')[0]}`}
        actions={
          <Link className="button button-secondary" to="/opportunities">
            Explore all opportunities
          </Link>
        }
      />

      <section
        aria-labelledby="priority-heading"
        className="section-block priority-section"
      >
        <div className="section-heading">
          <div>
            <p className="section-index">01</p>
            <h2 id="priority-heading">Priority opportunities</h2>
            <p>Actionable roles ranked with Eligibility before Fit.</p>
          </div>
          <span className="section-count">{priorities.length} ready</span>
        </div>
        <div className="priority-list">
          {priorities.map((opportunity) => (
            <OpportunitySummary
              key={opportunity.id}
              opportunity={opportunity}
            />
          ))}
        </div>
      </section>

      <div className="today-grid">
        <section aria-labelledby="changed-heading" className="section-block">
          <div className="section-heading compact">
            <div>
              <p className="section-index">02</p>
              <h2 id="changed-heading">Since your last scan</h2>
            </div>
            <Link to="/opportunities?sort=freshness">View scan results</Link>
          </div>
          <div className="change-list">
            {changed.map((opportunity) => (
              <Link
                key={opportunity.id}
                to={`/opportunities/${opportunity.id}`}
              >
                <CompanyMark company={opportunity.company} size="small" />
                <span>
                  <strong>{opportunity.role}</strong>
                  <small>{opportunity.company.name}</small>
                </span>
                <span className="change-copy">
                  {opportunity.changed ?? 'New opportunity'}
                </span>
                <Icon name="arrow-right" size={16} />
              </Link>
            ))}
          </div>
        </section>

        <section
          aria-labelledby="investigation-heading"
          className="section-block investigation-section"
        >
          <div className="section-heading compact">
            <div>
              <p className="section-index">03</p>
              <h2 id="investigation-heading">Needs investigation</h2>
            </div>
            <span className="section-count">Decision-relevant unknowns</span>
          </div>
          <ul className="investigation-list">
            {investigations.map((opportunity) => (
              <li key={opportunity.id}>
                <Icon name="unknown" />
                <div>
                  <Link to={`/opportunities/${opportunity.id}`}>
                    {opportunity.role} · {opportunity.company.name}
                  </Link>
                  <p>{opportunity.eligibilityLabel}</p>
                  <small>{opportunity.nextAction}</small>
                </div>
                <EligibilityStatus state={opportunity.eligibility} />
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="today-grid lower-grid">
        <section aria-labelledby="activity-heading" className="section-block">
          <div className="section-heading compact">
            <div>
              <p className="section-index">04</p>
              <h2 id="activity-heading">Application activity</h2>
            </div>
            <Link to="/applications">Open pipeline</Link>
          </div>
          <div className="application-briefs">
            {activeApplications.map((application) => {
              const opportunity = snapshot.opportunities.find(
                (item) => item.id === application.opportunityId,
              );
              if (!opportunity) return null;
              return (
                <div key={application.id}>
                  <span
                    className="application-status-dot"
                    data-status={application.status}
                  />
                  <div>
                    <strong>{application.status}</strong>
                    <span>
                      {opportunity.role} · {opportunity.company.name}
                    </span>
                    <small>
                      {application.nextAction}
                      {application.dueDate ? ` · ${application.dueDate}` : ''}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section
          aria-labelledby="signals-heading"
          className="section-block career-signals"
        >
          <div className="section-heading compact">
            <div>
              <p className="section-index">05</p>
              <h2 id="signals-heading">Career signals</h2>
            </div>
            <Link to="/profile">Review Career Memory</Link>
          </div>
          <p className="chart-summary">
            Infrastructure depth is the most frequent supported gap across your
            current shortlist. Kubernetes appears in four roles, but Career
            Memory has no direct evidence for it.
          </p>
          <div
            aria-label="Recurring skill gaps: Kubernetes in 4 opportunities, Go in 3, data visualization in 2, healthcare domain in 2"
            className="skill-gap-chart"
            role="img"
          >
            {[
              ['Kubernetes', 4],
              ['Go', 3],
              ['Data visualization', 2],
              ['Healthcare domain', 2],
            ].map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <span className="gap-bar">
                  <span style={{ width: `${Number(value) * 22}%` }} />
                </span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

export default TodayPage;
