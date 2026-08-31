import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { EmptyState } from '../../components/EmptyState.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import type { Opportunity } from '../../data/types.js';
import { SearchPage } from '../search/SearchPage.js';
import { OpportunitySummary } from './OpportunitySummary.js';

type SortValue = 'priority' | 'fit' | 'quality' | 'freshness';

export function OpportunitiesPage() {
  const { dataSource, snapshot } = useProductData();
  const [params, setParams] = useSearchParams();
  const activeTab =
    params.get('tab') === 'preferences' ? 'preferences' : 'jobs';
  const query = params.get('q') ?? '';
  const eligibility = params.get('eligibility') ?? 'all';
  const sponsorship = params.get('sponsorship') ?? 'all';
  const workModel = params.get('workModel') ?? 'all';
  const sort = (params.get('sort') ?? 'priority') as SortValue;

  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...snapshot.opportunities]
      .filter((opportunity) => {
        const searchable = [
          opportunity.role,
          opportunity.company.name,
          opportunity.location,
          ...opportunity.technologies,
        ]
          .join(' ')
          .toLowerCase();
        return (
          (!normalizedQuery || searchable.includes(normalizedQuery)) &&
          (eligibility === 'all' || opportunity.eligibility === eligibility) &&
          (sponsorship === 'all' || opportunity.sponsorship === sponsorship) &&
          (workModel === 'all' || opportunity.workModel === workModel)
        );
      })
      .sort((a, b) => compareOpportunities(a, b, sort));
  }, [
    eligibility,
    query,
    snapshot.opportunities,
    sort,
    sponsorship,
    workModel,
  ]);

  function updateParam(key: string, value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (
        !value ||
        value === 'all' ||
        (key === 'sort' && value === 'priority')
      ) {
        next.delete(key);
      } else {
        next.set(key, value);
      }
      return next;
    });
  }

  const hasFilters =
    query.length > 0 ||
    eligibility !== 'all' ||
    sponsorship !== 'all' ||
    workModel !== 'all';

  return (
    <div className="page opportunities-page">
      <PageHeader
        description={
          dataSource === 'api'
            ? 'Explore API-backed jobs discovered for your candidate profile.'
            : 'Explore development jobs discovered for your candidate profile.'
        }
        eyebrow="Job Discovery"
        title="Discover Jobs"
      />

      <div
        className="tab-bar"
        style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}
      >
        <button
          className={`button ${activeTab === 'jobs' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => updateParam('tab', 'jobs')}
          type="button"
        >
          All Jobs ({snapshot.opportunities.length})
        </button>
        <button
          className={`button ${activeTab === 'preferences' ? 'button-primary' : 'button-secondary'}`}
          onClick={() => updateParam('tab', 'preferences')}
          type="button"
        >
          Search Preferences
        </button>
      </div>

      {activeTab === 'preferences' ? (
        <SearchPage />
      ) : (
        <>
          <section
            aria-label="Opportunity search and filters"
            className="filter-shell"
          >
            <label className="search-field">
              <span className="sr-only">Search jobs</span>
              <Icon name="search" />
              <input
                onChange={(event) => updateParam('q', event.target.value)}
                placeholder="Search role, company, location, or skill"
                type="search"
                value={query}
              />
            </label>
            <div className="filter-row">
              <label>
                <span>Eligibility</span>
                <select
                  aria-label="Filter by Eligibility"
                  onChange={(event) =>
                    updateParam('eligibility', event.target.value)
                  }
                  value={eligibility}
                >
                  <option value="all">All states</option>
                  <option value="eligible">Eligible</option>
                  <option value="investigate">Investigate</option>
                  <option value="unknown">Unknown</option>
                  <option value="ineligible">Ineligible</option>
                </select>
              </label>
              <label>
                <span>Sponsorship</span>
                <select
                  aria-label="Filter by sponsorship"
                  onChange={(event) =>
                    updateParam('sponsorship', event.target.value)
                  }
                  value={sponsorship}
                >
                  <option value="all">Any policy</option>
                  <option value="Available">Available</option>
                  <option value="Unknown">Unknown</option>
                  <option value="Conflicting">Conflicting</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </label>
              <label>
                <span>Work model</span>
                <select
                  aria-label="Filter by work model"
                  onChange={(event) =>
                    updateParam('workModel', event.target.value)
                  }
                  value={workModel}
                >
                  <option value="all">Any model</option>
                  <option value="Remote">Remote</option>
                  <option value="Hybrid">Hybrid</option>
                  <option value="On-site">On-site</option>
                </select>
              </label>
              <label className="sort-control">
                <span>Sort</span>
                <select
                  aria-label="Sort jobs"
                  onChange={(event) => updateParam('sort', event.target.value)}
                  value={sort}
                >
                  <option value="priority">Recommendation priority</option>
                  <option value="fit">Fit: strongest first</option>
                  <option value="quality">Quality: strongest first</option>
                  <option value="freshness">Freshness</option>
                </select>
              </label>
            </div>
          </section>

          <div className="result-toolbar">
            <p aria-live="polite">
              <strong>{results.length}</strong> of{' '}
              {snapshot.opportunities.length} jobs
            </p>
            {hasFilters && (
              <button
                className="button button-quiet"
                onClick={() => setParams({})}
                type="button"
              >
                Clear filters
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <EmptyState
              description={
                snapshot.opportunities.length === 0
                  ? 'No jobs are currently available from the selected data source.'
                  : 'Try broadening Eligibility or sponsorship filters. Unknown is kept separate, so it may be worth including investigation states.'
              }
              title={
                snapshot.opportunities.length === 0
                  ? 'No jobs available'
                  : 'No jobs match these filters'
              }
            />
          ) : (
            <div className="opportunity-results">
              {results.map((opportunity) => (
                <OpportunitySummary
                  key={opportunity.id}
                  opportunity={opportunity}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function compareOpportunities(a: Opportunity, b: Opportunity, sort: SortValue) {
  if (sort === 'fit') {
    const order = { strong: 0, moderate: 1, weak: 2 } as const;
    const levelDifference =
      (a.fit ? order[a.fit] : 3) - (b.fit ? order[b.fit] : 3);
    return levelDifference || (b.fitScore ?? -1) - (a.fitScore ?? -1);
  }
  if (sort === 'quality') {
    const order = { strong: 0, moderate: 1, weak: 2, risk: 3 } as const;
    const levelDifference =
      (a.quality ? order[a.quality] : 4) - (b.quality ? order[b.quality] : 4);
    return levelDifference || (b.qualityScore ?? -1) - (a.qualityScore ?? -1);
  }
  if (sort === 'freshness') return b.updatedAt.localeCompare(a.updatedAt);
  const order = {
    'high-priority': 0,
    investigate: 1,
    consider: 2,
    'low-priority': 3,
    blocked: 4,
  } as const;
  return (
    (a.decision ? order[a.decision] : 5) - (b.decision ? order[b.decision] : 5)
  );
}

export default OpportunitiesPage;
