import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';

import { AppLoading } from './app/AppLoading.js';
import { ProductDataProvider } from './app/ProductDataProvider.js';
import { ThemeProvider } from './app/ThemeProvider.js';
import './styles.css';
import { router } from './router.js';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Application root element was not found');
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <Suspense fallback={<AppLoading />}>
        <ProductDataProvider>
          <RouterProvider router={router} />
        </ProductDataProvider>
      </Suspense>
    </ThemeProvider>
  </StrictMode>,
);
