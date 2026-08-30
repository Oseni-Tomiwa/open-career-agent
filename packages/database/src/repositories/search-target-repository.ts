import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  discoveryMatchId,
  opportunityId,
  searchTargetId,
  type CandidateId,
  type DiscoveryMatchId,
  type DiscoveryRunId,
  type OpportunityId,
  type SearchSourceConfig,
  type SearchTarget,
  type SearchTargetId,
} from '@oca/domain';

import type { DatabaseHandle } from '../client.js';
import {
  discoveryMatches,
  discoveryRuns,
  searchTargets,
  type DiscoveryRunStatus,
} from '../schema.js';

export interface CreateSearchTargetInput {
  name: string;
  enabled?: boolean;
  targetRoles?: string[];
  skills?: string[];
  locations?: string[];
  locationIsHardFilter?: boolean;
  workModels?: ('remote' | 'hybrid' | 'onsite')[];
  workModelIsHardFilter?: boolean;
  seniorityLevels?: ('internship' | 'entry' | 'junior' | 'mid' | 'senior')[];
  seniorityIsHardFilter?: boolean;
  employmentTypes?: ('full-time' | 'contract' | 'internship')[];
  employmentTypeIsHardFilter?: boolean;
  requiresSponsorship?: boolean | null;
  willingToRelocate?: boolean | null;
  minSalary?: number | null;
  currency?: string | null;
  freshnessDays?: number | null;
  requiredTerms?: string[];
  excludedTerms?: string[];
  sources?: SearchSourceConfig[];
}

export interface UpdateSearchTargetInput {
  name?: string;
  enabled?: boolean;
  targetRoles?: string[];
  skills?: string[];
  locations?: string[];
  locationIsHardFilter?: boolean;
  workModels?: ('remote' | 'hybrid' | 'onsite')[];
  workModelIsHardFilter?: boolean;
  seniorityLevels?: ('internship' | 'entry' | 'junior' | 'mid' | 'senior')[];
  seniorityIsHardFilter?: boolean;
  employmentTypes?: ('full-time' | 'contract' | 'internship')[];
  employmentTypeIsHardFilter?: boolean;
  requiresSponsorship?: boolean | null;
  willingToRelocate?: boolean | null;
  minSalary?: number | null;
  currency?: string | null;
  freshnessDays?: number | null;
  requiredTerms?: string[];
  excludedTerms?: string[];
  sources?: SearchSourceConfig[];
}

export interface DiscoveryRunRecord {
  id: string;
  candidateId: string;
  searchTargetId: string;
  sourceSystem: string;
  startedAt: string;
  completedAt: string | null;
  status: DiscoveryRunStatus;
  discoveredCount: number;
  acceptedCount: number;
  rejectedCount: number;
  rejectedByReason?: Record<string, number> | null;
  errorSummary: string | null;
}

export interface DiscoveryMatchRecord {
  id: string;
  candidateId: string;
  searchTargetId: string;
  discoveryRunId: string;
  opportunityId: string;
  sourceListingId: string;
  matchedAt: string;
  matchReasons: string[];
  retainedUnresolved: string[];
}

export class SearchTargetRepository {
  constructor(private readonly handle: DatabaseHandle) {}

  public listSearchTargets(cId: CandidateId): SearchTarget[] {
    const rows = this.handle.db
      .select()
      .from(searchTargets)
      .where(
        and(
          eq(searchTargets.candidateId, cId),
          isNull(searchTargets.archivedAt),
        ),
      )
      .orderBy(desc(searchTargets.createdAt))
      .all();

    return rows.map((row) => this.mapSearchTargetRow(row));
  }

  public getSearchTarget(
    cId: CandidateId,
    tId: SearchTargetId,
  ): SearchTarget | null {
    const row = this.handle.db
      .select()
      .from(searchTargets)
      .where(and(eq(searchTargets.candidateId, cId), eq(searchTargets.id, tId)))
      .get();

    return row ? this.mapSearchTargetRow(row) : null;
  }

  public createSearchTarget(
    cId: CandidateId,
    input: CreateSearchTargetInput,
    idOverride?: SearchTargetId,
  ): SearchTarget {
    const id = idOverride ?? searchTargetId(`st_${crypto.randomUUID()}`);
    const now = new Date();
    const nowIso = now.toISOString();

    const row = {
      id,
      candidateId: cId,
      name: input.name,
      enabled: input.enabled ?? true,
      targetRolesJson: JSON.stringify(input.targetRoles ?? []),
      skillsJson: JSON.stringify(input.skills ?? []),
      locationsJson: JSON.stringify(input.locations ?? []),
      locationIsHardFilter: input.locationIsHardFilter ?? false,
      workModelsJson: JSON.stringify(input.workModels ?? []),
      workModelIsHardFilter: input.workModelIsHardFilter ?? false,
      seniorityLevelsJson: JSON.stringify(input.seniorityLevels ?? []),
      seniorityIsHardFilter: input.seniorityIsHardFilter ?? false,
      employmentTypesJson: JSON.stringify(input.employmentTypes ?? []),
      employmentTypeIsHardFilter: input.employmentTypeIsHardFilter ?? false,
      requiresSponsorship: input.requiresSponsorship ?? null,
      willingToRelocate: input.willingToRelocate ?? null,
      minSalary: input.minSalary ?? null,
      currency: input.currency ?? null,
      freshnessDays: input.freshnessDays ?? 30,
      requiredTermsJson: JSON.stringify(input.requiredTerms ?? []),
      excludedTermsJson: JSON.stringify(input.excludedTerms ?? []),
      sourcesJson: JSON.stringify(
        input.sources ?? [{ sourceSystem: 'greenhouse', boardId: 'figma' }],
      ),
      createdAt: now,
      updatedAt: now,
    };

    this.handle.db.insert(searchTargets).values(row).run();

    return {
      id,
      candidateId: cId,
      name: input.name,
      enabled: row.enabled,
      targetRoles: input.targetRoles ?? [],
      skills: input.skills ?? [],
      locations: input.locations ?? [],
      locationIsHardFilter: row.locationIsHardFilter,
      workModels: input.workModels ?? [],
      workModelIsHardFilter: row.workModelIsHardFilter,
      seniorityLevels: input.seniorityLevels ?? [],
      seniorityIsHardFilter: row.seniorityIsHardFilter,
      employmentTypes: input.employmentTypes ?? [],
      employmentTypeIsHardFilter: row.employmentTypeIsHardFilter,
      requiresSponsorship: row.requiresSponsorship,
      willingToRelocate: row.willingToRelocate,
      minSalary: row.minSalary,
      currency: row.currency,
      freshnessDays: row.freshnessDays,
      requiredTerms: input.requiredTerms ?? [],
      excludedTerms: input.excludedTerms ?? [],
      sources: JSON.parse(row.sourcesJson) as SearchSourceConfig[],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }

  public updateSearchTarget(
    cId: CandidateId,
    tId: SearchTargetId,
    input: UpdateSearchTargetInput,
  ): SearchTarget | null {
    const existing = this.getSearchTarget(cId, tId);
    if (!existing) return null;

    const now = new Date();

    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

    if (input.name !== undefined) updates.name = input.name;
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.targetRoles !== undefined)
      updates.targetRolesJson = JSON.stringify(input.targetRoles);
    if (input.skills !== undefined)
      updates.skillsJson = JSON.stringify(input.skills);
    if (input.locations !== undefined)
      updates.locationsJson = JSON.stringify(input.locations);
    if (input.locationIsHardFilter !== undefined)
      updates.locationIsHardFilter = input.locationIsHardFilter;
    if (input.workModels !== undefined)
      updates.workModelsJson = JSON.stringify(input.workModels);
    if (input.workModelIsHardFilter !== undefined)
      updates.workModelIsHardFilter = input.workModelIsHardFilter;
    if (input.seniorityLevels !== undefined)
      updates.seniorityLevelsJson = JSON.stringify(input.seniorityLevels);
    if (input.seniorityIsHardFilter !== undefined)
      updates.seniorityIsHardFilter = input.seniorityIsHardFilter;
    if (input.employmentTypes !== undefined)
      updates.employmentTypesJson = JSON.stringify(input.employmentTypes);
    if (input.employmentTypeIsHardFilter !== undefined)
      updates.employmentTypeIsHardFilter = input.employmentTypeIsHardFilter;
    if (input.requiresSponsorship !== undefined)
      updates.requiresSponsorship = input.requiresSponsorship;
    if (input.willingToRelocate !== undefined)
      updates.willingToRelocate = input.willingToRelocate;
    if (input.minSalary !== undefined) updates.minSalary = input.minSalary;
    if (input.currency !== undefined) updates.currency = input.currency;
    if (input.freshnessDays !== undefined)
      updates.freshnessDays = input.freshnessDays;
    if (input.requiredTerms !== undefined)
      updates.requiredTermsJson = JSON.stringify(input.requiredTerms);
    if (input.excludedTerms !== undefined)
      updates.excludedTermsJson = JSON.stringify(input.excludedTerms);
    if (input.sources !== undefined)
      updates.sourcesJson = JSON.stringify(input.sources);

    this.handle.db
      .update(searchTargets)
      .set(updates)
      .where(and(eq(searchTargets.candidateId, cId), eq(searchTargets.id, tId)))
      .run();

    return this.getSearchTarget(cId, tId);
  }

  public deleteSearchTarget(cId: CandidateId, tId: SearchTargetId): boolean {
    const now = new Date();
    const res = this.handle.db
      .update(searchTargets)
      .set({ enabled: false, archivedAt: now, updatedAt: now })
      .where(and(eq(searchTargets.candidateId, cId), eq(searchTargets.id, tId)))
      .run();
    return res.changes > 0;
  }

  public createDiscoveryRun(
    runId: DiscoveryRunId,
    cId: CandidateId,
    tId: SearchTargetId,
    sourceSystem = 'greenhouse',
  ): DiscoveryRunRecord {
    const now = new Date();

    const row = {
      id: runId,
      candidateId: cId,
      searchTargetId: tId,
      sourceSystem,
      startedAt: now,
      completedAt: null,
      status: 'PENDING' as DiscoveryRunStatus,
      discoveredCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      rejectedByReasonJson: null,
      errorSummary: null,
    };

    this.handle.db.insert(discoveryRuns).values(row).run();

    return {
      id: runId,
      candidateId: cId,
      searchTargetId: tId,
      sourceSystem,
      startedAt: now.toISOString(),
      completedAt: null,
      status: 'PENDING',
      discoveredCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      rejectedByReason: null,
      errorSummary: null,
    };
  }

  public updateDiscoveryRun(
    runId: DiscoveryRunId,
    updates: {
      status?: DiscoveryRunStatus;
      discoveredCount?: number;
      acceptedCount?: number;
      rejectedCount?: number;
      rejectedByReason?: Record<string, number>;
      errorSummary?: string | null;
      completedAt?: Date | null;
    },
  ): DiscoveryRunRecord | null {
    const setObj: Record<string, unknown> = {};
    if (updates.status !== undefined) setObj.status = updates.status;
    if (updates.discoveredCount !== undefined)
      setObj.discoveredCount = updates.discoveredCount;
    if (updates.acceptedCount !== undefined)
      setObj.acceptedCount = updates.acceptedCount;
    if (updates.rejectedCount !== undefined)
      setObj.rejectedCount = updates.rejectedCount;
    if (updates.rejectedByReason !== undefined)
      setObj.rejectedByReasonJson = JSON.stringify(updates.rejectedByReason);
    if (updates.errorSummary !== undefined)
      setObj.errorSummary = updates.errorSummary;
    if (updates.completedAt !== undefined)
      setObj.completedAt = updates.completedAt;

    this.handle.db
      .update(discoveryRuns)
      .set(setObj)
      .where(eq(discoveryRuns.id, runId))
      .run();

    const row = this.handle.db
      .select()
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, runId))
      .get();

    return row ? this.mapDiscoveryRunRow(row) : null;
  }

  public listDiscoveryRuns(cId: CandidateId, limit = 20): DiscoveryRunRecord[] {
    const rows = this.handle.db
      .select()
      .from(discoveryRuns)
      .where(eq(discoveryRuns.candidateId, cId))
      .orderBy(desc(discoveryRuns.startedAt))
      .limit(limit)
      .all();

    return rows.map((row) => this.mapDiscoveryRunRow(row));
  }

  public getDiscoveryRun(runId: DiscoveryRunId): DiscoveryRunRecord | null {
    const row = this.handle.db
      .select()
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, runId))
      .get();

    return row ? this.mapDiscoveryRunRow(row) : null;
  }

  public recordDiscoveryMatch(input: {
    id?: DiscoveryMatchId;
    candidateId: CandidateId;
    searchTargetId: SearchTargetId;
    discoveryRunId: DiscoveryRunId;
    opportunityId: OpportunityId;
    sourceListingId: string;
    matchReasons: string[];
    retainedUnresolved: string[];
  }): DiscoveryMatchRecord {
    const id = input.id ?? discoveryMatchId(`dm_${crypto.randomUUID()}`);
    const now = new Date();

    const row = {
      id,
      candidateId: input.candidateId,
      searchTargetId: input.searchTargetId,
      discoveryRunId: input.discoveryRunId,
      opportunityId: input.opportunityId,
      sourceListingId: input.sourceListingId,
      matchedAt: now,
      matchReasonsJson: JSON.stringify(input.matchReasons),
      retainedUnresolvedJson: JSON.stringify(input.retainedUnresolved),
    };

    this.handle.db
      .insert(discoveryMatches)
      .values(row)
      .onConflictDoNothing()
      .run();

    return {
      id,
      candidateId: input.candidateId,
      searchTargetId: input.searchTargetId,
      discoveryRunId: input.discoveryRunId,
      opportunityId: input.opportunityId,
      sourceListingId: input.sourceListingId,
      matchedAt: now.toISOString(),
      matchReasons: input.matchReasons,
      retainedUnresolved: input.retainedUnresolved,
    };
  }

  public getMatchedOpportunityIds(cId: CandidateId): OpportunityId[] {
    const rows = this.handle.db
      .select({ opportunityId: discoveryMatches.opportunityId })
      .from(discoveryMatches)
      .where(eq(discoveryMatches.candidateId, cId))
      .all();

    return rows.map((row) => opportunityId(row.opportunityId));
  }

  public listDiscoveryMatches(cId: CandidateId): DiscoveryMatchRecord[] {
    const rows = this.handle.db
      .select()
      .from(discoveryMatches)
      .where(eq(discoveryMatches.candidateId, cId))
      .orderBy(desc(discoveryMatches.matchedAt))
      .all();

    return rows.map((row) => ({
      id: row.id,
      candidateId: row.candidateId,
      searchTargetId: row.searchTargetId,
      discoveryRunId: row.discoveryRunId,
      opportunityId: row.opportunityId,
      sourceListingId: row.sourceListingId,
      matchedAt: new Date(row.matchedAt).toISOString(),
      matchReasons: JSON.parse(row.matchReasonsJson) as string[],
      retainedUnresolved: JSON.parse(row.retainedUnresolvedJson) as string[],
    }));
  }

  private mapSearchTargetRow(
    row: typeof searchTargets.$inferSelect,
  ): SearchTarget {
    return {
      id: row.id,
      candidateId: row.candidateId,
      name: row.name,
      enabled: Boolean(row.enabled),
      targetRoles: JSON.parse(row.targetRolesJson) as string[],
      skills: JSON.parse(row.skillsJson) as string[],
      locations: JSON.parse(row.locationsJson) as string[],
      locationIsHardFilter: Boolean(row.locationIsHardFilter),
      workModels: JSON.parse(row.workModelsJson) as SearchTarget['workModels'],
      workModelIsHardFilter: Boolean(row.workModelIsHardFilter),
      seniorityLevels: JSON.parse(
        row.seniorityLevelsJson,
      ) as SearchTarget['seniorityLevels'],
      seniorityIsHardFilter: Boolean(row.seniorityIsHardFilter),
      employmentTypes: JSON.parse(
        row.employmentTypesJson,
      ) as SearchTarget['employmentTypes'],
      employmentTypeIsHardFilter: Boolean(row.employmentTypeIsHardFilter),
      requiresSponsorship:
        row.requiresSponsorship === null
          ? null
          : Boolean(row.requiresSponsorship),
      willingToRelocate:
        row.willingToRelocate === null ? null : Boolean(row.willingToRelocate),
      minSalary: row.minSalary,
      currency: row.currency,
      freshnessDays: row.freshnessDays,
      requiredTerms: JSON.parse(row.requiredTermsJson) as string[],
      excludedTerms: JSON.parse(row.excludedTermsJson) as string[],
      sources: JSON.parse(row.sourcesJson) as SearchSourceConfig[],
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
      archivedAt: row.archivedAt
        ? new Date(row.archivedAt).toISOString()
        : null,
    };
  }

  private mapDiscoveryRunRow(
    row: typeof discoveryRuns.$inferSelect,
  ): DiscoveryRunRecord {
    return {
      id: row.id,
      candidateId: row.candidateId,
      searchTargetId: row.searchTargetId,
      sourceSystem: row.sourceSystem,
      startedAt: new Date(row.startedAt).toISOString(),
      completedAt: row.completedAt
        ? new Date(row.completedAt).toISOString()
        : null,
      status: row.status,
      discoveredCount: row.discoveredCount,
      acceptedCount: row.acceptedCount,
      rejectedCount: row.rejectedCount,
      rejectedByReason: row.rejectedByReasonJson
        ? (JSON.parse(row.rejectedByReasonJson) as Record<string, number>)
        : null,
      errorSummary: row.errorSummary,
    };
  }
}
