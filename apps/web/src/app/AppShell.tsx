import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { getBootstrapStatus } from '../api.js';
import { Icon, type IconName } from '../components/Icon.js';
import { useProductData } from './ProductDataProvider.js';
import { useTheme, type ThemePreference } from './ThemeProvider.js';
import { useAuth } from './authContext.js';

const primaryNavigation: readonly {
  readonly to: string;
  readonly label: string;
  readonly icon: IconName;
}[] = [
  { to: '/overview', label: 'Overview', icon: 'today' },
  { to: '/discover', label: 'Discover Jobs', icon: 'opportunities' },
  { to: '/matches', label: 'Matches', icon: 'matches' },
  { to: '/applications', label: 'Applications', icon: 'applications' },
  { to: '/insights', label: 'Career Insights', icon: 'signals' },
  { to: '/activity', label: 'Agent Activity', icon: 'activity' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

type ApiState = 'checking' | 'available' | 'unavailable';

export function AppShell() {
  const { dataSource, snapshot } = useProductData();
  const { preference, setPreference } = useTheme();
  const auth = useAuth();
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [apiState, setApiState] = useState<ApiState>(
    dataSource === 'seed' ? 'available' : 'checking',
  );

  useEffect(() => {
    if (dataSource === 'seed') {
      return;
    }
    let active = true;
    getBootstrapStatus()
      .then(() => {
        if (active) setApiState('available');
      })
      .catch(() => {
        if (active) setApiState('unavailable');
      });
    return () => {
      active = false;
    };
  }, [dataSource]);

  useEffect(() => {
    if (!navigationOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavigationOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [navigationOpen]);

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="mobile-header">
        <ProductIdentity />
        <button
          aria-expanded={navigationOpen}
          aria-label={navigationOpen ? 'Close navigation' : 'Open navigation'}
          className="icon-button"
          onClick={() => setNavigationOpen((open) => !open)}
          type="button"
        >
          <Icon name={navigationOpen ? 'close' : 'menu'} />
        </button>
      </header>

      {navigationOpen && (
        <button
          aria-label="Close navigation"
          className="nav-scrim"
          onClick={() => setNavigationOpen(false)}
          type="button"
        />
      )}

      <aside className="sidebar" data-open={navigationOpen}>
        <ProductIdentity />
        <nav aria-label="Primary navigation" className="primary-nav">
          {primaryNavigation.map((item) => (
            <NavLink
              className={({ isActive }) => (isActive ? 'active' : undefined)}
              end={item.to === '/overview'}
              key={item.to}
              onClick={() => setNavigationOpen(false)}
              to={item.to}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <ThemeControl preference={preference} setPreference={setPreference} />
          <div className="candidate-chip">
            <span className="avatar" aria-hidden="true">
              {snapshot.profile.initials}
            </span>
            <span>
              <strong>{snapshot.profile.name}</strong>
              <small>{auth.session?.user.email ?? 'Development profile'}</small>
            </span>
          </div>
          <button
            className="auth-switch"
            onClick={() => void auth.signOut()}
            type="button"
          >
            Sign out
          </button>
        </div>
      </aside>

      <div className="app-content">
        <div className="environment-strip">
          <span>
            <Icon name="info" size={15} />{' '}
            {dataSource === 'api'
              ? 'API-backed candidate workspace'
              : 'Fictional development dataset'}
          </span>
          {apiState === 'unavailable' && (
            <span className="api-unavailable">
              API unavailable · API-mode opportunity data could not be refreshed
            </span>
          )}
          {apiState === 'checking' && <span>Checking local API…</span>}
        </div>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function ProductIdentity() {
  return (
    <NavLink
      aria-label="Rolevia Overview"
      className="product-identity"
      to="/overview"
    >
      <span className="product-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      <span>
        <strong>Rolevia</strong>
        <small>Career intelligence</small>
      </span>
    </NavLink>
  );
}

function ThemeControl({
  preference,
  setPreference,
}: {
  readonly preference: ThemePreference;
  readonly setPreference: (preference: ThemePreference) => void;
}) {
  const themes: readonly {
    readonly value: ThemePreference;
    readonly label: string;
    readonly icon: IconName;
  }[] = [
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'System', icon: 'system' },
  ];
  return (
    <fieldset className="theme-control">
      <legend>Theme</legend>
      <div>
        {themes.map((theme) => (
          <button
            aria-label={`Use ${theme.label.toLowerCase()} theme`}
            aria-pressed={preference === theme.value}
            key={theme.value}
            onClick={() => setPreference(theme.value)}
            title={theme.label}
            type="button"
          >
            <Icon name={theme.icon} size={16} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
