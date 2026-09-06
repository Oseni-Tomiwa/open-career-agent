import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { CompanyMark } from '../../components/CompanyMark.js';
import { Icon } from '../../components/Icon.js';
import {
  DecisionBadge,
  EligibilityStatus,
  EvidenceStateLabel,
} from '../../components/Status.js';
import { Timeline } from '../../components/Timeline.js';
import { WorkspaceSectionHeader } from '../../components/WorkspaceSection.js';
import type {
  EvaluationSignal,
  FitSignal,
  Opportunity,
  QualitySignal,
} from '../../data/types.js';
import { NotFoundPage } from '../NotFoundPage.js';

type DetailTab =
  'overview' | 'eligibility' | 'fit' | 'quality' | 'evidence' | 'history';

const tabs: readonly { readonly value: DetailTab; readonly label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'eligibility', label: 'Eligibility' },
  { value: 'fit', label: 'Fit' },
  { value: 'quality', label: 'Quality' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'history', label: 'History' },
];

export function OpportunityDetailPage() {
  const { opportunityId } = useParams();
  const {
    dataSource,
    snapshot,
    loadOpportunity,
    updateDecision,
    createApplication,
    getApplications,
  } = useProductData();
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [appStatus, setAppStatus] = useState<string | null>(null);
  const [applicationLookupState, setApplicationLookupState] = useState<{
    readonly opportunityId: string;
    readonly status: 'ready' | 'error';
  } | null>(null);
  const [loadedState, setLoadedState] = useState<{
    readonly opportunityId: string;
    readonly status: 'ready' | 'missing' | 'error';
    readonly error: string | null;
  } | null>(null);
  const opportunity = snapshot.opportunities.find(
    (item) => item.id === opportunityId,
  );
  const currentLoadedState =
    loadedState?.opportunityId === opportunityId ? loadedState : null;
  const detailStatus = !opportunityId
    ? 'missing'
    : (currentLoadedState?.status ?? 'loading');
  const detailError = currentLoadedState?.error ?? null;
  const applicationLookup =
    applicationLookupState &&
    applicationLookupState.opportunityId === opportunityId
      ? applicationLookupState.status
      : 'loading';

  useEffect(() => {
    if (!opportunityId) return;
    const controller = new AbortController();
    void loadOpportunity(opportunityId, controller.signal)
      .then((value) =>
        setLoadedState({
          opportunityId,
          status: value ? 'ready' : 'missing',
          error: null,
        }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadedState({
          opportunityId,
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'Opportunity detail failed to load.',
        });
      });
    return () => controller.abort();
  }, [loadOpportunity, opportunityId]);

  useEffect(() => {
    if (!opportunityId) return;
    const controller = new AbortController();
    void getApplications(controller.signal)
      .then((apps) => {
        const found = apps.find((a) => a.opportunityId === opportunityId);
        setAppStatus(found?.status ?? null);
        setApplicationLookupState({ opportunityId, status: 'ready' });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setApplicationLookupState({ opportunityId, status: 'error' });
        }
      });
    return () => controller.abort();
  }, [getApplications, opportunityId]);

  const handleCreateApp = async (status: 'Saved' | 'Preparing' | 'Applied') => {
    if (!opportunityId) return;
    try {
      const res = await createApplication({
        opportunityId,
        status,
      });
      setAppStatus(res.status);
      setApplicationLookupState({ opportunityId, status: 'ready' });
      setActionNotice(`Application tracked with status '${res.status}'.`);
    } catch (err: unknown) {
      setActionNotice(
        err instanceof Error
          ? err.message
          : 'Could not create application tracking record.',
      );
    }
  };

  if (detailStatus === 'loading') {
    return (
      <div className="page" role="status">
        Loading opportunity analysis…
      </div>
    );
  }

  if (detailStatus === 'error') {
    return (
      <div className="page" role="alert">
        <h1>Opportunity analysis could not be loaded</h1>
        <p>{detailError}</p>
        <Link to="/discover">Back to Discover Jobs</Link>
      </div>
    );
  }

  if (detailStatus === 'missing' || !opportunity) {
    return (
      <NotFoundPage
        description={
          dataSource === 'api'
            ? 'That opportunity is not available from the API. It may have been removed or the link may be incorrect.'
            : 'That opportunity is not present in the fictional development dataset. It may have been removed or the link may be incorrect.'
        }
        title="Opportunity not found"
      />
    );
  }

  const opportunityIdForAction = opportunity.id;

  async function act(
    decision: 'consider' | 'investigate' | 'low-priority',
    label: string,
  ) {
    await updateDecision(opportunityIdForAction, decision);
    setActionNotice(
      `${label} for this development session. No API mutation was sent.`,
    );
  }

  return (
    <div className="page opportunity-detail-page">
      <Link className="back-link" to="/discover">
        <Icon name="arrow-left" size={16} /> Back to Discover Jobs
      </Link>

      <header className="detail-header detail-header-v2">
        <div className="detail-identity">
          <CompanyMark company={opportunity.company} size="large" />
          <div>
            <p className="eyebrow">{opportunity.company.name}</p>
            <h1>{opportunity.role}</h1>
            <div className="opportunity-meta">
              <span>
                <Icon name="location" size={15} />
                {opportunity.location}
              </span>
              <span>
                <Icon name="briefcase" size={15} />
                {opportunity.workModel}
              </span>
              <span>
                <Icon name="source" size={15} />
                {opportunity.source}
              </span>
              <span>
                <Icon name="clock" size={15} />
                {opportunity.freshness}
              </span>
            </div>
          </div>
        </div>
        <div className="detail-provenance-summary">
          <span className="metric-label">Source record</span>
          <strong>{opportunity.source}</strong>
          <small>{opportunity.sourceReference}</small>
        </div>
      </header>
      {actionNotice && (
        <p aria-live="polite" className="session-notice detail-notice">
          {actionNotice}
        </p>
      )}

      <div className="detail-workbench">
        <section
          className="detail-intelligence"
          aria-labelledby="decision-summary-heading"
        >
          <section className="decision-brief">
            <p className="metric-label">Decision</p>
            <div className="decision-brief-heading">
              <DecisionBadge decision={opportunity.decision} />
              <h2 id="decision-summary-heading">{opportunity.decisionLabel}</h2>
            </div>
            <p className="decision-reason">{opportunity.explanation}</p>
            <div className="recommended-next-step">
              <span>Recommended next step</span>
              <strong>
                <Icon name="arrow-right" size={16} /> {opportunity.nextAction}
              </strong>
            </div>
          </section>

          <section
            className="intelligence-ledger"
            aria-labelledby="intelligence-heading"
          >
            <WorkspaceSectionHeader
              id="intelligence-heading"
              title="Decision path"
              description="Four separate judgments. No blended match score."
              meta="Eligibility → Fit → Quality → Decision"
            />
            <div>
              <button
                aria-label={`Inspect Eligibility: ${opportunity.eligibility ?? 'not evaluated'}`}
                className="intelligence-stage"
                onClick={() => setActiveTab('eligibility')}
                type="button"
              >
                <span className="stage-index">01</span>
                <span>
                  <strong>Eligibility</strong>
                  <small>Hard constraints first</small>
                </span>
                <EligibilityStatus state={opportunity.eligibility} />
                <p>
                  {opportunity.eligibilityExplanation ??
                    opportunity.eligibilityLabel}
                </p>
                <Icon name="arrow-right" size={16} />
              </button>
              <button
                aria-label={`Inspect Fit: ${opportunity.fit ?? 'not evaluated'}`}
                className="intelligence-stage"
                onClick={() => setActiveTab('fit')}
                type="button"
              >
                <span className="stage-index">02</span>
                <span>
                  <strong>Fit</strong>
                  <small>Candidate evidence alignment</small>
                </span>
                <strong className="stage-value">
                  <span>{opportunity.fit ?? 'Not evaluated'}</span>
                  {opportunity.fitScore !== null && (
                    <small>{opportunity.fitScore} / 100</small>
                  )}
                </strong>
                <p>
                  {opportunity.fitSignals[0]?.summary ??
                    opportunity.fitExplanation ??
                    'Fit has not been evaluated.'}
                </p>
                <Icon name="arrow-right" size={16} />
              </button>
              <button
                aria-label={`Inspect Quality: ${opportunity.quality ?? 'not evaluated'}`}
                className="intelligence-stage"
                onClick={() => setActiveTab('quality')}
                type="button"
              >
                <span className="stage-index">03</span>
                <span>
                  <strong>Quality</strong>
                  <small>Opportunity integrity</small>
                </span>
                <strong className="stage-value">
                  <span>{opportunity.quality ?? 'Not evaluated'}</span>
                  {opportunity.qualityScore !== null && (
                    <small>{opportunity.qualityScore} / 100</small>
                  )}
                </strong>
                <p>
                  {opportunity.qualitySignals[0]?.summary ??
                    'No Quality findings are recorded.'}
                </p>
                <Icon name="arrow-right" size={16} />
              </button>
              <button
                aria-label={`Inspect finding evidence: ${opportunity.evidence.length} linked records`}
                className="intelligence-stage"
                onClick={() => setActiveTab('evidence')}
                type="button"
              >
                <span className="stage-index">04</span>
                <span>
                  <strong>Finding evidence</strong>
                  <small>Linked records and unknowns</small>
                </span>
                <strong className="stage-value">
                  <span>{opportunity.evidence.length} linked records</span>
                  {opportunity.completeness !== null && (
                    <small>{opportunity.completeness}% complete</small>
                  )}
                </strong>
                <p>
                  {opportunity.completeness === null
                    ? 'Evidence coverage has not been assessed.'
                    : opportunity.completeness < 75
                      ? 'Material information is still missing.'
                      : 'Coverage is adequate for the current recommendation.'}
                </p>
                <Icon name="arrow-right" size={16} />
              </button>
            </div>
          </section>

          {opportunity.eligibility === 'ineligible' && (
            <div className="blocker-banner" role="note">
              <Icon name="blocker" />
              <div>
                <strong>Confirmed Eligibility blocker</strong>
                <p>
                  {opportunity.eligibilityLabel}. Strong Fit does not override
                  this requirement.
                </p>
              </div>
            </div>
          )}
          {(opportunity.eligibility === 'investigate' ||
            opportunity.eligibility === 'unknown') && (
            <div className="unknown-banner" role="note">
              <Icon name="unknown" />
              <div>
                <strong>This is unknown, not a negative answer</strong>
                <p>{opportunity.nextAction}</p>
              </div>
            </div>
          )}
        </section>

        <aside
          className="detail-action-rail"
          aria-label="Opportunity actions and source facts"
        >
          <section>
            <p className="metric-label">Candidate control</p>
            <h2>Next action</h2>
            <div className="detail-actions">
              {applicationLookup === 'loading' ? (
                <span className="session-notice" role="status">
                  Checking application tracking…
                </span>
              ) : applicationLookup === 'error' ? (
                <span className="session-notice" role="alert">
                  Application tracking could not be loaded. No local fallback
                  was used.
                </span>
              ) : appStatus ? (
                <div className="tracked-application">
                  <span className="application-stage" data-status={appStatus}>
                    Tracked: {appStatus}
                  </span>
                  <Link className="button button-secondary" to="/applications">
                    View in Applications
                  </Link>
                </div>
              ) : (
                <div className="untracked-actions">
                  <button
                    className="button button-secondary"
                    onClick={() => void handleCreateApp('Saved')}
                    type="button"
                  >
                    Save opportunity
                  </button>
                  <button
                    className="button button-primary"
                    onClick={() => void handleCreateApp('Preparing')}
                    type="button"
                  >
                    Start application
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => void handleCreateApp('Applied')}
                    type="button"
                  >
                    Mark as applied
                  </button>
                </div>
              )}
              <button
                className="button button-secondary"
                aria-label="Review evidence for this opportunity"
                onClick={() => setActiveTab('evidence')}
                type="button"
              >
                Review evidence
              </button>
              {opportunity.decision !== 'investigate' && (
                <button
                  className="button button-secondary"
                  onClick={() => {
                    void act('investigate', 'Marked for evidence review');
                  }}
                  type="button"
                >
                  Mark for evidence review
                </button>
              )}
              <button
                className="button button-quiet"
                onClick={() => {
                  void act('consider', 'Shortlisted');
                }}
                type="button"
              >
                Shortlist
              </button>
            </div>
          </section>
          <section className="source-register">
            <p className="metric-label">Opportunity record</p>
            <dl>
              <div>
                <dt>Compensation</dt>
                <dd>{opportunity.compensation ?? 'Not stated'}</dd>
              </div>
              <div>
                <dt>Employment</dt>
                <dd>{opportunity.employmentType}</dd>
              </div>
              <div>
                <dt>Remote policy</dt>
                <dd>{opportunity.remotePolicy}</dd>
              </div>
              <div>
                <dt>Sponsorship</dt>
                <dd>{opportunity.sponsorship}</dd>
              </div>
              <div>
                <dt>Observed</dt>
                <dd>{opportunity.freshness}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      <WorkspaceSectionHeader
        title="Inspect the reasoning"
        description="Move between the role record, findings, evidence, and retained history."
        meta="Analysis record"
      />
      <div
        className="detail-tabs"
        role="tablist"
        aria-label="Opportunity analysis sections"
      >
        {tabs.map((tab) => (
          <button
            aria-controls={`panel-${tab.value}`}
            aria-selected={activeTab === tab.value}
            id={`tab-${tab.value}`}
            key={tab.value}
            onKeyDown={(event) => {
              if (
                event.key !== 'ArrowLeft' &&
                event.key !== 'ArrowRight' &&
                event.key !== 'Home' &&
                event.key !== 'End'
              ) {
                return;
              }
              event.preventDefault();
              const buttons = Array.from(
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                  '[role="tab"]',
                ) ?? [],
              );
              const current = buttons.indexOf(event.currentTarget);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : (current +
                        (event.key === 'ArrowRight' ? 1 : -1) +
                        buttons.length) %
                      buttons.length;
              buttons[next]?.focus();
              buttons[next]?.click();
            }}
            onClick={() => setActiveTab(tab.value)}
            role="tab"
            tabIndex={activeTab === tab.value ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section
        aria-labelledby={`tab-${activeTab}`}
        className="detail-panel"
        id={`panel-${activeTab}`}
        role="tabpanel"
      >
        {activeTab === 'overview' && <Overview opportunity={opportunity} />}
        {activeTab === 'eligibility' && (
          <EligibilityAnalysis opportunity={opportunity} />
        )}
        {activeTab === 'fit' && <FitAnalysis opportunity={opportunity} />}
        {activeTab === 'quality' && (
          <QualityAnalysis opportunity={opportunity} />
        )}
        {activeTab === 'evidence' && (
          <EvidenceAnalysis opportunity={opportunity} />
        )}
        {activeTab === 'history' && (
          <AnalysisSection
            description="Earlier snapshots and decisions are retained so changes remain explainable."
            title="Opportunity history"
          >
            <Timeline items={opportunity.history} />
          </AnalysisSection>
        )}
      </section>
    </div>
  );
}

function Overview({ opportunity }: { readonly opportunity: Opportunity }) {
  const watchItem = opportunity.eligibilitySignals[0]?.summary;
  const improvement = opportunity.fitSignals.find(
    (signal) => signal.state !== 'matched',
  )?.summary;
  return (
    <div className="detail-overview-grid detail-overview-v2">
      <AnalysisSection
        description="A concise reading of the role data captured from the source."
        title="Opportunity brief"
      >
        {opportunity.description.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
        {opportunity.description.length === 0 && (
          <p>No description supplied.</p>
        )}
      </AnalysisSection>
      <AnalysisSection
        description="Requirement strength matters: preferences affect Fit but do not automatically become blockers."
        title="Key requirements"
      >
        <ul className="requirement-list">
          {opportunity.requirements.map((requirement) => (
            <li key={requirement}>
              <Icon name="check" size={16} />
              {requirement}
            </li>
          ))}
        </ul>
      </AnalysisSection>
      <AnalysisSection
        description="The recommendation is assembled from structured findings, not a prose-only model response."
        title="Reasoning summary"
      >
        <dl className="reasoning-register">
          <div>
            <dt>Supports the decision</dt>
            <dd>
              {opportunity.fitSignals[0]?.summary ??
                'No supporting Fit finding is recorded.'}
            </dd>
          </div>
          <div>
            <dt>Hard gate to watch</dt>
            <dd>{watchItem ?? 'No Eligibility finding is recorded.'}</dd>
          </div>
          <div>
            <dt>Missing or partial evidence</dt>
            <dd>
              {improvement ?? 'No decisive Fit gap is currently recorded.'}
            </dd>
          </div>
        </dl>
      </AnalysisSection>
      <aside className="provenance-note">
        <Icon name="source" size={18} />
        <div>
          <strong>Provenance retained</strong>
          <p>{opportunity.sourceReference}</p>
          <small>Observed {opportunity.freshness.toLowerCase()}</small>
        </div>
      </aside>
    </div>
  );
}

function EligibilityAnalysis({
  opportunity,
}: {
  readonly opportunity: Opportunity;
}) {
  return (
    <AnalysisSection
      description="Each condition retains requirement strength, candidate context, confidence, and evidence."
      title="Can I realistically pursue this opportunity?"
    >
      {opportunity.eligibilityExplanation && (
        <p>{opportunity.eligibilityExplanation}</p>
      )}
      <div className="analysis-list">
        {opportunity.eligibilitySignals.map((signal) => (
          <EligibilitySignalRow
            key={signal.id}
            signal={signal}
            opportunity={opportunity}
          />
        ))}
      </div>
      {opportunity.eligibilitySignals.length === 0 && (
        <p>
          {opportunity.eligibilityExplanation ??
            'Eligibility has not been evaluated.'}
        </p>
      )}
    </AnalysisSection>
  );
}

function EligibilitySignalRow({
  signal,
  opportunity,
}: {
  readonly signal: EvaluationSignal;
  readonly opportunity: Opportunity;
}) {
  return (
    <article className="analysis-row" data-signal={signal.state}>
      <span className="analysis-icon">
        <Icon
          name={
            signal.state === 'pass'
              ? 'check'
              : signal.state === 'blocker'
                ? 'blocker'
                : 'unknown'
          }
        />
      </span>
      <div>
        <div className="analysis-row-heading">
          <h3>{signal.label}</h3>
          <span>{signal.state}</span>
        </div>
        <p>{signal.summary}</p>
        {opportunity.decisiveFindingIds.includes(signal.id) && (
          <strong className="impact-copy">Supports the recommendation</strong>
        )}
        <small>
          Confidence: {signal.confidence} · Supported by{' '}
          {signal.evidenceIds.length} evidence references
        </small>
        {signal.investigate && (
          <div className="investigation-prompt">
            <strong>Investigate</strong>
            <span>{signal.investigate}</span>
          </div>
        )}
        <EvidenceLinks
          ids={signal.evidenceIds ?? []}
          opportunity={opportunity}
        />
      </div>
    </article>
  );
}

function FitAnalysis({ opportunity }: { readonly opportunity: Opportunity }) {
  return (
    <AnalysisSection
      description="Matches, gaps, and transferable skills remain tied to Career Profile evidence."
      title="How well does the role fit?"
    >
      <div className="analysis-list">
        {opportunity.fitSignals.map((signal) => (
          <FitSignalRow
            key={signal.id}
            signal={signal}
            opportunity={opportunity}
          />
        ))}
      </div>
      {opportunity.fitSignals.length === 0 && (
        <p>{opportunity.fitExplanation ?? 'Fit has not been evaluated.'}</p>
      )}
    </AnalysisSection>
  );
}

function FitSignalRow({
  signal,
  opportunity,
}: {
  readonly signal: FitSignal;
  readonly opportunity: Opportunity;
}) {
  const icon =
    signal.state === 'matched'
      ? 'check'
      : signal.state === 'missing'
        ? 'warning'
        : 'spark';
  return (
    <article className="analysis-row" data-signal={signal.state}>
      <span className="analysis-icon">
        <Icon name={icon} />
      </span>
      <div>
        <div className="analysis-row-heading">
          <h3>{signal.label}</h3>
          <span>{signal.state}</span>
        </div>
        <p>{signal.summary}</p>
        {opportunity.decisiveFindingIds.includes(signal.id) && (
          <strong className="impact-copy">Supports the recommendation</strong>
        )}
        <strong className="impact-copy">Impact: {signal.impact}</strong>
        <EvidenceLinks
          ids={signal.evidenceIds ?? []}
          opportunity={opportunity}
        />
      </div>
    </article>
  );
}

function QualityAnalysis({
  opportunity,
}: {
  readonly opportunity: Opportunity;
}) {
  return (
    <AnalysisSection
      description="Quality describes observable listing confidence and risk—not candidate skill."
      title="Is this opportunity worth pursuing?"
    >
      <div className="analysis-list">
        {opportunity.qualitySignals.map((signal) => (
          <QualitySignalRow
            key={signal.id}
            signal={signal}
            opportunity={opportunity}
          />
        ))}
      </div>
      {opportunity.qualitySignals.length === 0 && (
        <p>
          {opportunity.qualityExplanation ?? 'Quality has not been evaluated.'}
        </p>
      )}
    </AnalysisSection>
  );
}

function QualitySignalRow({
  signal,
  opportunity,
}: {
  readonly signal: QualitySignal;
  readonly opportunity: Opportunity;
}) {
  return (
    <article className="analysis-row" data-signal={signal.state}>
      <span className="analysis-icon">
        <Icon
          name={
            signal.state === 'positive'
              ? 'check'
              : signal.state === 'risk'
                ? 'blocker'
                : 'warning'
          }
        />
      </span>
      <div>
        <div className="analysis-row-heading">
          <h3>{signal.label}</h3>
          <span>{signal.state}</span>
        </div>
        <p>{signal.summary}</p>
        {opportunity.decisiveFindingIds.includes(signal.id) && (
          <strong className="impact-copy">Supports the recommendation</strong>
        )}
        <EvidenceLinks
          ids={signal.evidenceIds ?? []}
          opportunity={opportunity}
        />
      </div>
    </article>
  );
}

function EvidenceAnalysis({
  opportunity,
}: {
  readonly opportunity: Opportunity;
}) {
  return (
    <AnalysisSection
      description="These are unique source or candidate evidence records linked to evaluation findings; coverage is a separate assessment."
      title="Evidence and provenance"
    >
      <div className="evidence-grid">
        {opportunity.evidence.map((evidence) => (
          <article className="evidence-card" key={evidence.id}>
            <div>
              <Icon name="evidence" />
              <h3>{evidence.label}</h3>
            </div>
            <EvidenceStateLabel state={evidence.state} />
            <blockquote>“{evidence.excerpt}”</blockquote>
            <dl>
              <div>
                <dt>Source</dt>
                <dd>{evidence.source}</dd>
              </div>
              <div>
                <dt>Observed</dt>
                <dd>{evidence.observedAt}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      {opportunity.evidence.length === 0 && (
        <p>No evidence records are linked to the current findings.</p>
      )}
    </AnalysisSection>
  );
}

function EvidenceLinks({
  ids,
  opportunity,
}: {
  readonly ids: readonly string[];
  readonly opportunity: Opportunity;
}) {
  return (
    <div className="evidence-links">
      <span>Supported by:</span>
      {ids.map((id) => {
        const evidence = opportunity.evidence.find((item) => item.id === id);
        return <span key={id}>{evidence?.label ?? id}</span>;
      })}
    </div>
  );
}

function AnalysisSection({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="analysis-section">
      <header>
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

export default OpportunityDetailPage;
