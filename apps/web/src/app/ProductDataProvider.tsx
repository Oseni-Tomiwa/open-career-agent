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
  CreateSearchTargetInput,
  UpdateSearchTargetInput,
  SearchTarget,
  DiscoveryRun,
  UpdateCandidateClaimInput,
  TodayDashboardResponse,
  CareerSignalsResponse,
  ApplicationItem,
  ApplicationDetailResponse,
  CreateApplicationInput,
  UpdateApplicationInput,
  AddApplicationEventInput,
} from '../data/types.js';

interface ProductDataContextValue {
  readonly snapshot: ProductSnapshot;
  readonly dataSource: 'seed' | 'api';
  readonly repository: ProductRepository;
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
  readonly getSearchTargets: () => Promise<readonly SearchTarget[]>;
  readonly createSearchTarget: (
    input: CreateSearchTargetInput,
  ) => Promise<SearchTarget>;
  readonly updateSearchTarget: (
    targetId: string,
    input: UpdateSearchTargetInput,
  ) => Promise<SearchTarget>;
  readonly deleteSearchTarget: (targetId: string) => Promise<boolean>;
  readonly runDiscovery: (
    targetId: string,
  ) => Promise<{ run: DiscoveryRun; taskEnqueued: boolean }>;
  readonly getDiscoveryRuns: () => Promise<readonly DiscoveryRun[]>;
  readonly getTodayDashboard: (
    timeWindowDays?: number,
    signal?: AbortSignal,
  ) => Promise<TodayDashboardResponse>;
  readonly getCareerSignals: (
    signal?: AbortSignal,
  ) => Promise<CareerSignalsResponse>;
  readonly getApplications: (
    signal?: AbortSignal,
  ) => Promise<readonly ApplicationItem[]>;
  readonly getApplication: (
    applicationId: string,
    signal?: AbortSignal,
  ) => Promise<ApplicationDetailResponse | null>;
  readonly createApplication: (
    input: CreateApplicationInput,
  ) => Promise<ApplicationDetailResponse>;
  readonly updateApplication: (
    applicationId: string,
    input: UpdateApplicationInput,
  ) => Promise<ApplicationDetailResponse>;
  readonly addApplicationEvent: (
    applicationId: string,
    input: AddApplicationEventInput,
  ) => Promise<ApplicationDetailResponse>;
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

  const getSearchTargets = useCallback(
    () => repository.getSearchTargets(),
    [repository],
  );

  const createSearchTarget = useCallback(
    (input: CreateSearchTargetInput) => repository.createSearchTarget(input),
    [repository],
  );

  const updateSearchTarget = useCallback(
    (targetId: string, input: UpdateSearchTargetInput) =>
      repository.updateSearchTarget(targetId, input),
    [repository],
  );

  const deleteSearchTarget = useCallback(
    (targetId: string) => repository.deleteSearchTarget(targetId),
    [repository],
  );

  const runDiscovery = useCallback(
    (targetId: string) => repository.runDiscovery(targetId),
    [repository],
  );

  const getDiscoveryRuns = useCallback(
    () => repository.getDiscoveryRuns(),
    [repository],
  );

  const getTodayDashboard = useCallback(
    (timeWindowDays?: number, signal?: AbortSignal) =>
      repository.getTodayDashboard(timeWindowDays, signal),
    [repository],
  );

  const getCareerSignals = useCallback(
    (signal?: AbortSignal) => repository.getCareerSignals(signal),
    [repository],
  );

  const getApplications = useCallback(
    (signal?: AbortSignal) => repository.getApplications(signal),
    [repository],
  );

  const getApplication = useCallback(
    (applicationId: string, signal?: AbortSignal) =>
      repository.getApplication(applicationId, signal),
    [repository],
  );

  const createApplication = useCallback(
    (input: CreateApplicationInput) => repository.createApplication(input),
    [repository],
  );

  const updateApplication = useCallback(
    (applicationId: string, input: UpdateApplicationInput) =>
      repository.updateApplication(applicationId, input),
    [repository],
  );

  const addApplicationEvent = useCallback(
    (applicationId: string, input: AddApplicationEventInput) =>
      repository.addApplicationEvent(applicationId, input),
    [repository],
  );

  const value = useMemo<ProductDataContextValue | null>(
    () =>
      snapshot
        ? {
            snapshot,
            dataSource: repository.dataSource,
            repository,
            loadOpportunity,
            updateDecision,
            saveSearchPreferences,
            getCareerMemory,
            createCandidateClaim,
            updateCandidateClaim,
            attachClaimEvidence,
            getSearchTargets,
            createSearchTarget,
            updateSearchTarget,
            deleteSearchTarget,
            runDiscovery,
            getDiscoveryRuns,
            getTodayDashboard,
            getCareerSignals,
            getApplications,
            getApplication,
            createApplication,
            updateApplication,
            addApplicationEvent,
          }
        : null,
    [
      loadOpportunity,
      attachClaimEvidence,
      createCandidateClaim,
      getCareerMemory,
      repository,
      snapshot,
      updateDecision,
      updateCandidateClaim,
      saveSearchPreferences,
      getSearchTargets,
      createSearchTarget,
      updateSearchTarget,
      deleteSearchTarget,
      runDiscovery,
      getDiscoveryRuns,
      getTodayDashboard,
      getCareerSignals,
      getApplications,
      getApplication,
      createApplication,
      updateApplication,
      addApplicationEvent,
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
