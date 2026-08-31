import { randomUUID } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';

import type { DatabaseHandle } from '../client.js';
import { getTables } from '../schema-helper.js';

export interface AuthenticatedPrincipalRecord {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly candidateIds: readonly string[];
  readonly primaryCandidateId: string;
  readonly expiresAt: Date;
}

export function normalizeEmail(email: string): string {
  return email.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export class AuthRepository {
  public constructor(private readonly handle: DatabaseHandle) {}

  public async createAccount(input: {
    readonly email: string;
    readonly passwordHash: string;
    readonly session?: {
      readonly tokenHash: string;
      readonly expiresAt: Date;
    };
    readonly now?: Date;
  }): Promise<{
    readonly userId: string;
    readonly candidateId: string;
    readonly sessionId?: string;
  }> {
    const now = input.now ?? new Date();
    const email = input.email.trim();
    const normalizedEmail = normalizeEmail(email);
    const userId = `usr_${randomUUID()}`;
    const candidateId = `candidate_${randomUUID()}`;
    const sessionId = input.session ? `ses_${randomUUID()}` : undefined;
    const { users, candidates, userCandidates, sessions } = getTables(
      this.handle,
    );
    const db = this.handle.db as any;

    if (this.handle.engine === 'sqlite' && this.handle.sqlite) {
      const sqlite = this.handle.sqlite;
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        await db.insert(users).values({
          id: userId,
          email,
          normalizedEmail,
          passwordHash: input.passwordHash,
          createdAt: now,
          updatedAt: now,
        });

        await db.insert(candidates).values({
          id: candidateId,
          createdAt: now,
          updatedAt: now,
        });

        await db.insert(userCandidates).values({
          id: `uc_${randomUUID()}`,
          userId,
          candidateId,
          relationship: 'OWNER',
          isPrimary: true,
          createdAt: now,
        });

        if (input.session && sessionId) {
          await db.insert(sessions).values({
            id: sessionId,
            userId,
            tokenHash: input.session.tokenHash,
            expiresAt: input.session.expiresAt,
            revokedAt: null,
            createdAt: now,
            lastSeenAt: now,
          });
        }

        sqlite.exec('COMMIT');
        return {
          userId,
          candidateId,
          ...(sessionId ? { sessionId } : {}),
        };
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    }

    return await db.transaction(async (transaction: any) => {
      await transaction.insert(users).values({
        id: userId,
        email,
        normalizedEmail,
        passwordHash: input.passwordHash,
        createdAt: now,
        updatedAt: now,
      });

      await transaction.insert(candidates).values({
        id: candidateId,
        createdAt: now,
        updatedAt: now,
      });

      await transaction.insert(userCandidates).values({
        id: `uc_${randomUUID()}`,
        userId,
        candidateId,
        relationship: 'OWNER',
        isPrimary: true,
        createdAt: now,
      });

      if (input.session && sessionId) {
        await transaction.insert(sessions).values({
          id: sessionId,
          userId,
          tokenHash: input.session.tokenHash,
          expiresAt: input.session.expiresAt,
          revokedAt: null,
          createdAt: now,
          lastSeenAt: now,
        });
      }

      return {
        userId,
        candidateId,
        ...(sessionId ? { sessionId } : {}),
      };
    });
  }

  public async findUserByEmail(email: string): Promise<any | null> {
    const { users } = getTables(this.handle);
    const db = this.handle.db as any;
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.normalizedEmail, normalizeEmail(email)));
    return rows[0] ?? null;
  }

  public async createSession(input: {
    readonly userId: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
    readonly now?: Date;
  }): Promise<string> {
    const now = input.now ?? new Date();
    const id = `ses_${randomUUID()}`;
    const { sessions } = getTables(this.handle);
    const db = this.handle.db as any;

    await db.insert(sessions).values({
      id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: now,
      lastSeenAt: now,
    });

    return id;
  }

  public async findActiveSession(
    tokenHash: string,
    now = new Date(),
  ): Promise<AuthenticatedPrincipalRecord | null> {
    const { sessions, users, userCandidates } = getTables(this.handle);
    const db = this.handle.db as any;

    const sessionRows = await db
      .select({
        sessionId: sessions.id,
        userId: users.id,
        email: users.email,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      );

    const session = sessionRows[0];
    if (!session) return null;

    const grants = await db
      .select({
        candidateId: userCandidates.candidateId,
        isPrimary: userCandidates.isPrimary,
      })
      .from(userCandidates)
      .where(eq(userCandidates.userId, session.userId));

    const primary = grants.find((grant: any) => grant.isPrimary) ?? grants[0];
    if (!primary) return null;

    return {
      sessionId: session.sessionId,
      userId: session.userId,
      email: session.email,
      expiresAt:
        session.expiresAt instanceof Date
          ? session.expiresAt
          : new Date(session.expiresAt),
      candidateIds: grants.map((grant: any) => grant.candidateId),
      primaryCandidateId: primary.candidateId,
    };
  }

  public async revokeSession(
    sessionId: string,
    now = new Date(),
  ): Promise<boolean> {
    const { sessions } = getTables(this.handle);
    const db = this.handle.db as any;
    const result = await db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .returning();
    return result.length > 0;
  }

  public async userCanAccessCandidate(
    userId: string,
    candidateId: string,
  ): Promise<boolean> {
    const { userCandidates } = getTables(this.handle);
    const db = this.handle.db as any;
    const rows = await db
      .select({ id: userCandidates.id })
      .from(userCandidates)
      .where(
        and(
          eq(userCandidates.userId, userId),
          eq(userCandidates.candidateId, candidateId),
        ),
      );
    return rows.length > 0;
  }
}
