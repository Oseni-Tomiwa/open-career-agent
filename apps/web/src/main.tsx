import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import './styles.css';
import { router } from './router.js';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Application root element was not found');
}

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
