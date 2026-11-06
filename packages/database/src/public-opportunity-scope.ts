import { sql, type SQLWrapper } from 'drizzle-orm';

export const publicOpportunity = (id: SQLWrapper) => sql`EXISTS (
  SELECT 1 FROM opportunities AS scope_opportunity
  WHERE scope_opportunity.id = ${id} AND scope_opportunity.visibility = 'PUBLIC'
)`;

export const publicSnapshot = (id: SQLWrapper) => sql`EXISTS (
  SELECT 1 FROM opportunity_snapshots AS scope_snapshot
  JOIN opportunities AS scope_opportunity ON scope_opportunity.id = scope_snapshot.opportunity_id
  WHERE scope_snapshot.id = ${id} AND scope_opportunity.visibility = 'PUBLIC'
)`;

export const publicEvaluation = (
  id: SQLWrapper,
  lineage?: { candidate: SQLWrapper; snapshot: SQLWrapper },
) => sql`EXISTS (
  SELECT 1 FROM evaluations AS scope_evaluation
  JOIN opportunity_snapshots AS scope_snapshot ON scope_snapshot.id = scope_evaluation.snapshot_id
  JOIN opportunities AS scope_opportunity ON scope_opportunity.id = scope_snapshot.opportunity_id
  WHERE scope_evaluation.id = ${id} AND scope_opportunity.visibility = 'PUBLIC'
    ${
      lineage
        ? sql`AND scope_evaluation.candidate_id = ${lineage.candidate}
      AND scope_evaluation.snapshot_id = ${lineage.snapshot}`
        : sql.empty()
    }
)`;

export const providerListing = (
  id: SQLWrapper,
  allowUnlinked = false,
) => sql`EXISTS (
  SELECT 1 FROM source_listings AS scope_listing
  LEFT JOIN opportunities AS scope_opportunity ON scope_opportunity.id = scope_listing.opportunity_id
  WHERE scope_listing.id = ${id} AND scope_listing.source_system <> 'MANUAL'
    AND (scope_opportunity.visibility = 'PUBLIC'
      ${allowUnlinked ? sql`OR scope_listing.opportunity_id IS NULL` : sql.empty()})
)`;

export const discoveryLineage = (row: {
  candidateId: SQLWrapper;
  searchTargetId: SQLWrapper;
  discoveryRunId: SQLWrapper;
  sourceListingId: SQLWrapper;
  opportunityId: SQLWrapper;
}) => sql`EXISTS (
  SELECT 1 FROM discovery_runs AS scope_run
  JOIN search_targets AS scope_target ON scope_target.id = scope_run.search_target_id
    AND scope_target.candidate_id = scope_run.candidate_id
  JOIN source_listings AS scope_listing ON scope_listing.id = ${row.sourceListingId}
    AND scope_listing.opportunity_id = ${row.opportunityId}
  JOIN opportunities AS scope_opportunity ON scope_opportunity.id = scope_listing.opportunity_id
  WHERE scope_run.id = ${row.discoveryRunId} AND scope_target.id = ${row.searchTargetId}
    AND scope_run.candidate_id = ${row.candidateId}
    AND scope_opportunity.visibility = 'PUBLIC' AND scope_listing.source_system <> 'MANUAL'
)`;
