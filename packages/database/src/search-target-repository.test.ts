import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  candidateId,
  discoveryMatchId,
  discoveryRunId,
  opportunityId,
  searchTargetId,
} from '@oca/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type DatabaseHandle } from './client.js';
import { applyMigrations } from './migrate.js';
import { CandidateRepository } from './repositories/candidate-repository.js';
import { OpportunityRepository } from './repositories/opportunity-repository.js';
import { SearchTargetRepository } from './repositories/search-target-repository.js';
import { SourceListingRepository } from './repositories/source-listing-repository.js';

describe('SearchTargetRepository', () => {
  let directory: string;
  let database: DatabaseHandle;
  let repository: SearchTargetRepository;
  let candRepo: CandidateRepository;

  const candidateA = candidateId('cand-search-a');
  const candidateB = candidateId('cand-search-b');

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'oca-search-repo-test-'));
    database = openDatabase(join(directory, 'test.sqlite'));
    applyMigrations(database);

    candRepo = new CandidateRepository(database);
    candRepo.createCandidate(candidateA);
    candRepo.createCandidate(candidateB);

    repository = new SearchTargetRepository(database);
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('creates, reads, updates, and lists search targets per candidate with strict candidate isolation', () => {
    const targetA = repository.createSearchTarget(candidateA, {
      name: 'Backend Target A',
      targetRoles: ['Backend Engineer'],
      locations: ['Germany'],
      locationIsHardFilter: true,
    });

    const targetB = repository.createSearchTarget(candidateB, {
      name: 'Frontend Target B',
      targetRoles: ['Frontend Engineer'],
      locations: ['Remote'],
    });

    expect(repository.listSearchTargets(candidateA)).toHaveLength(1);
    expect(repository.listSearchTargets(candidateB)).toHaveLength(1);
    expect(
      repository.getSearchTarget(candidateA, searchTargetId(targetA.id)),
    ).not.toBeNull();
    expect(
      repository.getSearchTarget(candidateA, searchTargetId(targetB.id)),
    ).toBeNull();

    const updated = repository.updateSearchTarget(
      candidateA,
      searchTargetId(targetA.id),
      {
        enabled: false,
        skills: ['TypeScript', 'Node.js'],
      },
    );

    expect(updated?.enabled).toBe(false);
    expect(updated?.skills).toEqual(['TypeScript', 'Node.js']);
  });

  it('records discovery runs and matches, supporting same opportunity matched by multiple candidates without duplication', () => {
    const oppRepo = new OpportunityRepository(database);
    const sourceRepo = new SourceListingRepository(database);

    const sharedOppId = opportunityId('opp-shared-1');
    oppRepo.createOpportunity(sharedOppId);
    sourceRepo.persistListing(
      'sl-shared-1',
      { sourceSystem: 'greenhouse', sourceExternalId: '101' },
      sharedOppId,
      Date.now(),
    );

    const targetA = repository.createSearchTarget(candidateA, {
      name: 'Target A',
    });
    const targetB = repository.createSearchTarget(candidateB, {
      name: 'Target B',
    });

    const runA = repository.createDiscoveryRun(
      discoveryRunId('run-a-1'),
      candidateA,
      searchTargetId(targetA.id),
    );
    const runB = repository.createDiscoveryRun(
      discoveryRunId('run-b-1'),
      candidateB,
      searchTargetId(targetB.id),
    );

    repository.recordDiscoveryMatch({
      id: discoveryMatchId('dm-a-1'),
      candidateId: candidateA,
      searchTargetId: searchTargetId(targetA.id),
      discoveryRunId: discoveryRunId(runA.id),
      opportunityId: sharedOppId,
      sourceListingId: 'sl-shared-1',
      matchReasons: ['Matched Backend Engineer'],
      retainedUnresolved: [],
    });

    repository.recordDiscoveryMatch({
      id: discoveryMatchId('dm-b-1'),
      candidateId: candidateB,
      searchTargetId: searchTargetId(targetB.id),
      discoveryRunId: discoveryRunId(runB.id),
      opportunityId: sharedOppId,
      sourceListingId: 'sl-shared-1',
      matchReasons: ['Matched Remote location'],
      retainedUnresolved: [],
    });

    expect(repository.getMatchedOpportunityIds(candidateA)).toEqual([
      sharedOppId,
    ]);
    expect(repository.getMatchedOpportunityIds(candidateB)).toEqual([
      sharedOppId,
    ]);
    expect(repository.listDiscoveryMatches(candidateA)).toHaveLength(1);
    expect(repository.listDiscoveryMatches(candidateB)).toHaveLength(1);
  });

  it('preserves historical DiscoveryRun and DiscoveryMatch provenance when a Search Target is deleted/archived', () => {
    const oppRepo = new OpportunityRepository(database);
    const sourceRepo = new SourceListingRepository(database);

    const oppId = opportunityId('opp-hist-1');
    oppRepo.createOpportunity(oppId);
    sourceRepo.persistListing(
      'sl-hist-1',
      { sourceSystem: 'greenhouse', sourceExternalId: '202' },
      oppId,
      Date.now(),
    );

    const target = repository.createSearchTarget(candidateA, {
      name: 'Legacy Target',
    });
    const run = repository.createDiscoveryRun(
      discoveryRunId('run-hist-1'),
      candidateA,
      searchTargetId(target.id),
    );

    repository.recordDiscoveryMatch({
      id: discoveryMatchId('dm-hist-1'),
      candidateId: candidateA,
      searchTargetId: searchTargetId(target.id),
      discoveryRunId: discoveryRunId(run.id),
      opportunityId: oppId,
      sourceListingId: 'sl-hist-1',
      matchReasons: ['Target match'],
      retainedUnresolved: [],
    });

    const deleted = repository.deleteSearchTarget(
      candidateA,
      searchTargetId(target.id),
    );
    expect(deleted).toBe(true);

    // Active search target list excludes archived target
    expect(repository.listSearchTargets(candidateA)).toHaveLength(0);

    // Target record survives in storage and can still be fetched by searchTargetId for provenance audit
    const archivedTarget = repository.getSearchTarget(
      candidateA,
      searchTargetId(target.id),
    );
    expect(archivedTarget).not.toBeNull();
    expect(archivedTarget?.name).toBe('Legacy Target');
    expect(archivedTarget?.enabled).toBe(false);
    expect(archivedTarget?.archivedAt).toBeDefined();

    // Historical DiscoveryRun and DiscoveryMatch provenance are preserved intact
    const matches = repository.listDiscoveryMatches(candidateA);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.searchTargetId).toBe(target.id);
    expect(matches[0]?.discoveryRunId).toBe(run.id);

    const runs = repository.listDiscoveryRuns(candidateA);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.searchTargetId).toBe(target.id);
  });
});
