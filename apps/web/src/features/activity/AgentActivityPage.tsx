import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { useProductData } from '../../app/ProductDataProvider.js';
import { Icon } from '../../components/Icon.js';
import { PageHeader } from '../../components/PageHeader.js';
import { DiscoveryRunStatus } from '../../components/Status.js';
import { WorkspaceSectionHeader } from '../../components/WorkspaceSection.js';
import type { DiscoveryActivityItem } from '../../data/types.js';

export default function AgentActivityPage() {
  const { getTodayDashboard } = useProductData();
  const [activityList, setActivityList] = useState<
    readonly DiscoveryActivityItem[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    getTodayDashboard(7)
      .then((data) => {
        if (active) {
          setActivityList(data.discoveryActivity || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoadError(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [getTodayDashboard]);

  if (loading) {
    return (
      <div className="page activity-page">
        <PageHeader
          eyebrow="Operations ledger"
          title="Agent Activity"
          description="Loading candidate-scoped discovery operations…"
          variant="operational"
        />
      </div>
    );
  }

  return (
    <div className="page activity-page">
      <PageHeader
        eyebrow="Operations ledger"
        title="Agent Activity"
        description="Inspect candidate-scoped discovery runs, their sources, record counts, status, and timing."
        variant="operational"
      />

      {loadError ? (
        <section className="workspace-empty-state" role="alert">
          <Icon name="warning" size={32} />
          <h2>Search activity is unavailable</h2>
          <p>Rolevia could not load your recent search activity.</p>
        </section>
      ) : activityList.length === 0 ? (
        <section className="workspace-empty-state activity-empty-state">
          <p className="eyebrow">No recorded operations</p>
          <h2>No search activity recorded yet</h2>
          <p>
            Nothing has run for this candidate yet. Completed and in-progress
            searches will appear as auditable records after a Search Preference
            is run.
          </p>
          <dl>
            <div>
              <dt>Each record will show</dt>
              <dd>
                Timestamp, search preference, direct source system,
                accepted/rejected record counts, and run status.
              </dd>
            </div>
            <div>
              <dt>Candidate control</dt>
              <dd>
                Discovery evaluates records; it does not submit applications.
              </dd>
            </div>
          </dl>
          <div className="empty-state-actions">
            <Link
              className="button button-primary"
              to="/discover?tab=preferences"
            >
              Review Search Preferences
            </Link>
            <Link className="button button-secondary" to="/discover">
              Inspect opportunity register
            </Link>
          </div>
        </section>
      ) : (
        <section
          aria-labelledby="activity-register-heading"
          className="activity-register"
        >
          <WorkspaceSectionHeader
            id="activity-register-heading"
            meta="Past 7 days"
            title="Discovery operations"
            description="Persisted activity only. Internal task-ledger details are intentionally excluded."
          />
          <div className="workspace-table-scroll">
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>Search preference</th>
                  <th>Source</th>
                  <th>Records</th>
                  <th>Evaluation</th>
                  <th>Status</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {activityList.map((item: DiscoveryActivityItem) => (
                  <tr key={item.runId}>
                    <td>
                      <strong>{item.searchTargetName}</strong>
                    </td>
                    <td className="capitalize">{item.sourceSystem}</td>
                    <td>{item.discoveredCount} jobs</td>
                    <td>
                      {item.acceptedCount} accepted · {item.rejectedCount}{' '}
                      rejected
                    </td>
                    <td>
                      <DiscoveryRunStatus status={item.status} />
                    </td>
                    <td>
                      <time dateTime={item.startedAt}>
                        {new Date(item.startedAt).toLocaleString()}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
