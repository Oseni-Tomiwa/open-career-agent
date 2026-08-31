import { randomUUID } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';

import type { DatabaseHandle } from '../client.js';
import { candidates, sessions, userCandidates, users } from '../schema.js';

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

  public createAccount(input: {
    readonly email: string;
    readonly passwordHash: string;
    readonly session?: {
      readonly tokenHash: string;
      readonly expiresAt: Date;
    };
    readonly now?: Date;
  }): {
    readonly userId: string;
    readonly candidateId: string;
    readonly sessionId?: string;
  } {
    const now = input.now ?? new Date();
    const email = input.email.trim();
    const normalizedEmail = normalizeEmail(email);
    const userId = `usr_${randomUUID()}`;
    const candidateId = `candidate_${randomUUID()}`;
    const sessionId = input.session ? `ses_${randomUUID()}` : undefined;

    return this.handle.db.transaction((transaction) => {
      transaction
        .insert(users)
        .values({
          id: userId,
          email,
          normalizedEmail,
          passwordHash: input.passwordHash,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      transaction
        .insert(candidates)
        .values({ id: candidateId, createdAt: now, updatedAt: now })
        .run();
      transaction
        .insert(userCandidates)
        .values({
          id: `uc_${randomUUID()}`,
          userId,
          candidateId,
          relationship: 'OWNER',
          isPrimary: true,
          createdAt: now,
        })
        .run();
      if (input.session && sessionId) {
        transaction
          .insert(sessions)
          .values({
            id: sessionId,
            userId,
            tokenHash: input.session.tokenHash,
            expiresAt: input.session.expiresAt,
            revokedAt: null,
            createdAt: now,
            lastSeenAt: now,
          })
          .run();
      }
      return {
        userId,
        candidateId,
        ...(sessionId ? { sessionId } : {}),
      };
    });
  }

  public findUserByEmail(email: string) {
    return (
      this.handle.db
        .select()
        .from(users)
        .where(eq(users.normalizedEmail, normalizeEmail(email)))
        .get() ?? null
    );
  }

  public createSession(input: {
    readonly userId: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
    readonly now?: Date;
  }): string {
    const now = input.now ?? new Date();
    const id = `ses_${randomUUID()}`;
    this.handle.db
      .insert(sessions)
      .values({
        id,
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
        createdAt: now,
        lastSeenAt: now,
      })
      .run();
    return id;
  }

  public findActiveSession(
    tokenHash: string,
    now = new Date(),
  ): AuthenticatedPrincipalRecord | null {
    const session = this.handle.db
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
      )
      .get();

    if (!session) return null;
    const grants = this.handle.db
      .select({
        candidateId: userCandidates.candidateId,
        isPrimary: userCandidates.isPrimary,
      })
      .from(userCandidates)
      .where(eq(userCandidates.userId, session.userId))
      .all();
    const primary = grants.find((grant) => grant.isPrimary) ?? grants[0];
    if (!primary) return null;

    return {
      ...session,
      candidateIds: grants.map((grant) => grant.candidateId),
      primaryCandidateId: primary.candidateId,
    };
  }

  public revokeSession(sessionId: string, now = new Date()): boolean {
    const result = this.handle.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
      .run();
    return result.changes > 0;
  }

  public userCanAccessCandidate(userId: string, candidateId: string): boolean {
    return Boolean(
      this.handle.db
        .select({ id: userCandidates.id })
        .from(userCandidates)
        .where(
          and(
            eq(userCandidates.userId, userId),
            eq(userCandidates.candidateId, candidateId),
          ),
        )
        .get(),
    );
  }
}
