import { useEffect, useState } from 'react';

import { useProductData } from '../../app/ProductDataProvider.js';
import { Icon } from '../../components/Icon.js';
import { DiscoveryRunStatus } from '../../components/Status.js';
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
      <div className="page-container">
        <header className="page-header">
          <div>
            <h1>Agent Activity</h1>
            <p className="subtitle">Loading recent job-search activity…</p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Agent Activity</h1>
          <p className="subtitle">
            Recent job-search runs recorded for your search preferences.
          </p>
        </div>
      </header>

      {loadError ? (
        <div className="empty-state card" role="alert">
          <Icon name="warning" size={32} />
          <h3>Search activity is unavailable</h3>
          <p>Rolevia could not load your recent search activity.</p>
        </div>
      ) : activityList.length === 0 ? (
        <div className="empty-state card">
          <Icon name="history" size={32} />
          <h3>No search activity recorded yet</h3>
          <p>Completed and in-progress job searches will appear here.</p>
        </div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '12px' }}>Search Preference</th>
                <th style={{ padding: '12px' }}>Source System</th>
                <th style={{ padding: '12px' }}>Discovered</th>
                <th style={{ padding: '12px' }}>Accepted</th>
                <th style={{ padding: '12px' }}>Rejected</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {activityList.map((item: DiscoveryActivityItem) => (
                <tr
                  key={item.runId}
                  style={{
                    borderBottom: '1px solid var(--color-border-subtle, #eee)',
                  }}
                >
                  <td style={{ padding: '12px', fontWeight: 500 }}>
                    {item.searchTargetName}
                  </td>
                  <td style={{ padding: '12px', textTransform: 'capitalize' }}>
                    {item.sourceSystem}
                  </td>
                  <td style={{ padding: '12px' }}>
                    {item.discoveredCount} jobs
                  </td>
                  <td style={{ padding: '12px' }}>{item.acceptedCount}</td>
                  <td style={{ padding: '12px' }}>{item.rejectedCount}</td>
                  <td style={{ padding: '12px' }}>
                    <DiscoveryRunStatus status={item.status} />
                  </td>
                  <td
                    style={{
                      padding: '12px',
                      color: 'var(--color-text-muted)',
                      fontSize: '0.85rem',
                    }}
                  >
                    {new Date(item.startedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
