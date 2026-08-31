import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isSafeHttpUrl } from '@oca/api-client';

import { useProductData } from '../../app/ProductDataProvider.js';
import { CompanyMark } from '../../components/CompanyMark.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { Timeline } from '../../components/Timeline.js';
import type {
  ApplicationDetailResponse,
  ApplicationItem,
  ApplicationStatus,
} from '../../data/types.js';

const STATUS_STAGES: readonly ApplicationStatus[] = [
  'Saved',
  'Preparing',
  'Applied',
  'Assessment',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Closed',
];

const ALLOWED_TRANSITIONS: Record<
  ApplicationStatus,
  readonly ApplicationStatus[]
> = {
  Saved: ['Preparing', 'Applied', 'Withdrawn', 'Closed'],
  Preparing: ['Applied', 'Withdrawn', 'Closed'],
  Applied: [
    'Assessment',
    'Interview',
    'Offer',
    'Rejected',
    'Withdrawn',
    'Closed',
  ],
  Assessment: ['Interview', 'Offer', 'Rejected', 'Withdrawn', 'Closed'],
  Interview: ['Offer', 'Rejected', 'Withdrawn', 'Closed'],
  Offer: ['Closed', 'Withdrawn'],
  Rejected: [],
  Withdrawn: [],
  Closed: [],
};

type FilterCategory =
  'all' | 'active' | 'preparing' | 'applied' | 'interview' | 'terminal';

export function ApplicationsPage() {
  const { snapshot, getApplications, getApplication, updateApplication } =
    useProductData();

  const [activeFilter, setActiveFilter] = useState<FilterCategory>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [applicationItems, setApplicationItems] = useState<
    readonly ApplicationItem[] | null
  >(null);
  const [applicationError, setApplicationError] = useState<string | null>(null);
  const [detailMap, setDetailMap] = useState<
    Record<string, ApplicationDetailResponse>
  >({});
  const [overrideStatuses, setOverrideStatuses] = useState<
    Record<string, ApplicationStatus>
  >({});
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void getApplications(controller.signal)
      .then((items) => {
        setApplicationItems(items);
        setApplicationError(null);
        setExpandedId((current) => current ?? items[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setApplicationError(
          error instanceof Error
            ? error.message
            : 'Applications could not be loaded.',
        );
      });
    return () => controller.abort();
  }, [getApplications]);

  useEffect(() => {
    if (!expandedId || detailMap[expandedId]) return;
    const controller = new AbortController();
    void getApplication(expandedId, controller.signal)
      .then((detail) => {
        if (detail) {
          setDetailMap((current) => ({ ...current, [expandedId]: detail }));
        } else {
          setApplicationError('Application detail was not found.');
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setApplicationError(
          error instanceof Error
            ? error.message
            : 'Application detail could not be loaded.',
        );
      });
    return () => controller.abort();
  }, [detailMap, expandedId, getApplication]);

  const applications = (applicationItems ?? []).map((app) => ({
    ...app,
    status: overrideStatuses[app.id] ?? app.status,
    nextAction:
      'nextAction' in app && typeof app.nextAction === 'string'
        ? app.nextAction
        : app.followUpDueAt
          ? 'Complete scheduled follow-up'
          : `Follow up on ${app.status.toLowerCase()} status`,
    dueDate:
      'dueDate' in app &&
      (typeof app.dueDate === 'string' || app.dueDate === null)
        ? app.dueDate
        : app.followUpDueAt,
    events: [],
  }));

  const handleStatusChange = async (
    appId: string,
    nextStatus: ApplicationStatus,
  ) => {
    const currentDetail = detailMap[appId];
    if (!currentDetail) {
      setApplicationError(
        'Application detail must load before updating status.',
      );
      return;
    }
    try {
      const updated = await updateApplication(appId, {
        status: nextStatus,
        expectedUpdatedAt: currentDetail.updatedAt,
      });
      setOverrideStatuses((prev) => ({ ...prev, [appId]: updated.status }));
      setDetailMap((prev) => ({ ...prev, [appId]: updated }));
    } catch (error) {
      setApplicationError(
        error instanceof Error
          ? error.message
          : 'The application status could not be updated.',
      );
    }
  };

  const handleSaveNote = async (appId: string) => {
    const currentDetail = detailMap[appId];
    if (!currentDetail) {
      setApplicationError('Application detail must load before saving a note.');
      return;
    }
    try {
      const updated = await updateApplication(appId, {
        note: noteText,
        expectedUpdatedAt: currentDetail.updatedAt,
      });
      setDetailMap((prev) => ({ ...prev, [appId]: updated }));
      setEditingNoteId(null);
    } catch (error) {
      setApplicationError(
        error instanceof Error
          ? error.message
          : 'The application note could not be saved.',
      );
    }
  };

  const handleExpand = (id: string) => {
    const nextId = expandedId === id ? null : id;
    setExpandedId(nextId);
  };

  const filteredApps = applications.filter((app) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'active')
      return !['Rejected', 'Withdrawn', 'Closed'].includes(app.status);
    if (activeFilter === 'preparing')
      return app.status === 'Preparing' || app.status === 'Saved';
    if (activeFilter === 'applied') return app.status === 'Applied';
    if (activeFilter === 'interview')
      return app.status === 'Interview' || app.status === 'Assessment';
    if (activeFilter === 'terminal')
      return ['Rejected', 'Withdrawn', 'Closed'].includes(app.status);
    return true;
  });

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
        {STATUS_STAGES.slice(0, 6).map((status) => {
          const count = applications.filter(
            (app) => app.status === status,
          ).length;
          return (
            <div key={status} data-active={count > 0}>
              <span>{status}</span>
              <strong>{count}</strong>
            </div>
          );
        })}
      </section>

      {applicationError && (
        <div className="session-notice" role="alert">
          Applications could not be loaded. {applicationError}
        </div>
      )}
      {!applicationError && applicationItems === null && (
        <div className="session-notice" role="status">
          Loading applications…
        </div>
      )}
      {!applicationError && applicationItems?.length === 0 && (
        <div className="session-notice" role="status">
          No applications are tracked for this candidate.
        </div>
      )}

      <div
        className="application-filter-bar"
        style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}
      >
        {(
          [
            ['all', 'All Applications'],
            ['active', 'Active Pipeline'],
            ['preparing', 'Preparing'],
            ['applied', 'Applied'],
            ['interview', 'Interview / Assessment'],
            ['terminal', 'Closed / Terminal'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`button ${activeFilter === key ? 'button-primary' : 'button-secondary'}`}
            onClick={() => setActiveFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="application-layout">
        <section
          aria-labelledby="active-applications-heading"
          className="application-list-section"
        >
          <div className="section-heading compact">
            <div>
              <h2 id="active-applications-heading">Pipeline and activity</h2>
              <p>{filteredApps.length} tracked application records</p>
            </div>
          </div>

          <div className="application-list">
            {filteredApps.map((application) => {
              const canonicalOpportunity = snapshot.opportunities.find(
                (item) => item.id === application.opportunityId,
              );
              const role = canonicalOpportunity?.role ?? application.title;
              const company = canonicalOpportunity?.company ?? {
                id: `application-${application.opportunityId}`,
                name: application.organization ?? 'Organization not stated',
                initials: (application.organization ?? 'Organization')
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase() ?? '')
                  .join(''),
                mark: 'none' as const,
                color: '#475569',
              };

              const isExpanded = expandedId === application.id;
              const detail = detailMap[application.id];
              const allowedNext = ALLOWED_TRANSITIONS[application.status] ?? [];

              return (
                <article
                  className="application-row"
                  data-expanded={isExpanded}
                  key={application.id}
                >
                  <button
                    aria-expanded={isExpanded}
                    aria-label={`${role}, ${company.name}`}
                    className="application-row-trigger"
                    onClick={() => handleExpand(application.id)}
                    type="button"
                  >
                    <CompanyMark company={company} size="small" />
                    <span className="application-role">
                      <strong>{role}</strong>
                      <small>{company.name}</small>
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
                        {application.dueDate
                          ? formatApplicationDate(application.dueDate, true)
                          : `Updated ${formatApplicationDate(application.updatedAt)}`}
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
                            <p>
                              Due{' '}
                              {formatApplicationDate(application.dueDate, true)}
                            </p>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {detail?.opportunity?.sourceUrl &&
                            isSafeHttpUrl(detail.opportunity.sourceUrl) && (
                              <a
                                className="button button-primary"
                                href={detail.opportunity.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open external application
                              </a>
                            )}
                          <Link
                            className="button button-secondary"
                            to={`/discover/${application.opportunityId}`}
                          >
                            View opportunity
                          </Link>
                        </div>
                      </div>

                      {/* State Machine Transition Actions */}
                      {allowedNext.length > 0 && (
                        <div
                          className="transition-actions"
                          style={{
                            marginBottom: '16px',
                            padding: '12px',
                            background: '#ffffff',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.85rem',
                              fontWeight: 600,
                              display: 'block',
                              marginBottom: '8px',
                              color: '#334155',
                            }}
                          >
                            Update Application Status:
                          </span>
                          <div
                            style={{
                              display: 'flex',
                              gap: '6px',
                              flexWrap: 'wrap',
                            }}
                          >
                            {allowedNext.map((nextSt) => (
                              <button
                                key={nextSt}
                                type="button"
                                className="button button-secondary button-small"
                                disabled={!detail}
                                onClick={() =>
                                  void handleStatusChange(
                                    application.id,
                                    nextSt,
                                  )
                                }
                              >
                                Move to {nextSt}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Candidate Note Section */}
                      <div
                        className="application-note-section"
                        style={{
                          marginBottom: '16px',
                          padding: '12px',
                          background: '#ffffff',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '6px',
                          }}
                        >
                          <strong
                            style={{ fontSize: '0.9rem', color: '#334155' }}
                          >
                            Candidate Notes (User Authored)
                          </strong>
                          {editingNoteId !== application.id && (
                            <button
                              type="button"
                              className="button button-quiet"
                              onClick={() => {
                                setEditingNoteId(application.id);
                                setNoteText(detail?.note ?? '');
                              }}
                            >
                              {detail?.note ? 'Edit Note' : '+ Add Note'}
                            </button>
                          )}
                        </div>

                        {editingNoteId === application.id ? (
                          <div>
                            <textarea
                              rows={3}
                              style={{
                                width: '100%',
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.9rem',
                              }}
                              value={noteText}
                              onChange={(e) => setNoteText(e.target.value)}
                              placeholder="Write private application notes here (e.g. referral contact, interview prep)..."
                            />
                            <div
                              style={{
                                display: 'flex',
                                gap: '8px',
                                marginTop: '6px',
                              }}
                            >
                              <button
                                type="button"
                                className="button button-primary"
                                onClick={() =>
                                  void handleSaveNote(application.id)
                                }
                              >
                                Save Note
                              </button>
                              <button
                                type="button"
                                className="button button-secondary"
                                onClick={() => setEditingNoteId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p
                            style={{
                              margin: 0,
                              fontSize: '0.9rem',
                              color: '#475569',
                              fontStyle: detail?.note ? 'normal' : 'italic',
                            }}
                          >
                            {detail?.note || 'No notes added yet.'}
                          </p>
                        )}
                      </div>

                      <Timeline
                        items={(detail?.events ?? application.events).map(
                          (event) => {
                            const dateStr =
                              'date' in event && typeof event.date === 'string'
                                ? event.date
                                : 'occurredAt' in event &&
                                    typeof event.occurredAt === 'string'
                                  ? new Date(
                                      event.occurredAt,
                                    ).toLocaleDateString()
                                  : 'Recently';
                            const titleStr =
                              'title' in event &&
                              typeof event.title === 'string'
                                ? event.title
                                : 'eventType' in event &&
                                    typeof event.eventType === 'string'
                                  ? event.eventType
                                      .replace(/_/g, ' ')
                                      .toUpperCase()
                                  : 'EVENT';
                            return {
                              id: event.id,
                              date: dateStr,
                              title: titleStr,
                              detail: event.detail,
                              meta: `Recorded by ${event.actor}`,
                            };
                          },
                        )}
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

function formatApplicationDate(value: string, includeTime = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    ...(includeTime ? { timeStyle: 'short' as const } : {}),
  });
}

export default ApplicationsPage;
