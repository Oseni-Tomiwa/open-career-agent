import { RouterProvider } from 'react-router-dom';

import { browserConfig } from '../config.js';
import { ApiProductRepository } from '../data/apiProductRepository.js';
import { router } from '../router.js';
import { useAuth } from './authContext.js';
import { ProductDataProvider } from './ProductDataProvider.js';

const cookieCredentials = () => ({ credentials: 'include' as const });

export function AuthenticatedApplication() {
  const auth = useAuth();
  const repository =
    auth.cloud && auth.candidateId
      ? new ApiProductRepository(
          browserConfig.apiBaseUrl,
          auth.candidateId,
          (...args) => fetch(...args),
          cookieCredentials,
        )
      : undefined;

  return (
    <ProductDataProvider {...(repository ? { repository } : {})}>
      <RouterProvider router={router} />
    </ProductDataProvider>
  );
}
