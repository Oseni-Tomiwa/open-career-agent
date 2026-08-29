import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { AppLoading } from './AppLoading.js';
import { SeedProductRepository } from '../data/seedRepository.js';
import type {
  Decision,
  ProductRepository,
  ProductSnapshot,
  SearchPreferences,
} from '../data/types.js';

interface ProductDataContextValue {
  readonly snapshot: ProductSnapshot;
  readonly updateDecision: (
    opportunityId: string,
    decision: Decision,
  ) => Promise<void>;
  readonly saveSearchPreferences: (
    preferences: SearchPreferences,
  ) => Promise<void>;
}

const ProductDataContext = createContext<ProductDataContextValue | null>(null);

export function ProductDataProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [repository] = useState<ProductRepository>(
    () => new SeedProductRepository(),
  );
  const [snapshot, setSnapshot] = useState<ProductSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    void repository.getSnapshot().then((value) => {
      if (active) setSnapshot(value);
    });
    return () => {
      active = false;
    };
  }, [repository]);

  const updateDecision = useCallback(
    async (opportunityId: string, decision: Decision) => {
      const nextPromise = repository.setOpportunityDecision(
        opportunityId,
        decision,
      );
      setSnapshot(await nextPromise);
    },
    [repository],
  );

  const saveSearchPreferences = useCallback(
    async (preferences: SearchPreferences) => {
      const nextPromise = repository.saveSearchPreferences(preferences);
      setSnapshot(await nextPromise);
    },
    [repository],
  );

  const value = useMemo<ProductDataContextValue | null>(
    () =>
      snapshot ? { snapshot, updateDecision, saveSearchPreferences } : null,
    [snapshot, updateDecision, saveSearchPreferences],
  );

  if (!value) return <AppLoading />;

  return (
    <ProductDataContext.Provider value={value}>
      {children}
    </ProductDataContext.Provider>
  );
}

export function useProductData(): ProductDataContextValue {
  const value = use(ProductDataContext);
  if (!value) {
    throw new Error('useProductData must be used inside ProductDataProvider');
  }
  return value;
}
