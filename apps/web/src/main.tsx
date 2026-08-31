import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';

import { AppLoading } from './app/AppLoading.js';
import { AuthenticatedApplication } from './app/AuthenticatedApplication.js';
import { AuthProvider } from './app/AuthProvider.js';
import { ThemeProvider } from './app/ThemeProvider.js';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Application root element was not found');
}

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <Suspense fallback={<AppLoading />}>
        <AuthProvider>
          <AuthenticatedApplication />
        </AuthProvider>
      </Suspense>
    </ThemeProvider>
  </StrictMode>,
);
