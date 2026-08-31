import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { CandidateId } from '@oca/domain';
import type {
  CareerSignal,
  CareerSignalsResponse,
  SampleOpportunityItem,
} from '@oca/schemas';

import type { DatabaseHandle } from '../client.js';
import { getTables } from '../schema-helper.js';

export interface CareerSignalsOptions {
  now?: Date;
  minRepeatedThreshold?: number;
  minBlockerThreshold?: number;
}

export class CareerSignalsRepository {
  public constructor(private readonly db: DatabaseHandle) {}

  public async getCareerSignals(
    cId: CandidateId,
    options: CareerSignalsOptions = {},
  ): Promise<CareerSignalsResponse> {
    const now = options.now ?? new Date();
    const minRepeatedThreshold = options.minRepeatedThreshold ?? 2;
    const minBlockerThreshold = options.minBlockerThreshold ?? 1;

    const {
      discoveryMatches,
      opportunitySnapshots,
      decisions,
      evaluations,
      sourceListings,
      evaluationFindings,
      candidateClaims,
    } = getTables(this.db);
    const db = this.db.db as any;

    // 1. Fetch Candidate's Discovered Matches
    const matches = await db
      .select({
        opportunityId: discoveryMatches.opportunityId,
        searchTargetId: discoveryMatches.searchTargetId,
      })
      .from(discoveryMatches)
      .where(eq(discoveryMatches.candidateId, cId));

    // 2. Collect unique canonical opportunity IDs to prevent double-counting
    const uniqueOppIds = Array.from(
      new Set(matches.map((m: any) => m.opportunityId)),
    );

    if (uniqueOppIds.length === 0) {
      return {
        candidateId: cId,
        generatedAt: now.toISOString(),
        summary:
          'No active discovered opportunities found for Career Signals aggregation.',
        activeOpportunityCount: 0,
        repeatedGaps: [],
        strongAlignments: [],
        transferableCapabilities: [],
        eligibilityUncertainties: [],
        eligibilityBlockers: [],
        evidenceGaps: [],
        marketDemand: [],
      };
    }

    // 3. Retrieve Latest Snapshots & Unsuperseded Evaluations for Active Opportunities
    const activeOpps: Array<{
      opportunityId: string;
      title: string;
      organization: string;
      sourceSystem: string;
      snapshotId: string;
      evaluationId: string;
    }> = [];

    for (const oppIdStr of uniqueOppIds as string[]) {
      // Latest Snapshot
      const snapshots = await db
        .select()
        .from(opportunitySnapshots)
        .where(eq(opportunitySnapshots.opportunityId, oppIdStr));

      if (snapshots.length === 0) continue;
      const latestSnapshot = snapshots[snapshots.length - 1];
      if (!latestSnapshot) continue;

      // Check if opportunity decision indicates listing is explicitly closed
      const candDecisions = await db
        .select()
        .from(decisions)
        .where(
          and(
            eq(decisions.candidateId, cId),
            eq(decisions.snapshotId, latestSnapshot.id),
          ),
        );

      const latestDecision = candDecisions[candDecisions.length - 1];

      if (
        (latestDecision?.priority as string) === 'blocked' &&
        latestDecision?.reasonCodes?.includes('LISTING_CLOSED')
      ) {
        // Exclude explicitly closed listings from current active market signals
        continue;
      }

      // Latest Unsuperseded Evaluation
      const evals = await db
        .select()
        .from(evaluations)
        .where(
          and(
            eq(evaluations.candidateId, cId),
            eq(evaluations.snapshotId, latestSnapshot.id),
            isNull(evaluations.supersededAt),
          ),
        );

      if (evals.length === 0) continue;
      const currentEval = evals[evals.length - 1];
      if (!currentEval) continue;

      // Source System provenance
      const listings = await db
        .select()
        .from(sourceListings)
        .where(eq(sourceListings.opportunityId, oppIdStr));

      const sourceSystem = listings[0]?.sourceSystem ?? 'unknown';

      activeOpps.push({
        opportunityId: oppIdStr,
        title: latestSnapshot.title,
        organization: latestSnapshot.organization,
        sourceSystem,
        snapshotId: latestSnapshot.id,
        evaluationId: currentEval.id,
      });
    }

    const activeOpportunityCount = activeOpps.length;
    if (activeOpportunityCount === 0) {
      return {
        candidateId: cId,
        generatedAt: now.toISOString(),
        summary:
          'No active open opportunities available for Career Signals aggregation.',
        activeOpportunityCount: 0,
        repeatedGaps: [],
        strongAlignments: [],
        transferableCapabilities: [],
        eligibilityUncertainties: [],
        eligibilityBlockers: [],
        evidenceGaps: [],
        marketDemand: [],
      };
    }

    // Map oppId to activeOpp for fast sample lookup
    const oppMap = new Map(activeOpps.map((o) => [o.opportunityId, o]));
    const evalIdToOpp = new Map(activeOpps.map((o) => [o.evaluationId, o]));

    // 4. Fetch all evaluation findings for current unsuperseded evaluations
    const evalIds = activeOpps.map((o) => o.evaluationId);
    const allFindings = await db
      .select()
      .from(evaluationFindings)
      .where(inArray(evaluationFindings.evaluationId, evalIds));

    // Fetch Candidate Memory claims for evidence gap comparison
    const candidateClaimRecords = await db
      .select()
      .from(candidateClaims)
      .where(eq(candidateClaims.candidateId, cId));

    const establishedClaimTypes = new Set(
      candidateClaimRecords
        .filter((c: any) => c.state === 'SUPPORTED')
        .map((c: any) => c.kind.toLowerCase()),
    );

    // 5. Aggregate Findings by Dimension Key & Signal Family
    type FindingGroup = {
      dimensionKey: string;
      label: string;
      category: string;
      opportunityMap: Map<
        string,
        {
          state: string;
          modality?: string | null;
          sourceSystem: string;
          summary: string;
          explanation?: string | null;
        }
      >;
    };

    const dimensionGroups = new Map<string, FindingGroup>();

    for (const finding of allFindings) {
      const opp = evalIdToOpp.get(finding.evaluationId);
      if (!opp) continue;

      const groupKey = `${finding.category}:${finding.dimensionKey.toLowerCase()}`;
      let group = dimensionGroups.get(groupKey);
      if (!group) {
        group = {
          dimensionKey: finding.dimensionKey,
          label: finding.label || finding.dimensionKey,
          category: finding.category,
          opportunityMap: new Map(),
        };
        dimensionGroups.set(groupKey, group);
      }

      // Deduplicate findings per opportunity (if any duplicate)
      if (!group.opportunityMap.has(opp.opportunityId)) {
        group.opportunityMap.set(opp.opportunityId, {
          state: finding.state,
          modality: finding.modality,
          sourceSystem: opp.sourceSystem,
          summary: finding.summary,
          explanation: finding.explanation,
        });
      }
    }

    // Build Signal collections
    const repeatedGaps: CareerSignal[] = [];
    const strongAlignments: CareerSignal[] = [];
    const transferableCapabilities: CareerSignal[] = [];
    const eligibilityUncertainties: CareerSignal[] = [];
    const eligibilityBlockers: CareerSignal[] = [];
    const evidenceGaps: CareerSignal[] = [];
    const marketDemand: CareerSignal[] = [];

    // Process Dimension Groups
    for (const group of dimensionGroups.values()) {
      const { dimensionKey, label, category, opportunityMap } = group;
      const oppEntries = Array.from(opportunityMap.entries());

      // Helper to compute sample opportunities & source breakdown
      const computeMetadata = (
        filteredEntries: typeof oppEntries,
      ): {
        samples: SampleOpportunityItem[];
        sources: Record<string, number>;
        states: Record<string, number>;
        requiredCount: number;
        preferredCount: number;
      } => {
        const samples: SampleOpportunityItem[] = [];
        const sources: Record<string, number> = {};
        const states: Record<string, number> = {};
        let requiredCount = 0;
        let preferredCount = 0;

        for (const [oppId, data] of filteredEntries) {
          const opp = oppMap.get(oppId);
          if (opp && samples.length < 3) {
            samples.push({
              opportunityId: opp.opportunityId,
              title: opp.title,
              organization: opp.organization,
            });
          }
          sources[data.sourceSystem] = (sources[data.sourceSystem] || 0) + 1;
          states[data.state] = (states[data.state] || 0) + 1;

          if (data.modality === 'required') {
            requiredCount++;
          } else {
            preferredCount++;
          }
        }

        return { samples, sources, states, requiredCount, preferredCount };
      };

      if (category === 'fit') {
        // A. REPEATED FIT GAPS (GAP, NO_EVIDENCE, PARTIAL)
        const gapEntries = oppEntries.filter(([_, d]) =>
          ['GAP', 'NO_EVIDENCE', 'PARTIAL'].includes(d.state),
        );
        if (gapEntries.length >= minRepeatedThreshold) {
          const meta = computeMetadata(gapEntries);
          repeatedGaps.push({
            signalType: 'repeated-gap',
            dimensionKey,
            label,
            occurrenceCount: gapEntries.length,
            affectedOpportunityCount: gapEntries.length,
            requiredCount: meta.requiredCount,
            preferredCount: meta.preferredCount,
            sampleOpportunities: meta.samples,
            sourceBreakdown: meta.sources,
            findingStateBreakdown: meta.states,
            summary: `Career Memory does not currently establish ${label} evidence across ${gapEntries.length} current opportunities (${meta.requiredCount} required).`,
          });

          // F. EVIDENCE GAP (if candidate has no supported claim)
          const normKey = dimensionKey
            .replace(/^(tech|skill|req):/i, '')
            .toLowerCase();
          if (!establishedClaimTypes.has(normKey)) {
            evidenceGaps.push({
              signalType: 'evidence-gap',
              dimensionKey,
              label,
              occurrenceCount: gapEntries.length,
              affectedOpportunityCount: gapEntries.length,
              requiredCount: meta.requiredCount,
              preferredCount: meta.preferredCount,
              sampleOpportunities: meta.samples,
              sourceBreakdown: meta.sources,
              findingStateBreakdown: meta.states,
              summary: `Evidence not recorded in Career Memory for ${label} across ${gapEntries.length} current roles.`,
            });
          }
        }

        // B. REPEATED STRONG ALIGNMENT (STRONG_MATCH, MATCH)
        const matchEntries = oppEntries.filter(
          ([_, d]) =>
            ['STRONG_MATCH', 'MATCH'].includes(d.state) &&
            !d.explanation?.toLowerCase().includes('transfer'),
        );
        if (matchEntries.length >= minRepeatedThreshold) {
          const meta = computeMetadata(matchEntries);
          strongAlignments.push({
            signalType: 'strong-alignment',
            dimensionKey,
            label,
            occurrenceCount: matchEntries.length,
            affectedOpportunityCount: matchEntries.length,
            requiredCount: meta.requiredCount,
            preferredCount: meta.preferredCount,
            sampleOpportunities: meta.samples,
            sourceBreakdown: meta.sources,
            findingStateBreakdown: meta.states,
            summary: `Demonstrated ${label} capability aligns with ${matchEntries.length} current opportunities.`,
          });
        }

        // C. TRANSFERABLE CAPABILITY SIGNALS
        const transferEntries = oppEntries.filter(
          ([_, d]) =>
            d.explanation?.toLowerCase().includes('transfer') ||
            d.summary?.toLowerCase().includes('transfer'),
        );
        if (transferEntries.length >= minRepeatedThreshold) {
          const meta = computeMetadata(transferEntries);
          transferableCapabilities.push({
            signalType: 'transferable',
            dimensionKey,
            label,
            occurrenceCount: transferEntries.length,
            affectedOpportunityCount: transferEntries.length,
            requiredCount: meta.requiredCount,
            preferredCount: meta.preferredCount,
            sampleOpportunities: meta.samples,
            sourceBreakdown: meta.sources,
            findingStateBreakdown: meta.states,
            summary: `Transferable evidence toward ${label} capability applies across ${transferEntries.length} opportunities.`,
          });
        }

        // G. MARKET DEMAND (Total occurrences across active roles)
        if (oppEntries.length >= minRepeatedThreshold) {
          const meta = computeMetadata(oppEntries);
          marketDemand.push({
            signalType: 'market-demand',
            dimensionKey,
            label,
            occurrenceCount: oppEntries.length,
            affectedOpportunityCount: oppEntries.length,
            requiredCount: meta.requiredCount,
            preferredCount: meta.preferredCount,
            sampleOpportunities: meta.samples,
            sourceBreakdown: meta.sources,
            findingStateBreakdown: meta.states,
            summary: `${label} appears across ${oppEntries.length} of your current discovered opportunities.`,
          });
        }
      } else if (category === 'eligibility') {
        // D. ELIGIBILITY UNCERTAINTY (INVESTIGATE, UNKNOWN)
        const uncertainEntries = oppEntries.filter(([_, d]) =>
          ['INVESTIGATE', 'UNKNOWN'].includes(d.state),
        );
        if (uncertainEntries.length >= minRepeatedThreshold) {
          const meta = computeMetadata(uncertainEntries);
          eligibilityUncertainties.push({
            signalType: 'eligibility-uncertainty',
            dimensionKey,
            label,
            occurrenceCount: uncertainEntries.length,
            affectedOpportunityCount: uncertainEntries.length,
            requiredCount: meta.requiredCount,
            preferredCount: meta.preferredCount,
            sampleOpportunities: meta.samples,
            sourceBreakdown: meta.sources,
            findingStateBreakdown: meta.states,
            summary: `${label} eligibility is unresolved across ${uncertainEntries.length} current opportunities.`,
          });
        }

        // E. ELIGIBILITY BLOCKER (INELIGIBLE)
        const blockerEntries = oppEntries.filter(
          ([_, d]) => d.state === 'INELIGIBLE',
        );
        if (blockerEntries.length >= minBlockerThreshold) {
          const meta = computeMetadata(blockerEntries);
          eligibilityBlockers.push({
            signalType: 'eligibility-blocker',
            dimensionKey,
            label,
            occurrenceCount: blockerEntries.length,
            affectedOpportunityCount: blockerEntries.length,
            requiredCount: meta.requiredCount,
            preferredCount: meta.preferredCount,
            sampleOpportunities: meta.samples,
            sourceBreakdown: meta.sources,
            findingStateBreakdown: meta.states,
            summary: `${label} requirement conflicts with ${blockerEntries.length} opportunities.`,
          });
        }
      }
    }

    // 6. Deterministic Ordering
    // Repeated Gaps: affectedOpportunityCount DESC, requiredCount DESC, dimensionKey ASC
    repeatedGaps.sort(
      (a, b) =>
        b.affectedOpportunityCount - a.affectedOpportunityCount ||
        b.requiredCount - a.requiredCount ||
        a.dimensionKey.localeCompare(b.dimensionKey),
    );

    // Strong Alignment: affectedOpportunityCount DESC, dimensionKey ASC
    strongAlignments.sort(
      (a, b) =>
        b.affectedOpportunityCount - a.affectedOpportunityCount ||
        a.dimensionKey.localeCompare(b.dimensionKey),
    );

    // Transferable: affectedOpportunityCount DESC, dimensionKey ASC
    transferableCapabilities.sort(
      (a, b) =>
        b.affectedOpportunityCount - a.affectedOpportunityCount ||
        a.dimensionKey.localeCompare(b.dimensionKey),
    );

    // Eligibility Uncertainties: affectedOpportunityCount DESC, dimensionKey ASC
    eligibilityUncertainties.sort(
      (a, b) =>
        b.affectedOpportunityCount - a.affectedOpportunityCount ||
        a.dimensionKey.localeCompare(b.dimensionKey),
    );

    // Eligibility Blockers: affectedOpportunityCount DESC, dimensionKey ASC
    eligibilityBlockers.sort(
      (a, b) =>
        b.affectedOpportunityCount - a.affectedOpportunityCount ||
        a.dimensionKey.localeCompare(b.dimensionKey),
    );

    // Evidence Gaps: affectedOpportunityCount DESC, dimensionKey ASC
    evidenceGaps.sort(
      (a, b) =>
        b.affectedOpportunityCount - a.affectedOpportunityCount ||
        a.dimensionKey.localeCompare(b.dimensionKey),
    );

    // Market Demand: occurrenceCount DESC, dimensionKey ASC
    marketDemand.sort(
      (a, b) =>
        b.occurrenceCount - a.occurrenceCount ||
        a.dimensionKey.localeCompare(b.dimensionKey),
    );

    // 7. Deterministic Summary Generation
    let summaryText = `Analyzed ${activeOpportunityCount} active open opportunities in candidate market.`;
    if (strongAlignments.length > 0 && repeatedGaps.length > 0) {
      summaryText = `Your current discovered market (${activeOpportunityCount} roles) shows strong ${strongAlignments[0]?.label} alignment, while ${repeatedGaps[0]?.label} evidence is unresolved across ${repeatedGaps[0]?.affectedOpportunityCount} roles.`;
    } else if (strongAlignments.length > 0) {
      summaryText = `Your current discovered market (${activeOpportunityCount} roles) shows strong ${strongAlignments[0]?.label} alignment across top opportunities.`;
    } else if (repeatedGaps.length > 0) {
      summaryText = `Your current discovered market (${activeOpportunityCount} roles) identifies ${repeatedGaps[0]?.label} evidence gaps affecting ${repeatedGaps[0]?.affectedOpportunityCount} roles.`;
    }

    return {
      candidateId: cId,
      generatedAt: now.toISOString(),
      summary: summaryText,
      activeOpportunityCount,
      repeatedGaps,
      strongAlignments,
      transferableCapabilities,
      eligibilityUncertainties,
      eligibilityBlockers,
      evidenceGaps,
      marketDemand,
    };
  }
}
