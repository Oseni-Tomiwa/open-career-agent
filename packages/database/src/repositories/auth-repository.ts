import { randomUUID } from 'node:crypto';

import { and, eq, gt, isNull } from 'drizzle-orm';

import type { DatabaseHandle } from '../client.js';
import { getTables } from '../schema-helper.js';

export interface AuthenticatedPrincipalRecord {
  readonly sessionId: string;
  readonly userId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly candidateIds: readonly string[];
  readonly primaryCandidateId: string;
  readonly expiresAt: Date;
}

export function normalizeEmail(email: string): string {
  return email.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export class AuthRepository {
  private sqliteWriteTail: Promise<void> = Promise.resolve();

  public constructor(private readonly handle: DatabaseHandle) {}

  public async createAccount(input: {
    readonly email: string;
    readonly passwordHash: string;
    readonly emailVerifiedAt?: Date | null;
    readonly actionToken?: {
      readonly id: string;
      readonly purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
      readonly tokenHash: string;
      readonly expiresAt: Date;
    };
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
    const { users, candidates, userCandidates, sessions, authActionTokens } =
      getTables(this.handle);
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
          emailVerifiedAt: input.emailVerifiedAt ?? null,
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

        if (input.actionToken) {
          await db.insert(authActionTokens).values({
            ...input.actionToken,
            userId,
            usedAt: null,
            createdAt: now,
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
        emailVerifiedAt: input.emailVerifiedAt ?? null,
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

      if (input.actionToken) {
        await transaction.insert(authActionTokens).values({
          ...input.actionToken,
          userId,
          usedAt: null,
          createdAt: now,
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

  public async findUserById(userId: string): Promise<any | null> {
    const { users } = getTables(this.handle);
    const rows = await (this.handle.db as any)
      .select()
      .from(users)
      .where(eq(users.id, userId));
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
        emailVerifiedAt: users.emailVerifiedAt,
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
      emailVerified: Boolean(session.emailVerifiedAt),
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

  public async revokeSessionsForUser(
    userId: string,
    now = new Date(),
  ): Promise<number> {
    const { sessions } = getTables(this.handle);
    const rows = await (this.handle.db as any)
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
      .returning();
    return rows.length;
  }

  public async issueActionToken(input: {
    readonly userId: string;
    readonly purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
    readonly tokenHash: string;
    readonly expiresAt: Date;
    readonly now?: Date;
  }): Promise<void> {
    const now = input.now ?? new Date();
    const { authActionTokens } = getTables(this.handle);
    await this.writeTransaction(async (transaction) => {
      await transaction
        .update(authActionTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(authActionTokens.userId, input.userId),
            eq(authActionTokens.purpose, input.purpose),
            isNull(authActionTokens.usedAt),
          ),
        );
      await transaction.insert(authActionTokens).values({
        id: `aat_${randomUUID()}`,
        userId: input.userId,
        purpose: input.purpose,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        usedAt: null,
        createdAt: now,
      });
    });
  }

  public async latestActionTokenCreatedAt(
    userId: string,
    purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET',
  ): Promise<Date | null> {
    const { authActionTokens } = getTables(this.handle);
    const rows = await (this.handle.db as any)
      .select({ createdAt: authActionTokens.createdAt })
      .from(authActionTokens)
      .where(
        and(
          eq(authActionTokens.userId, userId),
          eq(authActionTokens.purpose, purpose),
        ),
      );
    const newest = rows.reduce((value: Date | null, row: any) => {
      const createdAt =
        row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
      return !value || createdAt > value ? createdAt : value;
    }, null);
    return newest;
  }

  public async consumeEmailVerification(
    tokenHash: string,
    now = new Date(),
  ): Promise<{ userId: string; email: string } | null> {
    const { authActionTokens, users } = getTables(this.handle);
    return this.writeTransaction(async (transaction) => {
      const tokens = await transaction
        .select()
        .from(authActionTokens)
        .where(
          and(
            eq(authActionTokens.tokenHash, tokenHash),
            eq(authActionTokens.purpose, 'EMAIL_VERIFICATION'),
            isNull(authActionTokens.usedAt),
            gt(authActionTokens.expiresAt, now),
          ),
        );
      const token = tokens[0];
      if (!token) return null;
      const userRows = await transaction
        .select()
        .from(users)
        .where(eq(users.id, token.userId));
      const user = userRows[0];
      if (!user) return null;
      await transaction
        .update(authActionTokens)
        .set({ usedAt: now })
        .where(eq(authActionTokens.id, token.id));
      await transaction
        .update(users)
        .set({ emailVerifiedAt: now, updatedAt: now })
        .where(eq(users.id, token.userId));
      return { userId: user.id, email: user.email };
    });
  }

  public async consumePasswordReset(input: {
    readonly tokenHash: string;
    readonly passwordHash: string;
    readonly now?: Date;
  }): Promise<boolean> {
    const now = input.now ?? new Date();
    const { authActionTokens, users, sessions } = getTables(this.handle);
    return this.writeTransaction(async (transaction) => {
      const tokens = await transaction
        .select()
        .from(authActionTokens)
        .where(
          and(
            eq(authActionTokens.tokenHash, input.tokenHash),
            eq(authActionTokens.purpose, 'PASSWORD_RESET'),
            isNull(authActionTokens.usedAt),
            gt(authActionTokens.expiresAt, now),
          ),
        );
      const token = tokens[0];
      if (!token) return false;
      await transaction
        .update(authActionTokens)
        .set({ usedAt: now })
        .where(eq(authActionTokens.id, token.id));
      await transaction
        .update(users)
        .set({ passwordHash: input.passwordHash, updatedAt: now })
        .where(eq(users.id, token.userId));
      await transaction
        .update(sessions)
        .set({ revokedAt: now })
        .where(
          and(eq(sessions.userId, token.userId), isNull(sessions.revokedAt)),
        );
      return true;
    });
  }

  public async createOAuthAttempt(input: {
    readonly provider: 'google' | 'apple';
    readonly stateHash: string;
    readonly nonceHash: string;
    readonly redirectPath: string;
    readonly expiresAt: Date;
    readonly now?: Date;
  }): Promise<void> {
    const now = input.now ?? new Date();
    const { oauthAttempts } = getTables(this.handle);
    await (this.handle.db as any).insert(oauthAttempts).values({
      id: `oauth_${randomUUID()}`,
      ...input,
      usedAt: null,
      createdAt: now,
    });
  }

  public async consumeOAuthAttempt(input: {
    readonly provider: 'google' | 'apple';
    readonly stateHash: string;
    readonly now?: Date;
  }): Promise<{ nonceHash: string; redirectPath: string } | null> {
    const now = input.now ?? new Date();
    const { oauthAttempts } = getTables(this.handle);
    return this.writeTransaction(async (transaction) => {
      const rows = await transaction
        .select()
        .from(oauthAttempts)
        .where(
          and(
            eq(oauthAttempts.provider, input.provider),
            eq(oauthAttempts.stateHash, input.stateHash),
            isNull(oauthAttempts.usedAt),
            gt(oauthAttempts.expiresAt, now),
          ),
        );
      const attempt = rows[0];
      if (!attempt) return null;
      await transaction
        .update(oauthAttempts)
        .set({ usedAt: now })
        .where(eq(oauthAttempts.id, attempt.id));
      return {
        nonceHash: attempt.nonceHash,
        redirectPath: attempt.redirectPath,
      };
    });
  }

  public async authenticateOAuthIdentity(input: {
    readonly provider: 'google' | 'apple';
    readonly providerSubject: string;
    readonly providerEmail?: string;
    readonly providerEmailVerified: boolean;
    readonly passwordHash: string;
    readonly session: { readonly tokenHash: string; readonly expiresAt: Date };
    readonly now?: Date;
  }): Promise<{ userId: string; candidateId: string; sessionId: string }> {
    const now = input.now ?? new Date();
    const { users, candidates, userCandidates, sessions, userIdentities } =
      getTables(this.handle);
    return this.writeTransaction(async (transaction) => {
      const identities = await transaction
        .select()
        .from(userIdentities)
        .where(
          and(
            eq(userIdentities.provider, input.provider),
            eq(userIdentities.providerSubject, input.providerSubject),
          ),
        );
      let userId = identities[0]?.userId as string | undefined;
      let candidateId: string | undefined;

      if (!userId) {
        if (input.providerEmail && input.providerEmailVerified) {
          const emailRows = await transaction
            .select()
            .from(users)
            .where(
              eq(users.normalizedEmail, normalizeEmail(input.providerEmail)),
            );
          userId = emailRows[0]?.id;
        }
        if (!userId) {
          userId = `usr_${randomUUID()}`;
          candidateId = `candidate_${randomUUID()}`;
          const email =
            input.providerEmail && input.providerEmailVerified
              ? input.providerEmail.trim()
              : `${input.provider}-${input.providerSubject}@identity.invalid`;
          await transaction.insert(users).values({
            id: userId,
            email,
            normalizedEmail: normalizeEmail(email),
            passwordHash: input.passwordHash,
            emailVerifiedAt:
              input.providerEmail && input.providerEmailVerified ? now : null,
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
        }
        await transaction.insert(userIdentities).values({
          id: `uid_${randomUUID()}`,
          userId,
          provider: input.provider,
          providerSubject: input.providerSubject,
          providerEmail: input.providerEmail ?? null,
          providerEmailVerified: input.providerEmailVerified,
          createdAt: now,
          updatedAt: now,
        });
      }

      if (!candidateId) {
        const grants = await transaction
          .select()
          .from(userCandidates)
          .where(eq(userCandidates.userId, userId));
        const primary =
          grants.find((grant: any) => grant.isPrimary) ?? grants[0];
        if (!primary) throw new Error('OAuth account has no Candidate owner.');
        candidateId = primary.candidateId;
      }
      const sessionId = `ses_${randomUUID()}`;
      await transaction.insert(sessions).values({
        id: sessionId,
        userId,
        tokenHash: input.session.tokenHash,
        expiresAt: input.session.expiresAt,
        revokedAt: null,
        createdAt: now,
        lastSeenAt: now,
      });
      return { userId, candidateId: candidateId!, sessionId };
    });
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

  private async writeTransaction<T>(
    work: (transaction: any) => Promise<T>,
  ): Promise<T> {
    const db = this.handle.db as any;
    if (this.handle.engine === 'sqlite' && this.handle.sqlite) {
      const previousWrite = this.sqliteWriteTail;
      let releaseWrite: () => void = () => undefined;
      this.sqliteWriteTail = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      await previousWrite;
      let transactionStarted = false;
      try {
        this.handle.sqlite.exec('BEGIN IMMEDIATE');
        transactionStarted = true;
        const result = await work(db);
        this.handle.sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        if (transactionStarted) this.handle.sqlite.exec('ROLLBACK');
        throw error;
      } finally {
        releaseWrite();
      }
    }
    return db.transaction(work);
  }
}
