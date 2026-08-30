import { render, type RenderResult } from '@testing-library/react';
import { Suspense, type ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { ProductDataProvider } from '../app/ProductDataProvider.js';
import type { ProductRepository } from '../data/types.js';
import { ThemeProvider } from '../app/ThemeProvider.js';

export function renderProduct(
  element: ReactElement,
  initialEntries: readonly string[] = ['/'],
  repository?: ProductRepository,
): RenderResult {
  return render(
    <ThemeProvider>
      <Suspense fallback={<div role="status">Loading test data</div>}>
        <ProductDataProvider {...(repository ? { repository } : {})}>
          <MemoryRouter initialEntries={[...initialEntries]}>
            {element}
          </MemoryRouter>
        </ProductDataProvider>
      </Suspense>
    </ThemeProvider>,
  );
}
