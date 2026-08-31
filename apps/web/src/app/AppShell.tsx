import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { getBootstrapStatus } from '../api.js';
import { Icon, type IconName } from '../components/Icon.js';
import { useProductData } from './ProductDataProvider.js';
import { useTheme, type ThemePreference } from './ThemeProvider.js';

const primaryNavigation: readonly {
  readonly to: string;
  readonly label: string;
  readonly icon: IconName;
}[] = [
  { to: '/today', label: 'Today', icon: 'today' },
  { to: '/opportunities', label: 'Opportunities', icon: 'opportunities' },
  { to: '/applications', label: 'Applications', icon: 'applications' },
  { to: '/signals', label: 'Career Signals', icon: 'signals' },
  { to: '/profile', label: 'Career Profile', icon: 'profile' },
  { to: '/search', label: 'Search', icon: 'search' },
];

type ApiState = 'checking' | 'available' | 'unavailable';

export function AppShell() {
  const { dataSource, snapshot } = useProductData();
  const { preference, setPreference } = useTheme();
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
              end={item.to === '/today'}
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
              <small>Development profile</small>
            </span>
          </div>
        </div>
      </aside>

      <div className="app-content">
        <div className="environment-strip">
          <span>
            <Icon name="info" size={15} />{' '}
            {dataSource === 'api'
              ? 'API-backed Opportunities · other pages remain development-only'
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
      aria-label="Open Career Agent Today"
      className="product-identity"
      to="/today"
    >
      <span className="product-mark" aria-hidden="true">
        <span />
        <span />
      </span>
      <span>
        <strong>Open Career Agent</strong>
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
