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
import { browserConfig } from '../config.js';
import { ApiProductRepository } from '../data/apiProductRepository.js';
import { SeedProductRepository } from '../data/seedRepository.js';
import type {
  CandidateClaimState,
  CareerMemoryProfile,
  CreateCandidateClaimInput,
  Decision,
  ManualEvidenceInput,
  Opportunity,
  ProductRepository,
  ProductSnapshot,
  SearchPreferences,
  UpdateCandidateClaimInput,
} from '../data/types.js';

interface ProductDataContextValue {
  readonly snapshot: ProductSnapshot;
  readonly dataSource: 'seed' | 'api';
  readonly loadOpportunity: (
    opportunityId: string,
    signal?: AbortSignal,
  ) => Promise<Opportunity | null>;
  readonly updateDecision: (
    opportunityId: string,
    decision: Decision,
  ) => Promise<void>;
  readonly saveSearchPreferences: (
    preferences: SearchPreferences,
  ) => Promise<void>;
  readonly getCareerMemory: () => Promise<CareerMemoryProfile>;
  readonly createCandidateClaim: (
    input: CreateCandidateClaimInput,
  ) => Promise<CareerMemoryProfile>;
  readonly updateCandidateClaim: (
    claimId: string,
    input: UpdateCandidateClaimInput,
  ) => Promise<CareerMemoryProfile>;
  readonly attachClaimEvidence: (
    claimId: string,
    evidence: ManualEvidenceInput,
    transitionTo?: CandidateClaimState,
  ) => Promise<CareerMemoryProfile>;
}

const ProductDataContext = createContext<ProductDataContextValue | null>(null);

export function ProductDataProvider({
  children,
  repository: suppliedRepository,
}: {
  readonly children: ReactNode;
  readonly repository?: ProductRepository;
}) {
  const [repository] = useState<ProductRepository>(
    () =>
      suppliedRepository ??
      (browserConfig.productDataSource === 'api'
        ? new ApiProductRepository()
        : new SeedProductRepository()),
  );
  const [snapshot, setSnapshot] = useState<ProductSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void repository
      .getSnapshot()
      .then((value) => {
        if (active) setSnapshot(value);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'Product data failed to load.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [repository, loadAttempt]);

  const loadOpportunity = useCallback(
    async (opportunityId: string, signal?: AbortSignal) => {
      const opportunity = await repository.getOpportunity(
        opportunityId,
        signal,
      );
      if (opportunity && !signal?.aborted) {
        setSnapshot((current) =>
          current
            ? {
                ...current,
                opportunities: current.opportunities.some(
                  (item) => item.id === opportunity.id,
                )
                  ? current.opportunities.map((item) =>
                      item.id === opportunity.id ? opportunity : item,
                    )
                  : [...current.opportunities, opportunity],
              }
            : current,
        );
      }
      return opportunity;
    },
    [repository],
  );

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

  const getCareerMemory = useCallback(
    () => repository.getCareerMemory(),
    [repository],
  );

  const createCandidateClaim = useCallback(
    (input: CreateCandidateClaimInput) =>
      repository.createCandidateClaim(input),
    [repository],
  );

  const updateCandidateClaim = useCallback(
    (claimId: string, input: UpdateCandidateClaimInput) =>
      repository.updateCandidateClaim(claimId, input),
    [repository],
  );

  const attachClaimEvidence = useCallback(
    (
      claimId: string,
      evidence: ManualEvidenceInput,
      transitionTo?: CandidateClaimState,
    ) => repository.attachClaimEvidence(claimId, evidence, transitionTo),
    [repository],
  );

  const value = useMemo<ProductDataContextValue | null>(
    () =>
      snapshot
        ? {
            snapshot,
            dataSource: repository.dataSource,
            loadOpportunity,
            updateDecision,
            saveSearchPreferences,
            getCareerMemory,
            createCandidateClaim,
            updateCandidateClaim,
            attachClaimEvidence,
          }
        : null,
    [
      loadOpportunity,
      attachClaimEvidence,
      createCandidateClaim,
      getCareerMemory,
      repository.dataSource,
      snapshot,
      updateDecision,
      updateCandidateClaim,
      saveSearchPreferences,
    ],
  );

  if (loadError) {
    return (
      <main className="app-load-error" role="alert">
        <h1>Opportunity data could not be loaded</h1>
        <p>{loadError}</p>
        <button
          onClick={() => {
            setLoadError(null);
            setLoadAttempt((attempt) => attempt + 1);
          }}
          type="button"
        >
          Try again
        </button>
      </main>
    );
  }
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
