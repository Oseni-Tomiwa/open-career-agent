import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AppShell } from './app/AppShell.js';
import { AppLoading } from './app/AppLoading.js';
import { RouteError } from './RouteError.js';

const TodayPage = lazy(() => import('./features/today/TodayPage.js'));
const OpportunitiesPage = lazy(
  () => import('./features/opportunities/OpportunitiesPage.js'),
);
const OpportunityDetailPage = lazy(
  () => import('./features/opportunities/OpportunityDetailPage.js'),
);
const MatchesPage = lazy(() => import('./features/matches/MatchesPage.js'));
const ApplicationsPage = lazy(
  () => import('./features/applications/ApplicationsPage.js'),
);
const CareerSignalsPage = lazy(
  () => import('./features/signals/CareerSignalsPage.js'),
);
const AgentActivityPage = lazy(
  () => import('./features/activity/AgentActivityPage.js'),
);
const SettingsPage = lazy(() => import('./features/settings/SettingsPage.js'));
const savedPages = () =>
  import('./features/saved-opportunities/SavedOpportunities.js');
const NotFoundPage = lazy(() => import('./features/NotFoundPage.js'));

function lazyPage(page: React.ReactNode) {
  return <Suspense fallback={<AppLoading />}>{page}</Suspense>;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate replace to="/overview" /> },
      // Canonical Primary Routes
      { path: 'overview', element: lazyPage(<TodayPage />) },
      { path: 'discover', element: lazyPage(<OpportunitiesPage />) },
      {
        path: 'discover/:opportunityId',
        element: lazyPage(<OpportunityDetailPage />),
      },
      {
        path: 'saved-opportunities',
        lazy: async () => ({ Component: (await savedPages()).SavedListPage }),
      },
      {
        path: 'saved-opportunities/new',
        lazy: async () => ({ Component: (await savedPages()).SavedNewPage }),
      },
      {
        path: 'saved-opportunities/:opportunityId',
        lazy: async () => ({ Component: (await savedPages()).SavedDetailPage }),
      },
      {
        path: 'saved-opportunities/:opportunityId/edit',
        lazy: async () => ({ Component: (await savedPages()).SavedEditPage }),
      },
      { path: 'matches', element: lazyPage(<MatchesPage />) },
      { path: 'applications', element: lazyPage(<ApplicationsPage />) },
      { path: 'insights', element: lazyPage(<CareerSignalsPage />) },
      { path: 'activity', element: lazyPage(<AgentActivityPage />) },
      { path: 'settings', element: lazyPage(<SettingsPage />) },

      // Legacy Aliases & Redirects for Backward Compatibility
      { path: 'today', element: <Navigate replace to="/overview" /> },
      { path: 'opportunities', element: <Navigate replace to="/discover" /> },
      {
        path: 'opportunities/:opportunityId',
        element: lazyPage(<OpportunityDetailPage />),
      },
      { path: 'signals', element: <Navigate replace to="/insights" /> },
      { path: 'profile', element: <Navigate replace to="/settings" /> },
      {
        path: 'search',
        element: <Navigate replace to="/discover?tab=preferences" />,
      },
      { path: 'sign-in', element: <Navigate replace to="/overview" /> },
      { path: 'create-account', element: <Navigate replace to="/overview" /> },
      { path: 'how-it-works', element: <Navigate replace to="/overview" /> },
      { path: 'features', element: <Navigate replace to="/overview" /> },
      { path: 'pricing', element: <Navigate replace to="/overview" /> },
      { path: 'about', element: <Navigate replace to="/overview" /> },
      { path: 'privacy', element: <Navigate replace to="/overview" /> },
      { path: 'terms', element: <Navigate replace to="/overview" /> },

      { path: '*', element: lazyPage(<NotFoundPage />) },
    ],
  },
]);
