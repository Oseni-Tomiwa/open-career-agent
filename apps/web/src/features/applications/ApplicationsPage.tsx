import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { CompanyMark } from '../../components/CompanyMark.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Timeline } from '../../components/Timeline.js';
import type { ApplicationStatus } from '../../data/types.js';

const statusOrder: readonly ApplicationStatus[] = [
  'Preparing',
  'Applied',
  'Assessment',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
];

export function ApplicationsPage() {
  const { snapshot } = useProductData();
  const [expanded, setExpanded] = useState<string | null>(
    snapshot.applications[0]?.id ?? null,
  );

  return (
    <div className="page applications-page">
      <PageHeader
        description="Track what happened, what comes next, and who asserted each event. Preparing materials never implies submission."
        eyebrow="Candidate-controlled history"
        title="Applications"
      />

      <section
        aria-label="Application pipeline summary"
        className="pipeline-summary"
      >
        {statusOrder.slice(0, 6).map((status) => {
          const count = snapshot.applications.filter(
            (application) => application.status === status,
          ).length;
          return (
            <div key={status} data-active={count > 0}>
              <span>{status}</span>
              <strong>{count}</strong>
            </div>
          );
        })}
      </section>

      <div className="application-layout">
        <section
          aria-labelledby="active-applications-heading"
          className="application-list-section"
        >
          <div className="section-heading compact">
            <div>
              <h2 id="active-applications-heading">Pipeline and activity</h2>
              <p>{snapshot.applications.length} tracked application records</p>
            </div>
          </div>
          <div className="application-list">
            {snapshot.applications.map((application) => {
              const opportunity = snapshot.opportunities.find(
                (item) => item.id === application.opportunityId,
              );
              if (!opportunity) return null;
              const isExpanded = expanded === application.id;
              return (
                <article
                  className="application-row"
                  data-expanded={isExpanded}
                  key={application.id}
                >
                  <button
                    aria-expanded={isExpanded}
                    className="application-row-trigger"
                    onClick={() =>
                      setExpanded(isExpanded ? null : application.id)
                    }
                    type="button"
                  >
                    <CompanyMark company={opportunity.company} size="small" />
                    <span className="application-role">
                      <strong>{opportunity.role}</strong>
                      <small>{opportunity.company.name}</small>
                    </span>
                    <span
                      className="application-stage"
                      data-status={application.status}
                    >
                      {application.status}
                    </span>
                    <span className="application-next">
                      <strong>{application.nextAction}</strong>
                      <small>
                        {application.dueDate ??
                          `Updated ${application.updatedAt}`}
                      </small>
                    </span>
                    <Icon name="chevron-down" size={17} />
                  </button>
                  {isExpanded && (
                    <div className="application-detail">
                      <div className="application-detail-heading">
                        <div>
                          <span className="metric-label">
                            Current next action
                          </span>
                          <h3>{application.nextAction}</h3>
                          {application.dueDate && (
                            <p>Due {application.dueDate}</p>
                          )}
                        </div>
                        <Link
                          className="button button-secondary"
                          to={`/opportunities/${opportunity.id}`}
                        >
                          View opportunity
                        </Link>
                      </div>
                      <Timeline
                        items={application.events.map((event) => ({
                          ...event,
                          meta: `Recorded by ${event.actor}`,
                        }))}
                      />
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <aside className="application-principle">
          <Icon name="evidence" />
          <h2>Submission remains human-authorized</h2>
          <p>
            Drafted or prepared materials do not move an application to Applied.
            The timeline identifies Candidate, Employer, and System events
            separately.
          </p>
        </aside>
      </div>
    </div>
  );
}

export default ApplicationsPage;
