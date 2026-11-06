import { createHash, randomUUID } from 'node:crypto';
import { sql, type SQL } from 'drizzle-orm';
import {
  normalizeManualOpportunityInput,
  type ManualOpportunityInput,
} from '@oca/domain';
import type { DatabaseHandle } from '../client.js';

interface RevisionRow {
  id: string;
  category: ManualOpportunityInput['category'];
  title: string;
  organization: string;
  sourceUrl: string | null;
  sourceContext: string | null;
  deadline: string | null;
  version: number;
  createdAt: string | number | Date;
  updatedAt: string | number | Date;
  requestHash: string;
  slot: string;
}
type Match = {
  id: string;
  title: string;
  organization: string;
  kind: 'MANUAL' | 'ATS';
};
type ErrorCode =
  | 'INVALID_FIELDS'
  | 'NOT_FOUND'
  | 'STALE_VERSION'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'DUPLICATE';
export class ManualOpportunityError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly duplicate?: { matches: Match[]; acknowledgement: string | null },
  ) {
    super(code);
  }
}

// One operation description, with synchronous execution on SQLite and awaited
// execution on a pinned PostgreSQL transaction. No Promise crosses SQLite's commit.
type Row = Record<string, unknown>;
type Operation<T> = Generator<SQL, T, Row[]>;
const current = sql`
  SELECT c.opportunity_id AS id, s.category, s.title, s.organization,
    s.manual_source_url AS "sourceUrl", s.manual_source_context AS "sourceContext",
    CAST(s.deadline_date AS text) AS deadline, c.version,
    c.created_at AS "createdAt", c.updated_at AS "updatedAt",
    c.create_request_hash AS "requestHash", c.duplicate_slot AS slot
  FROM manual_opportunity_captures c
  JOIN opportunities o ON o.id = c.opportunity_id AND o.owner_candidate_id = c.candidate_id
  JOIN opportunity_snapshots s ON s.opportunity_id = o.id AND s.manual_revision = c.version
  WHERE o.visibility = 'CANDIDATE_PRIVATE'`;
function present(row: RevisionRow) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    organization: row.organization,
    sourceUrl: row.sourceUrl,
    sourceContext: row.sourceContext,
    deadline: row.deadline,
    version: row.version,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    provenance: { kind: 'MANUAL', verification: 'UNVERIFIED' } as const,
    evaluationState: 'NOT_EVALUATED' as const,
  };
}
const digest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fold = (value: string) =>
  value.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
const normalizeUrl = (value: string | null) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
};
const comparison = (input: ManualOpportunityInput) => {
  const url = normalizeUrl(input.sourceUrl);
  const key = digest([
    input.category,
    fold(input.title),
    fold(input.organization),
  ]);
  return {
    url,
    key,
    fingerprint: digest([
      key,
      url,
      input.deadline,
      input.sourceContext && fold(input.sourceContext),
    ]),
  };
};
const payload = (input: ManualOpportunityInput) => [
  input.category,
  input.title,
  input.organization,
  input.sourceUrl,
  input.sourceContext,
  input.deadline,
];

function validated(input: ManualOpportunityInput): ManualOpportunityInput {
  const result = normalizeManualOpportunityInput(input);
  if (!result) throw new ManualOpportunityError('INVALID_FIELDS');
  return result;
}

export class ManualOpportunityRepository {
  constructor(private readonly handle: DatabaseHandle) {}

  private execute<T>(operation: Operation<T>, write = false): T | Promise<T> {
    const db = this.handle.db as any;
    if (this.handle.engine === 'sqlite') {
      const run = (session: typeof db) => {
        let next = operation.next();
        while (!next.done) next = operation.next(session.all(next.value));
        return next.value;
      };
      return write ? db.transaction(run, { behavior: 'immediate' }) : run(db);
    }
    const run = async (session: typeof db) => {
      let next = operation.next();
      while (!next.done)
        next = operation.next((await session.execute(next.value)).rows);
      return next.value;
    };
    return write
      ? db.transaction(run, { isolationLevel: 'read committed' })
      : run(db);
  }

  private *lock(candidate: string): Operation<void> {
    const postgres = this.handle.engine === 'postgres';
    if (postgres) yield sql`SET LOCAL lock_timeout = '5s'`;
    const suffix = postgres ? sql`FOR UPDATE` : sql.empty();
    const rows =
      yield sql`SELECT id FROM candidates WHERE id = ${candidate} ${suffix}`;
    if (!rows.length) throw new ManualOpportunityError('NOT_FOUND');
  }

  private *find(candidate: string, id: string): Operation<RevisionRow | null> {
    const rows =
      yield sql`${current} AND c.candidate_id = ${candidate} AND c.opportunity_id = ${id}`;
    return (rows[0] as unknown as RevisionRow | undefined) ?? null;
  }

  async get(candidate: string, id: string) {
    const row = await this.execute(this.find(candidate, id));
    return row ? present(row) : null;
  }

  async detail(candidate: string, id: string) {
    return this.execute(this.readDetail(candidate, id));
  }

  private *readDetail(
    candidate: string,
    id: string,
  ): Operation<
    | (ReturnType<typeof present> & {
        revisions: { version: number; observedAt: string }[];
      })
    | null
  > {
    const row = yield* this.find(candidate, id);
    if (!row) return null;
    const revisions =
      yield sql`SELECT s.manual_revision AS version, s.observed_at AS "observedAt"
        FROM opportunity_snapshots s JOIN opportunities o ON o.id = s.opportunity_id
        WHERE o.id = ${id} AND o.owner_candidate_id = ${candidate}
          AND o.visibility = 'CANDIDATE_PRIVATE' AND s.manual_revision BETWEEN 1 AND ${row.version}
        ORDER BY s.manual_revision DESC LIMIT 25`;
    return {
      ...present(row),
      revisions: revisions.map((r) => ({
        version: Number(r.version),
        observedAt: new Date(
          r.observedAt as string | number | Date,
        ).toISOString(),
      })),
    };
  }

  async list(candidate: string, limit = 25, after?: string) {
    const size = Math.min(100, Math.max(1, limit));
    return this.execute(
      (function* (): Operation<{
        items: ReturnType<typeof present>[];
        nextCursor: string | null;
      }> {
        const cursor = after
          ? sql`AND (c.created_at, c.opportunity_id) < (
        SELECT created_at, opportunity_id FROM manual_opportunity_captures
        WHERE candidate_id = ${candidate} AND opportunity_id = ${after}
      )`
          : sql.empty();
        const rows =
          (yield sql`${current} AND c.candidate_id = ${candidate} ${cursor}
        ORDER BY c.created_at DESC, c.opportunity_id DESC LIMIT ${size + 1}`) as unknown as RevisionRow[];
        const items = rows.slice(0, size).map(present);
        return {
          items,
          nextCursor: rows.length > size ? items.at(-1)!.id : null,
        };
      })(),
    );
  }

  private *matches(
    candidate: string,
    input: ManualOpportunityInput,
    exclude: string | null,
  ): Operation<{ matches: Match[]; acknowledgement: string | null }> {
    const { url, key, fingerprint } = comparison(input);
    const manual =
      yield sql`SELECT c.opportunity_id AS id, s.title, s.organization, c.version
      FROM manual_opportunity_captures c
      JOIN opportunities o ON o.id = c.opportunity_id AND o.owner_candidate_id = c.candidate_id
      JOIN opportunity_snapshots s ON s.opportunity_id = o.id AND s.manual_revision = c.version
      WHERE o.visibility = 'CANDIDATE_PRIVATE' AND c.candidate_id = ${candidate}
        AND (${exclude ?? ''} = '' OR o.id <> ${exclude ?? ''})
        AND (c.match_key = ${key} OR c.normalized_url = ${url})`;
    const ats =
      yield sql`SELECT o.id, s.id AS version, s.title, s.organization, l.source_url AS url
      FROM discovery_matches m JOIN opportunities o ON o.id = m.opportunity_id
      JOIN search_targets target ON target.id = m.search_target_id AND target.candidate_id = m.candidate_id
      JOIN discovery_runs run ON run.id = m.discovery_run_id AND run.search_target_id = target.id
        AND run.candidate_id = m.candidate_id
      JOIN source_listings l ON l.id = m.source_listing_id AND l.opportunity_id = o.id
      JOIN opportunity_snapshots s ON s.id = (
        SELECT latest.id FROM opportunity_snapshots latest WHERE latest.opportunity_id = o.id
        ORDER BY latest.observed_at DESC, latest.id DESC LIMIT 1)
      WHERE m.candidate_id = ${candidate} AND o.visibility = 'PUBLIC' AND l.source_system <> 'MANUAL'`;
    const tagged = [
      ...manual.map((row) => ({ row, kind: 'MANUAL' as const })),
      ...ats
        .filter(
          (row) =>
            (url && normalizeUrl(row.url as string | null) === url) ||
            (input.category === 'JOB' &&
              fold(String(row.title)) === fold(input.title) &&
              fold(String(row.organization)) === fold(input.organization)),
        )
        .map((row) => ({ row, kind: 'ATS' as const })),
    ];
    const byId = new Map(tagged.map((entry) => [String(entry.row.id), entry]));
    const entries = [...byId.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, entry]) => entry);
    return {
      matches: entries.slice(0, 10).map(({ row, kind }) => ({
        id: String(row.id),
        title: String(row.title),
        organization: String(row.organization),
        kind,
      })),
      acknowledgement: entries.length
        ? digest([
            candidate,
            exclude,
            fingerprint,
            entries.map(({ row, kind }) => [kind, row.id, row.version]),
          ])
        : null,
    };
  }

  async duplicateCheck(candidate: string, input: ManualOpportunityInput) {
    return this.execute(this.matches(candidate, validated(input), null));
  }

  private *assertSeparate(
    candidate: string,
    input: ManualOpportunityInput,
    exclude: string | null,
    acknowledgement?: string,
  ): Operation<void> {
    const result = yield* this.matches(candidate, input, exclude);
    if (result.acknowledgement !== (acknowledgement ?? null)) {
      throw new ManualOpportunityError('DUPLICATE', {
        matches: result.matches,
        acknowledgement: result.acknowledgement,
      });
    }
  }

  private *revision(
    id: string,
    version: number,
    input: ManualOpportunityInput,
    now: number | string,
  ): Operation<void> {
    const snapshot = randomUUID();
    const observation = randomUUID();
    const fingerprint = digest([version, payload(input)]);
    yield sql`INSERT INTO opportunity_snapshots
      (id, opportunity_id, observed_at, title, organization, content, fingerprint, created_at, category,
       deadline_date, manual_source_url, manual_source_context, manual_revision)
      VALUES (${snapshot}, ${id}, ${now}, ${input.title}, ${input.organization}, '', ${fingerprint}, ${now},
       ${input.category}, ${input.deadline}, ${input.sourceUrl}, ${input.sourceContext}, ${version})`;
    yield sql`INSERT INTO source_observations
      (id, source_listing_id, raw_payload, fingerprint, observed_at, created_at)
      VALUES (${observation}, ${id}, ${JSON.stringify({ ...input, version })}, ${fingerprint}, ${now}, ${now})`;
    yield sql`INSERT INTO opportunity_snapshot_sources (snapshot_id, source_observation_id) VALUES (${snapshot}, ${observation})`;
  }

  private now() {
    return this.handle.engine === 'sqlite'
      ? Date.now()
      : new Date().toISOString();
  }

  async create(
    candidate: string,
    key: string,
    input: ManualOpportunityInput,
    acknowledgement?: string,
  ) {
    return this.execute(
      this.writeCreate(candidate, key, validated(input), acknowledgement),
      true,
    );
  }

  private *writeCreate(
    candidate: string,
    key: string,
    input: ManualOpportunityInput,
    acknowledgement?: string,
  ): Operation<{
    record: ReturnType<typeof present>;
    replayed: boolean;
  }> {
    yield* this.lock(candidate);
    const hash = digest([1, payload(input), acknowledgement ?? null]);
    const [prior] =
      (yield sql`${current} AND c.candidate_id = ${candidate} AND c.create_idempotency_key = ${key}`) as unknown as RevisionRow[];
    if (prior) {
      if (prior.requestHash !== hash)
        throw new ManualOpportunityError('IDEMPOTENCY_KEY_REUSED');
      return { record: present(prior), replayed: true };
    }
    yield* this.assertSeparate(candidate, input, null, acknowledgement);
    const id = randomUUID();
    const now = this.now();
    const dedup = comparison(input);
    yield sql`INSERT INTO opportunities (id, created_at, visibility, owner_candidate_id)
        VALUES (${id}, ${now}, 'CANDIDATE_PRIVATE', ${candidate})`;
    yield sql`INSERT INTO source_listings (id, opportunity_id, source_system, source_external_id, created_at)
        VALUES (${id}, ${id}, 'MANUAL', ${id}, ${now})`;
    yield* this.revision(id, 1, input, now);
    yield sql`INSERT INTO manual_opportunity_captures
        (opportunity_id, candidate_id, version, normalized_url, match_key, duplicate_fingerprint, duplicate_slot,
         create_idempotency_key, create_request_hash, created_at, updated_at)
        VALUES (${id}, ${candidate}, 1, ${dedup.url}, ${dedup.key}, ${dedup.fingerprint},
         ${acknowledgement ? 'distinct:' + key : 'default'}, ${key}, ${hash}, ${now}, ${now})`;
    return {
      record: present((yield* this.find(candidate, id))!),
      replayed: false,
    };
  }

  async edit(
    candidate: string,
    id: string,
    version: number,
    input: ManualOpportunityInput,
    acknowledgement?: string,
  ) {
    return this.execute(
      this.writeEdit(candidate, id, version, validated(input), acknowledgement),
      true,
    );
  }

  private *writeEdit(
    candidate: string,
    id: string,
    version: number,
    input: ManualOpportunityInput,
    acknowledgement?: string,
  ): Operation<ReturnType<typeof present>> {
    yield* this.lock(candidate);
    const before = yield* this.find(candidate, id);
    if (!before) throw new ManualOpportunityError('NOT_FOUND');
    if (before.version !== version)
      throw new ManualOpportunityError('STALE_VERSION');
    if (JSON.stringify(payload(before)) === JSON.stringify(payload(input)))
      return present(before);
    yield* this.assertSeparate(candidate, input, id, acknowledgement);
    const dedup = comparison(input);
    const now = this.now();
    yield* this.revision(id, version + 1, input, now);
    yield sql`UPDATE manual_opportunity_captures SET version = ${version + 1}, updated_at = ${now},
        normalized_url = ${dedup.url}, match_key = ${dedup.key}, duplicate_fingerprint = ${dedup.fingerprint},
        duplicate_slot = ${acknowledgement ? 'distinct:' + id : before.slot}
        WHERE candidate_id = ${candidate} AND opportunity_id = ${id} AND version = ${version}`;
    return present((yield* this.find(candidate, id))!);
  }
}
