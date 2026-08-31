import {
  opportunityId,
  snapshotId,
  evaluationId,
  searchTargetId,
  applicationId,
  type CandidateId,
} from '@oca/domain';
import type {
  TodayDashboardResponse,
  PriorityOpportunityItem,
  NeedsAttentionItem,
  RecentChangeItem,
  DiscoveryActivityItem,
  CareerMemoryAttentionItem,
  ApplicationActivityItem,
} from '@oca/schemas';

import type { DatabaseHandle } from '../client.js';
import { ApplicationRepository } from './application-repository.js';
import { CareerMemoryRepository } from './career-memory-repository.js';
import { EvaluationRepository } from './evaluation-repository.js';
import { OpportunityRepository } from './opportunity-repository.js';
import { SearchTargetRepository } from './search-target-repository.js';

export interface TodayDashboardOptions {
  now?: Date;
  timeWindowDays?: number;
}

function deriveGreetingName(cId: string): string {
  const lower = cId.toLowerCase();
  if (lower.includes('alex')) return 'Alex';
  if (lower.includes('jordan')) return 'Jordan';
  if (lower.includes('sam')) return 'Sam';
  return 'there';
}

function parseReasonCodes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function toIso(dateOrMs: Date | number | string | null | undefined): string {
  if (!dateOrMs) return new Date().toISOString();
  return new Date(dateOrMs).toISOString();
}

export class TodayRepository {
  private readonly oppRepo: OpportunityRepository;
  private readonly evalRepo: EvaluationRepository;
  private readonly memoryRepo: CareerMemoryRepository;
  private readonly searchRepo: SearchTargetRepository;
  private readonly appRepo: ApplicationRepository;

  public constructor(handle: DatabaseHandle) {
    this.oppRepo = new OpportunityRepository(handle);
    this.evalRepo = new EvaluationRepository(handle);
    this.memoryRepo = new CareerMemoryRepository(handle);
    this.searchRepo = new SearchTargetRepository(handle);
    this.appRepo = new ApplicationRepository(handle);
  }

  public getTodayDashboard(
    cId: CandidateId,
    options: TodayDashboardOptions = {},
  ): TodayDashboardResponse {
    const now = options.now ?? new Date();
    const timeWindowDays = options.timeWindowDays ?? 7;
    const sinceMs = now.getTime() - timeWindowDays * 86400000;

    const profile = this.memoryRepo.getProfile(cId);
    const greetingName = deriveGreetingName(cId);

    const matchedOppIds = this.searchRepo.getMatchedOpportunityIds(cId);
    const candidateApplications = this.appRepo.listApplications(cId);
    const appMap = new Map(
      candidateApplications.map((app) => [app.opportunityId, app]),
    );

    // 1. Priority Opportunities & Needs Attention
    const priorityItems: PriorityOpportunityItem[] = [];
    const attentionItems: NeedsAttentionItem[] = [];
    const decisionHistoryChanges: RecentChangeItem[] = [];

    for (const oppIdStr of matchedOppIds) {
      const oppId = opportunityId(oppIdStr);
      const snapshot = this.oppRepo.getLatestSnapshot(oppId);
      if (!snapshot) continue;

      const evalRecord = this.evalRepo.getCurrentEvaluation(
        cId,
        snapshotId(snapshot.id),
      );
      if (!evalRecord) continue;

      const decision = this.evalRepo.getCurrentDecisionForEvaluation(
        evaluationId(evalRecord.id),
      );

      const existingApp = appMap.get(oppIdStr);
      const reasonCodes = parseReasonCodes(decision?.reasonCodes);

      // Check Priority Opportunities
      if (decision?.priority === 'high-priority') {
        priorityItems.push({
          opportunityId: oppIdStr,
          title: snapshot.title,
          organization: snapshot.organization ?? null,
          location: snapshot.location ?? null,
          decisionState: 'high-priority',
          action: decision.action ?? 'apply',
          explanation: decision.explanation,
          observedAt: toIso(decision.evaluatedAt),
          reasonCodes,
          freshnessBucket: evalRecord.qualityFreshnessBucket ?? null,
          applicationStatus: existingApp ? existingApp.status : 'not_started',
        });
      }

      // Check Needs Attention
      if (decision?.priority === 'investigate') {
        attentionItems.push({
          opportunityId: oppIdStr,
          title: snapshot.title,
          organization: snapshot.organization ?? null,
          category: 'investigate',
          titleOrSummary: `Eligibility investigation required: ${snapshot.title}`,
          explanation: decision.explanation,
          nextAction:
            'Review eligibility details and verify missing candidate claims',
          eligibilityState: evalRecord.eligibilityState ?? null,
          decisionState: 'investigate',
          reasonCodes,
        });
      } else if (decision?.priority === 'blocked') {
        const isClosed = reasonCodes.includes('LISTING_CLOSED');
        const category = isClosed ? 'blocked_closed' : 'blocked_ineligible';
        const titleOrSummary = isClosed
          ? `Listing closed: ${snapshot.title}`
          : `Eligibility blocker confirmed: ${snapshot.title}`;
        const nextAction = isClosed
          ? 'Archive or monitor company careers page'
          : 'Inspect blocker evidence and Career Memory';

        attentionItems.push({
          opportunityId: oppIdStr,
          title: snapshot.title,
          organization: snapshot.organization ?? null,
          category,
          titleOrSummary,
          explanation: decision.explanation,
          nextAction,
          eligibilityState: evalRecord.eligibilityState ?? null,
          decisionState: 'blocked',
          reasonCodes,
        });
      } else if (evalRecord.qualityFreshnessBucket === 'stale') {
        attentionItems.push({
          opportunityId: oppIdStr,
          title: snapshot.title,
          organization: snapshot.organization ?? null,
          category: 'stale_listing',
          titleOrSummary: `Listing stale (>60 days old): ${snapshot.title}`,
          explanation: 'Source listing has exceeded the freshness threshold',
          nextAction: 'Verify active listing status on employer career portal',
          eligibilityState: evalRecord.eligibilityState ?? null,
          decisionState: decision?.priority ?? null,
          reasonCodes,
        });
      } else if (evalRecord.qualityLevel === 'risk') {
        attentionItems.push({
          opportunityId: oppIdStr,
          title: snapshot.title,
          organization: snapshot.organization ?? null,
          category: 'quality_risk',
          titleOrSummary: `Material quality risk: ${snapshot.title}`,
          explanation:
            evalRecord.qualitySummary ?? 'Quality risk identified for listing',
          nextAction: 'Inspect source listing quality details',
          eligibilityState: evalRecord.eligibilityState ?? null,
          decisionState: decision?.priority ?? null,
          reasonCodes,
        });
      }

      // Check Decision History Transitions
      const decisionHistory = this.evalRepo.getDecisionHistoryForCandidate(
        cId,
        oppId,
      );
      if (decisionHistory.length >= 2) {
        const currentDec = decisionHistory[0]!;
        const prevDec = decisionHistory[1]!;
        const curDateMs = currentDec.evaluatedAt
          ? new Date(currentDec.evaluatedAt).getTime()
          : 0;
        if (curDateMs >= sinceMs && currentDec.priority !== prevDec.priority) {
          decisionHistoryChanges.push({
            opportunityId: oppIdStr,
            title: snapshot.title,
            organization: snapshot.organization ?? null,
            changeType: 'decision_changed',
            headline: `Decision changed from ${prevDec.priority} to ${currentDec.priority}`,
            detail: currentDec.explanation,
            occurredAt: toIso(currentDec.evaluatedAt),
          });
        }
      }
    }

    // 2. Recent Discoveries
    const discoveryMatches = this.searchRepo.listDiscoveryMatches(cId);
    const discoveryChanges: RecentChangeItem[] = [];
    for (const match of discoveryMatches) {
      const matchDate = new Date(match.matchedAt);
      if (matchDate.getTime() >= sinceMs) {
        const oppId = opportunityId(match.opportunityId);
        const snapshot = this.oppRepo.getLatestSnapshot(oppId);
        discoveryChanges.push({
          opportunityId: match.opportunityId,
          title: snapshot?.title ?? 'Opportunity',
          organization: snapshot?.organization ?? null,
          changeType: 'newly_discovered',
          headline: `New opportunity discovered: ${snapshot?.title ?? 'Role'}`,
          detail: `Discovered from source listing ${match.sourceListingId}`,
          occurredAt: matchDate.toISOString(),
        });
      }
    }

    const allRecentChanges = [
      ...decisionHistoryChanges,
      ...discoveryChanges,
    ].sort((a, b) => {
      const timeDiff =
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.opportunityId.localeCompare(b.opportunityId);
    });

    // 3. Discovery Activity
    const runs = this.searchRepo.listDiscoveryRuns(cId);
    const discoveryActivity: DiscoveryActivityItem[] = runs
      .filter((r) => new Date(r.startedAt).getTime() >= sinceMs)
      .slice(0, 5)
      .map((r) => {
        const target = this.searchRepo.getSearchTarget(
          cId,
          searchTargetId(r.searchTargetId),
        );
        return {
          runId: r.id,
          searchTargetId: r.searchTargetId,
          searchTargetName: target?.name ?? 'Search Target',
          sourceSystem: r.sourceSystem,
          status: r.status,
          startedAt: toIso(r.startedAt),
          completedAt: r.completedAt ? toIso(r.completedAt) : null,
          discoveredCount: r.discoveredCount,
          acceptedCount: r.acceptedCount,
          rejectedCount: r.rejectedCount,
          errorSummary: r.errorSummary,
        };
      })
      .sort((a, b) => {
        const timeDiff =
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.runId.localeCompare(b.runId);
      });

    // 4. Career Memory Attention
    const memoryAttentionItems: CareerMemoryAttentionItem[] = [];
    if (profile) {
      const attentionClaims = profile.claims.filter(
        (c) => c.state === 'UNKNOWN' || c.state === 'CONFLICTING',
      );

      for (const claim of attentionClaims) {
        const affectedOppIds: string[] = [];
        for (const oppIdStr of matchedOppIds) {
          const snapshot = this.oppRepo.getLatestSnapshot(
            opportunityId(oppIdStr),
          );
          if (!snapshot) continue;
          const evalRecord = this.evalRepo.getCurrentEvaluation(
            cId,
            snapshotId(snapshot.id),
          );
          if (!evalRecord) continue;
          const findings = this.evalRepo.getFindings(
            evaluationId(evalRecord.id),
          );
          const hasUnresolvedFinding = findings.some(
            (f) =>
              (f.state === 'UNRESOLVED' || f.state === 'NO_EVIDENCE') &&
              f.dimensionKey.toLowerCase().includes(claim.kind.toLowerCase()),
          );
          if (hasUnresolvedFinding) {
            affectedOppIds.push(oppIdStr);
          }
        }

        const affectedCount = affectedOppIds.length;
        if (affectedCount > 0) {
          const kindTitle = claim.kind
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');

          memoryAttentionItems.push({
            claimKind: claim.kind,
            claimId: claim.id,
            headline: `${kindTitle} is unresolved for ${affectedCount} current ${affectedCount === 1 ? 'opportunity' : 'opportunities'}`,
            explanation: `Career Memory claim state is ${claim.state}. Providing evidence will resolve eligibility across active opportunities.`,
            affectedOpportunityCount: affectedCount,
            affectedOpportunityIds: affectedOppIds,
          });
        }
      }

      memoryAttentionItems.sort((a, b) => {
        const diff = b.affectedOpportunityCount - a.affectedOpportunityCount;
        if (diff !== 0) return diff;
        return a.claimKind.localeCompare(b.claimKind);
      });
    }

    // 5. Application Activity
    const appActivityItems: ApplicationActivityItem[] = [];
    for (const app of candidateApplications) {
      const snapshot = this.oppRepo.getLatestSnapshot(
        opportunityId(app.opportunityId),
      );
      const events = this.appRepo.getEvents(cId, applicationId(app.id));
      const lastEvent = events.length > 0 ? events[events.length - 1] : null;
      const lastEventAt = lastEvent
        ? toIso(lastEvent.occurredAt)
        : toIso(app.updatedAt);

      appActivityItems.push({
        applicationId: app.id,
        opportunityId: app.opportunityId,
        title: snapshot?.title ?? 'Opportunity',
        organization: snapshot?.organization ?? null,
        status: app.status,
        lastEventAt,
        nextAction:
          app.followUpDueAt && !app.followUpCompletedAt
            ? (app.followUpNote ??
              `Follow up on ${app.status.toLowerCase()} status`)
            : `Follow up on ${app.status.toLowerCase()} status`,
        dueDate:
          app.followUpDueAt && !app.followUpCompletedAt
            ? app.followUpDueAt.toISOString()
            : null,
      });
    }

    for (const prio of priorityItems) {
      if (!appMap.has(prio.opportunityId)) {
        appActivityItems.push({
          applicationId: null,
          opportunityId: prio.opportunityId,
          title: prio.title,
          organization: prio.organization,
          status: 'not_started',
          lastEventAt: null,
          nextAction: 'Start application preparing flow',
          dueDate: null,
        });
      }
    }

    const statusWeight: Record<string, number> = {
      Interview: 1,
      Offer: 2,
      Assessment: 3,
      Preparing: 4,
      Applied: 5,
      not_started: 6,
      Rejected: 7,
      Withdrawn: 8,
    };

    appActivityItems.sort((a, b) => {
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      if (a.dueDate && b.dueDate) {
        const dueDiff =
          new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        if (dueDiff !== 0) return dueDiff;
      }
      const weightA = statusWeight[a.status] ?? 99;
      const weightB = statusWeight[b.status] ?? 99;
      if (weightA !== weightB) return weightA - weightB;
      const timeA = a.lastEventAt ? new Date(a.lastEventAt).getTime() : 0;
      const timeB = b.lastEventAt ? new Date(b.lastEventAt).getTime() : 0;
      if (timeB !== timeA) return timeB - timeA;
      return a.opportunityId.localeCompare(b.opportunityId);
    });

    // Sort Priority Opportunities deterministically
    priorityItems.sort((a, b) => {
      const timeDiff =
        new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.opportunityId.localeCompare(b.opportunityId);
    });

    // Sort Needs Attention deterministically
    const categoryWeight: Record<string, number> = {
      blocked_closed: 1,
      blocked_ineligible: 2,
      investigate: 3,
      quality_risk: 4,
      stale_listing: 5,
      unresolved_eligibility: 6,
    };

    attentionItems.sort((a, b) => {
      const weightA = categoryWeight[a.category] ?? 99;
      const weightB = categoryWeight[b.category] ?? 99;
      if (weightA !== weightB) return weightA - weightB;
      return a.opportunityId.localeCompare(b.opportunityId);
    });

    // Summary Text Generation
    const priorityCount = priorityItems.length;
    const attentionCount = attentionItems.length;
    let summaryText = 'No high-priority opportunities right now.';
    if (priorityCount > 0 && attentionCount > 0) {
      summaryText = `${priorityCount} priority ${priorityCount === 1 ? 'opportunity' : 'opportunities'} ready for action, while ${attentionCount} ${attentionCount === 1 ? 'item needs' : 'items need'} review.`;
    } else if (priorityCount > 0 && attentionCount === 0) {
      summaryText = `${priorityCount} priority ${priorityCount === 1 ? 'opportunity' : 'opportunities'} ready for action.`;
    } else if (priorityCount === 0 && attentionCount > 0) {
      summaryText = `No high-priority opportunities right now; ${attentionCount} ${attentionCount === 1 ? 'item needs' : 'items need'} review.`;
    }

    return {
      generatedAt: now.toISOString(),
      greetingName,
      summaryText,
      timeWindowDays,
      priorityOpportunities: priorityItems.slice(0, 5),
      needsAttention: attentionItems.slice(0, 5),
      recentChanges: allRecentChanges.slice(0, 10),
      discoveryActivity: discoveryActivity.slice(0, 5),
      applicationActivity: appActivityItems.slice(0, 5),
      careerMemoryAttention: memoryAttentionItems.slice(0, 5),
    };
  }
}
