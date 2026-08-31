import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { PageHeader } from '../../components/PageHeader.js';
import { EmptyState } from '../../components/EmptyState.js';
import type {
  CareerSignal,
  CareerSignalsResponse,
  SampleOpportunityItem,
} from '../../data/types.js';

export function CareerSignalsPage() {
  const { getCareerSignals } = useProductData();
  const [signals, setSignals] = useState<CareerSignalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    getCareerSignals(controller.signal)
      .then((data) => {
        if (active) {
          setSignals(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (active && !(err instanceof Error && err.name === 'AbortError')) {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to load Career Insights',
          );
          setLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [getCareerSignals]);

  if (loading) {
    return (
      <div className="page signals-page">
        <PageHeader
          description="Aggregating market intelligence across your active discovered roles..."
          eyebrow="Loading"
          title="Career Insights"
        />
        <div
          className="app-loading"
          style={{ padding: '2rem', textAlign: 'center' }}
        >
          Loading Career Insights...
        </div>
      </div>
    );
  }

  if (error || !signals) {
    return (
      <div className="page signals-page">
        <PageHeader
          description="Error loading candidate market insights."
          eyebrow="Intelligence Error"
          title="Career Insights"
        />
        <EmptyState
          description={error ?? 'Unable to retrieve Career Insights.'}
          title="Failed to Load Insights"
        />
      </div>
    );
  }

  const hasAnySignals =
    signals.repeatedGaps.length > 0 ||
    signals.strongAlignments.length > 0 ||
    signals.transferableCapabilities.length > 0 ||
    signals.eligibilityUncertainties.length > 0 ||
    signals.eligibilityBlockers.length > 0 ||
    signals.evidenceGaps.length > 0 ||
    signals.marketDemand.length > 0;

  return (
    <div className="page signals-page" data-testid="career-signals-page">
      <PageHeader
        description="Evidence-backed market intelligence aggregated across your active discovered jobs."
        eyebrow="Candidate Intelligence"
        title="Career Insights"
      />

      <div
        className="panel signals-summary-panel"
        style={{ marginBottom: '2rem' }}
      >
        <div
          className="signals-summary-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
              Active Market Overview
            </h3>
            <p className="secondary-text" style={{ margin: '0.25rem 0 0 0' }}>
              {signals.summary}
            </p>
          </div>
          <span className="badge badge-neutral" data-testid="active-opp-count">
            {signals.activeOpportunityCount} Active Roles
          </span>
        </div>
      </div>

      {!hasAnySignals ? (
        <EmptyState
          description="No recurring market patterns detected yet. As Rolevia evaluates discovered jobs, evidence-backed insights will appear here."
          title="No Career Insights Yet"
        />
      ) : (
        <div
          className="signals-sections"
          style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}
        >
          {/* Eligibility Blockers */}
          {signals.eligibilityBlockers.length > 0 && (
            <SignalSection
              badgeClass="badge-danger"
              icon="🚫"
              id="eligibility-blockers"
              signals={signals.eligibilityBlockers}
              title="Eligibility Blockers"
            />
          )}

          {/* Repeated Fit Gaps */}
          {signals.repeatedGaps.length > 0 && (
            <SignalSection
              badgeClass="badge-warning"
              icon="⚠️"
              id="repeated-gaps"
              signals={signals.repeatedGaps}
              title="Repeated Fit Gaps"
            />
          )}

          {/* Strong Alignments */}
          {signals.strongAlignments.length > 0 && (
            <SignalSection
              badgeClass="badge-success"
              icon="🌟"
              id="strong-alignments"
              signals={signals.strongAlignments}
              title="Strong Alignments"
            />
          )}

          {/* Transferable Capabilities */}
          {signals.transferableCapabilities.length > 0 && (
            <SignalSection
              badgeClass="badge-info"
              icon="🔄"
              id="transferable-capabilities"
              signals={signals.transferableCapabilities}
              title="Transferable Capabilities"
            />
          )}

          {/* Eligibility Uncertainties */}
          {signals.eligibilityUncertainties.length > 0 && (
            <SignalSection
              badgeClass="badge-neutral"
              icon="❓"
              id="eligibility-uncertainties"
              signals={signals.eligibilityUncertainties}
              title="Eligibility Uncertainties"
            />
          )}

          {/* Evidence Gaps */}
          {signals.evidenceGaps.length > 0 && (
            <SignalSection
              badgeClass="badge-warning"
              icon="📁"
              id="evidence-gaps"
              signals={signals.evidenceGaps}
              title="Career Profile Evidence Gaps"
            />
          )}

          {/* Market Demand */}
          {signals.marketDemand.length > 0 && (
            <SignalSection
              badgeClass="badge-primary"
              icon="📈"
              id="market-demand"
              signals={signals.marketDemand}
              title="Top Market Demands"
            />
          )}
        </div>
      )}
    </div>
  );
}

function SignalSection({
  title,
  icon,
  signals,
  badgeClass,
  id,
}: {
  readonly title: string;
  readonly icon: string;
  readonly signals: readonly CareerSignal[];
  readonly badgeClass: string;
  readonly id: string;
}) {
  return (
    <section className="signals-section" id={id} data-testid={`section-${id}`}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}
      >
        <span style={{ fontSize: '1.2rem' }}>{icon}</span>
        <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>
          {title}
        </h3>
        <span className={`badge ${badgeClass}`} style={{ marginLeft: 'auto' }}>
          {signals.length} {signals.length === 1 ? 'Signal' : 'Signals'}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '1rem',
        }}
      >
        {signals.map((sig) => (
          <SignalCard
            key={`${sig.signalType}-${sig.dimensionKey}`}
            signal={sig}
          />
        ))}
      </div>
    </section>
  );
}

function SignalCard({ signal }: { readonly signal: CareerSignal }) {
  return (
    <div
      className="panel signal-card"
      data-testid={`signal-card-${signal.dimensionKey}`}
      style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '0.5rem',
        }}
      >
        <div>
          <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
            {signal.label}
          </h4>
          <span
            className="secondary-text"
            style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}
          >
            {signal.dimensionKey}
          </span>
        </div>
        <span
          className="badge badge-neutral"
          style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
        >
          {signal.affectedOpportunityCount}{' '}
          {signal.affectedOpportunityCount === 1 ? 'role' : 'roles'}
        </span>
      </div>

      <p
        style={{
          margin: 0,
          fontSize: '0.875rem',
          color: 'var(--color-text-secondary, #475569)',
        }}
      >
        {signal.summary}
      </p>

      {signal.sampleOpportunities.length > 0 && (
        <div
          style={{
            marginTop: 'auto',
            paddingTop: '0.5rem',
            borderTop: '1px solid var(--color-border, #e2e8f0)',
          }}
        >
          <span
            className="secondary-text"
            style={{ fontSize: '0.75rem', fontWeight: 500 }}
          >
            Example jobs:
          </span>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.375rem',
              marginTop: '0.375rem',
            }}
          >
            {signal.sampleOpportunities.map((sample: SampleOpportunityItem) => (
              <Link
                key={sample.opportunityId}
                className="chip-link"
                to={`/discover/${sample.opportunityId}`}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '0.25rem',
                  backgroundColor: 'var(--color-bg-subtle, #f1f5f9)',
                  color: 'var(--color-text-primary, #0f172a)',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <strong>{sample.organization}</strong>: {sample.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CareerSignalsPage;
