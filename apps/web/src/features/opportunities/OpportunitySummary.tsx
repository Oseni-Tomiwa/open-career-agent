import { useState } from 'react';
import { Link } from 'react-router-dom';

import { CompanyMark } from '../../components/CompanyMark.js';
import { Icon } from '../../components/Icon.js';
import {
  DecisionBadge,
  EligibilityStatus,
  SignalScore,
} from '../../components/Status.js';
import type { Decision, Opportunity } from '../../data/types.js';
import { useProductData } from '../../app/ProductDataProvider.js';

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
    <article className="opportunity-summary" data-compact={compact}>
      <div className="opportunity-main">
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
            <Link to={`/opportunities/${opportunity.id}`}>
              {opportunity.role}
            </Link>
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
        <div className="opportunity-decision">
          <DecisionBadge decision={opportunity.decision} />
          <span>{opportunity.decisionLabel}</span>
        </div>
      </div>

      <div className="opportunity-intelligence">
        <div className="eligibility-summary">
          <span className="metric-label">Eligibility</span>
          <EligibilityStatus state={opportunity.eligibility} />
          <p>{opportunity.eligibilityLabel}</p>
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
      </div>

      {!compact && (
        <>
          <div className="opportunity-reason">
            <p>{opportunity.explanation}</p>
            <div className="opportunity-facts">
              <span>
                {opportunity.compensation ?? 'Compensation not stated'}
              </span>
              <span>Sponsorship: {opportunity.sponsorship}</span>
              {opportunity.relocation === 'Supported' && (
                <span>Relocation supported</span>
              )}
            </div>
          </div>
          <div className="opportunity-actions">
            <Link
              className="button button-primary"
              to={`/opportunities/${opportunity.id}`}
            >
              View analysis <Icon name="arrow-right" size={16} />
            </Link>
            {opportunity.decision !== 'consider' && (
              <button
                className="button button-secondary"
                onClick={() => {
                  void chooseDecision('consider', 'Shortlisted');
                }}
                type="button"
              >
                Shortlist
              </button>
            )}
            {opportunity.decision !== 'investigate' && (
              <button
                aria-label={`Review evidence for ${opportunity.role}`}
                className="button button-quiet"
                onClick={() => {
                  void chooseDecision(
                    'investigate',
                    'Marked for evidence review',
                  );
                }}
                type="button"
              >
                Review evidence
              </button>
            )}
          </div>
          {notice && (
            <p aria-live="polite" className="session-notice">
              {notice}
              {dataSource === 'api'
                ? ' The canonical API Decision was not changed.'
                : ''}
            </p>
          )}
        </>
      )}
    </article>
  );
}
