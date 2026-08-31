import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { Icon } from '../../components/Icon.js';
import { DecisionBadge } from '../../components/Status.js';
import type { Opportunity } from '../../data/types.js';

type CategoryTab =
  | 'ALL'
  | 'HIGH_PRIORITY'
  | 'CONSIDER'
  | 'INVESTIGATE'
  | 'LOW_PRIORITY'
  | 'BLOCKED';

const decisionToCategory: Record<string, CategoryTab> = {
  'high-priority': 'HIGH_PRIORITY',
  consider: 'CONSIDER',
  investigate: 'INVESTIGATE',
  'low-priority': 'LOW_PRIORITY',
  blocked: 'BLOCKED',
};

export default function MatchesPage() {
  const { snapshot } = useProductData();
  const [selectedCategory, setSelectedCategory] = useState<CategoryTab>('ALL');

  const opportunities: readonly Opportunity[] = snapshot.opportunities;

  const filteredOpportunities = opportunities.filter((opp) => {
    if (selectedCategory === 'ALL') return true;
    const decisionKey = opp.decision ?? '';
    return decisionToCategory[decisionKey] === selectedCategory;
  });

  const countByCategory = (cat: CategoryTab) =>
    opportunities.filter(
      (opp) => decisionToCategory[opp.decision ?? ''] === cat,
    ).length;

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Matches</h1>
          <p className="subtitle">
            Candidate-specific discovered jobs grouped by their persisted
            recommendation state.
          </p>
        </div>
      </header>

      <div
        className="tab-bar"
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          flexWrap: 'wrap',
        }}
      >
        <button
          className={`button ${selectedCategory === 'ALL' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setSelectedCategory('ALL')}
          type="button"
        >
          All Matches ({opportunities.length})
        </button>
        <button
          className={`button ${selectedCategory === 'HIGH_PRIORITY' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setSelectedCategory('HIGH_PRIORITY')}
          type="button"
        >
          High Priority ({countByCategory('HIGH_PRIORITY')})
        </button>
        <button
          className={`button ${selectedCategory === 'CONSIDER' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setSelectedCategory('CONSIDER')}
          type="button"
        >
          Consider ({countByCategory('CONSIDER')})
        </button>
        <button
          className={`button ${selectedCategory === 'INVESTIGATE' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setSelectedCategory('INVESTIGATE')}
          type="button"
        >
          Investigate ({countByCategory('INVESTIGATE')})
        </button>
        <button
          className={`button ${selectedCategory === 'LOW_PRIORITY' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setSelectedCategory('LOW_PRIORITY')}
          type="button"
        >
          Low Priority ({countByCategory('LOW_PRIORITY')})
        </button>
        <button
          className={`button ${selectedCategory === 'BLOCKED' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => setSelectedCategory('BLOCKED')}
          type="button"
        >
          Blocked ({countByCategory('BLOCKED')})
        </button>
      </div>

      {filteredOpportunities.length === 0 ? (
        <div className="empty-state card">
          <Icon name="spark" size={32} />
          <h3>No matches in this category</h3>
          <p>
            Rolevia hasn't found jobs matching this recommendation filter yet.
          </p>
        </div>
      ) : (
        <div className="card-grid" style={{ display: 'grid', gap: '16px' }}>
          {filteredOpportunities.map((opp) => {
            const explanation =
              opp.explanation || 'Evaluated against candidate requirements';

            return (
              <div className="card" key={opp.id} style={{ padding: '20px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '12px',
                  }}
                >
                  <div>
                    <h2 style={{ margin: '0 0 4px 0', fontSize: '1.2rem' }}>
                      <Link
                        to={`/discover/${opp.id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                      >
                        {opp.role}
                      </Link>
                    </h2>
                    <div
                      style={{
                        display: 'flex',
                        gap: '16px',
                        color: 'var(--color-text-muted)',
                        fontSize: '0.9rem',
                      }}
                    >
                      {opp.company.name && <span>🏢 {opp.company.name}</span>}
                      {opp.location && <span>📍 {opp.location}</span>}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'center',
                    }}
                  >
                    <DecisionBadge decision={opp.decision} />
                  </div>
                </div>

                <div
                  style={{
                    background: 'var(--color-bg-subtle, #f8f9fa)',
                    padding: '12px',
                    borderRadius: '6px',
                    marginTop: '12px',
                    fontSize: '0.9rem',
                  }}
                >
                  <strong>{recommendationHeading(opp.decision)}</strong>
                  <p
                    style={{
                      margin: '4px 0 0 0',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {explanation}
                  </p>
                </div>

                <div
                  style={{
                    marginTop: '16px',
                    display: 'flex',
                    justifyContent: 'flex-end',
                  }}
                >
                  <Link
                    className="button button-secondary"
                    to={`/discover/${opp.id}`}
                  >
                    Inspect Match Details <Icon name="arrow-right" size={14} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
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
