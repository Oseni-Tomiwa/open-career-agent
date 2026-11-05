import { useMemo } from 'react';
import { RouterProvider } from 'react-router-dom';

import { browserConfig } from '../config.js';
import { ApiProductRepository } from '../data/apiProductRepository.js';
import { router } from '../router.js';
import { useAuth } from './authContext.js';
import { ProductDataProvider } from './ProductDataProvider.js';

const cookieCredentials = () => ({ credentials: 'include' as const });

export function AuthenticatedApplication() {
  const auth = useAuth();
  const repository = useMemo(
    () =>
      browserConfig.productDataSource === 'api' && auth.candidateId
        ? new ApiProductRepository(
            browserConfig.apiBaseUrl,
            auth.candidateId,
            (...args) => fetch(...args),
            auth.cloud ? cookieCredentials : undefined,
          )
        : undefined,
    [auth.candidateId, auth.cloud],
  );

  return (
    <ProductDataProvider
      key={`${browserConfig.productDataSource}:${browserConfig.deploymentMode}:${auth.candidateId ?? 'demo'}`}
      {...(repository ? { repository } : {})}
    >
      <RouterProvider router={router} />
    </ProductDataProvider>
  );
}
