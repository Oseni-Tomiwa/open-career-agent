import { render, type RenderResult } from '@testing-library/react';
import { Suspense, type ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { ProductDataProvider } from '../app/ProductDataProvider.js';
import { ThemeProvider } from '../app/ThemeProvider.js';

export function renderProduct(
  element: ReactElement,
  initialEntries: readonly string[] = ['/'],
): RenderResult {
  return render(
    <ThemeProvider>
      <Suspense fallback={<div role="status">Loading test data</div>}>
        <ProductDataProvider>
          <MemoryRouter initialEntries={[...initialEntries]}>
            {element}
          </MemoryRouter>
        </ProductDataProvider>
      </Suspense>
    </ThemeProvider>,
  );
}
