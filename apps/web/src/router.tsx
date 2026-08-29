import { createBrowserRouter } from 'react-router-dom';

import { BootstrapPage } from './BootstrapPage.js';
import { RouteError } from './RouteError.js';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <BootstrapPage />,
    errorElement: <RouteError />,
  },
]);
