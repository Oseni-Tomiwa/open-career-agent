import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { CompanyMark } from '../../components/CompanyMark.js';
import { Icon } from '../../components/Icon.js';
import {
  DecisionBadge,
  EligibilityStatus,
  EvidenceStateLabel,
  SignalScore,
} from '../../components/Status.js';
import { Timeline } from '../../components/Timeline.js';
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
  const { snapshot, updateDecision } = useProductData();
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const opportunity = snapshot.opportunities.find(
    (item) => item.id === opportunityId,
  );

  if (!opportunity) {
    return (
      <NotFoundPage
        description="That opportunity is not present in the fictional development dataset. It may have been removed or the link may be incorrect."
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
      <Link className="back-link" to="/opportunities">
        <Icon name="arrow-left" size={16} /> Back to opportunities
      </Link>

      <header className="detail-header">
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
        <div className="detail-actions">
          <button
            className="button button-primary"
            onClick={() => {
              void act('consider', 'Shortlisted');
            }}
            type="button"
          >
            Shortlist
          </button>
          <button
            className="button button-secondary"
            onClick={() => {
              void act('investigate', 'Marked for investigation');
            }}
            type="button"
          >
            Investigate
          </button>
          <button
            className="button button-quiet"
            onClick={() => {
              void act('low-priority', 'Dismissed for now');
            }}
            type="button"
          >
            Dismiss
          </button>
        </div>
      </header>
      {actionNotice && (
        <p aria-live="polite" className="session-notice detail-notice">
          {actionNotice}
        </p>
      )}

      <section
        aria-labelledby="decision-summary-heading"
        className="decision-summary"
      >
        <div className="decision-summary-copy">
          <span className="metric-label">Recommended decision</span>
          <div>
            <DecisionBadge decision={opportunity.decision} />
            <h2 id="decision-summary-heading">{opportunity.decisionLabel}</h2>
          </div>
          <p>{opportunity.explanation}</p>
          <span className="next-action">
            <Icon name="arrow-right" size={15} /> {opportunity.nextAction}
          </span>
        </div>
        <div className="decision-metrics">
          <div>
            <span className="metric-label">Eligibility</span>
            <EligibilityStatus state={opportunity.eligibility} />
            <small>{opportunity.eligibilityLabel}</small>
          </div>
          <SignalScore
            label="Fit"
            level={opportunity.fit}
            score={opportunity.fitScore}
          />
          <SignalScore
            label="Quality"
            level={opportunity.quality}
            score={opportunity.qualityScore}
          />
          <div className="completeness-metric">
            <span className="metric-label">Evidence completeness</span>
            <strong>{opportunity.completeness}%</strong>
            <small>
              {opportunity.completeness < 75
                ? 'Material information is still missing'
                : 'Adequate for this recommendation'}
            </small>
          </div>
        </div>
      </section>

      {opportunity.eligibility === 'ineligible' && (
        <div className="blocker-banner" role="note">
          <Icon name="blocker" />
          <div>
            <strong>Confirmed Eligibility blocker</strong>
            <p>
              {opportunity.eligibilityLabel}. Strong Fit does not override this
              requirement.
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
            onClick={() => setActiveTab(tab.value)}
            role="tab"
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
  return (
    <div className="detail-overview-grid">
      <AnalysisSection
        description="A concise reading of the fictional role fixture."
        title="Role overview"
      >
        {opportunity.description.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </AnalysisSection>
      <aside className="role-facts">
        <h3>Role facts</h3>
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
            <dt>Seniority</dt>
            <dd>{opportunity.seniority}</dd>
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
            <dt>Relocation</dt>
            <dd>{opportunity.relocation}</dd>
          </div>
        </dl>
      </aside>
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
        description="The recommendation is assembled from structured signals, not a prose-only model response."
        title="Why this opportunity?"
      >
        <div className="why-grid">
          <div>
            <strong>Ranks well because</strong>
            <p>{opportunity.fitSignals[0]?.summary}</p>
          </div>
          <div>
            <strong>Watch closely</strong>
            <p>{opportunity.eligibilitySignals[0]?.summary}</p>
          </div>
          <div>
            <strong>Would improve Fit</strong>
            <p>
              {opportunity.fitSignals.find(
                (signal) => signal.state !== 'matched',
              )?.summary ?? 'No decisive Fit gap is currently recorded.'}
            </p>
          </div>
        </div>
      </AnalysisSection>
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
      <div className="analysis-list">
        {opportunity.eligibilitySignals.map((signal) => (
          <EligibilitySignalRow
            key={signal.id}
            signal={signal}
            opportunity={opportunity}
          />
        ))}
      </div>
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
        <EvidenceLinks ids={signal.evidenceIds} opportunity={opportunity} />
      </div>
    </article>
  );
}

function FitAnalysis({ opportunity }: { readonly opportunity: Opportunity }) {
  return (
    <AnalysisSection
      description="Matches, gaps, and transferable skills remain tied to Career Memory evidence."
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
        <strong className="impact-copy">Impact: {signal.impact}</strong>
        <EvidenceLinks ids={signal.evidenceIds} opportunity={opportunity} />
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
          <QualitySignalRow key={signal.id} signal={signal} />
        ))}
      </div>
    </AnalysisSection>
  );
}

function QualitySignalRow({ signal }: { readonly signal: QualitySignal }) {
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
      description="Fictional source references demonstrate how claims remain reviewable without exposing raw unsafe markup."
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
