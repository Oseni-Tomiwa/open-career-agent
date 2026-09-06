import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { CompanyMark } from '../../components/CompanyMark.js';
import { Icon } from '../../components/Icon.js';
import { DecisionBadge, EligibilityStatus } from '../../components/Status.js';
import type { Decision, Opportunity } from '../../data/types.js';

export function OpportunitySummary({
  opportunity,
  compact = false,
}: {
  readonly opportunity: Opportunity;
  readonly compact?: boolean;
}) {
  const { dataSource, updateDecision } = useProductData();
  const [notice, setNotice] = useState<string | null>(null);

  async function chooseDecision(decision: Decision, message: string) {
    await updateDecision(opportunity.id, decision);
    setNotice(
      `${message} for this development session. This is not persisted to the API.`,
    );
  }

  return (
    <article
      className="opportunity-summary"
      data-compact={compact}
      data-decision={opportunity.decision ?? 'not-evaluated'}
    >
      <div className="opportunity-record-main">
        <CompanyMark
          company={opportunity.company}
          size={compact ? 'small' : 'medium'}
        />
        <div className="opportunity-identity">
          <div className="opportunity-kicker">
            <span>{opportunity.company.name}</span>
            <span aria-hidden="true">·</span>
            <span>{opportunity.freshness}</span>
          </div>
          <h3>
            <Link to={`/discover/${opportunity.id}`}>{opportunity.role}</Link>
          </h3>
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
          </div>
        </div>
        <div className="opportunity-decision" aria-label="Recommendation">
          <DecisionBadge decision={opportunity.decision} />
          <span>{opportunity.decisionLabel}</span>
        </div>
      </div>

      <dl className="opportunity-record-signals">
        <div>
          <dt>Eligibility</dt>
          <dd>
            <EligibilityStatus state={opportunity.eligibility} />
          </dd>
        </div>
        <div>
          <dt>Fit</dt>
          <dd className="evaluation-value">
            <strong>{opportunity.fit ?? 'Not evaluated'}</strong>
            {opportunity.fitScore !== null && (
              <small>{opportunity.fitScore} / 100</small>
            )}
          </dd>
        </div>
        <div>
          <dt>Quality</dt>
          <dd className="evaluation-value">
            <strong>{opportunity.quality ?? 'Not evaluated'}</strong>
            {opportunity.qualityScore !== null && (
              <small>{opportunity.qualityScore} / 100</small>
            )}
          </dd>
        </div>
        <div>
          <dt>Evidence coverage</dt>
          <dd className="evaluation-value">
            <strong>
              {opportunity.completeness === null
                ? 'Not assessed'
                : `${opportunity.completeness}%`}
            </strong>
            <small>
              {opportunity.completeness === null
                ? 'Open analysis for linked evidence'
                : 'assessed coverage'}
            </small>
          </dd>
        </div>
        <div>
          <dt>Compensation</dt>
          <dd>{opportunity.compensation ?? 'Not stated'}</dd>
        </div>
      </dl>

      {!compact && (
        <>
          <div className="opportunity-record-reason">
            <span className="metric-label">Decision basis</span>
            <p>{opportunity.explanation}</p>
            <span className="opportunity-record-policy">
              Sponsorship {opportunity.sponsorship.toLowerCase()}
              {opportunity.relocation === 'Supported'
                ? ' · Relocation supported'
                : ''}
            </span>
          </div>
          <div className="opportunity-actions">
            <Link
              className="button button-quiet"
              to={`/discover/${opportunity.id}`}
            >
              Inspect analysis <Icon name="arrow-right" size={16} />
            </Link>
            {opportunity.decision !== 'consider' && (
              <button
                className="button button-secondary"
                onClick={() => void chooseDecision('consider', 'Shortlisted')}
                type="button"
              >
                Shortlist
              </button>
            )}
            {opportunity.decision !== 'investigate' && (
              <button
                className="button button-quiet"
                onClick={() =>
                  void chooseDecision(
                    'investigate',
                    'Marked for evidence review',
                  )
                }
                type="button"
              >
                Mark for evidence review
              </button>
            )}
          </div>
          {notice && (
            <p aria-live="polite" className="session-notice">
              {notice}
              {dataSource === 'api'
                ? ' The saved API recommendation was not changed.'
                : ''}
            </p>
          )}
        </>
      )}
    </article>
  );
}
