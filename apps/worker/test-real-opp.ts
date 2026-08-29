import { openDatabase, OpportunityRepository, applyMigrations } from '@oca/database';
import { EligibilityEngine } from '@oca/intelligence';

async function main() {
  const db = openDatabase('rolevia.sqlite');
  // ensure migrations run just in case
  await applyMigrations(db, '../../packages/database/migrations');
  const repo = new OpportunityRepository(db);

  const summaries = repo.getOpportunitySummaries();
  if (summaries.length === 0) {
    console.log("No real opportunities ingested yet.");
    return;
  }

  const snapshot = repo.getSnapshot(summaries[0].latestSnapshotId!);
  if (!snapshot) {
     console.log("Could not load snapshot");
     return;
  }

  const engine = new EligibilityEngine();

  // small development candidate fixture
  const candidateClaims = [
    { kind: 'work_authorization', scope: 'us', state: 'supported' },
    { kind: 'location', scope: 'new york', state: 'supported' },
    { kind: 'sponsorship', value: 'requires_sponsorship', state: 'conflict' } // Does not require sponsorship
  ];

  const result = engine.evaluate(snapshot, candidateClaims);

  console.log("Real Opportunity Title: " + summaries[0].latestTitle);
  console.log("Evaluation Overall State: " + result.overallState);
  console.log("Evaluation Findings: ", JSON.stringify(result.findings, null, 2));

}
main().catch(console.error);
