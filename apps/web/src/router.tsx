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
const ApplicationsPage = lazy(
  () => import('./features/applications/ApplicationsPage.js'),
);
const ProfilePage = lazy(() => import('./features/profile/ProfilePage.js'));
const SearchPage = lazy(() => import('./features/search/SearchPage.js'));
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
      { index: true, element: <Navigate replace to="/today" /> },
      { path: 'today', element: lazyPage(<TodayPage />) },
      { path: 'opportunities', element: lazyPage(<OpportunitiesPage />) },
      {
        path: 'opportunities/:opportunityId',
        element: lazyPage(<OpportunityDetailPage />),
      },
      { path: 'applications', element: lazyPage(<ApplicationsPage />) },
      { path: 'profile', element: lazyPage(<ProfilePage />) },
      { path: 'search', element: lazyPage(<SearchPage />) },
      { path: '*', element: lazyPage(<NotFoundPage />) },
    ],
  },
]);
