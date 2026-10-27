import crypto from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from './index.ts';
import { authSessions, users, type DbSession, type DbUser } from './schema.ts';
import {
  generateOpaqueToken,
  generateRecoveryKey,
  hashOpaqueToken,
  hashPassword,
  normalizeRecoveryKey,
  verifyOpaqueTokenConstantTime,
  verifyPassword,
} from '../server/cryptoUtils.ts';
import {
  getSupabaseServerClient,
  isSupabaseConfigured,
  isSupabaseTableMissingError,
  isSupabaseUniqueViolation,
  mapSupabaseSessionToDbSession,
  mapSupabaseUserToDbUser,
  serializeRecoveryAndPass,
  type SupabaseSessionRow,
  type SupabaseUserRow,
} from '../lib/supabaseServer.ts';

export const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

export class AppDomainError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number, code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AppDomainError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function hasPgPoolCredentials(): boolean {
  const host = process.env.SQL_HOST?.trim();
  const dbName = process.env.SQL_DB_NAME?.trim();
  const user = process.env.SQL_USER?.trim();
  const pass = process.env.SQL_PASSWORD?.trim();
  return Boolean(
    host &&
      dbName &&
      user &&
      pass &&
      pass !== 'YOUR_SQL_APP_PASSWORD' &&
      user !== 'zolo_app_user'
  );
}

function throwIfSupabaseSchemaMissingWithoutFallback(): never {
  throw new AppDomainError(
    'Supabase tables are not initialized yet. Run supabase_schema.sql in your Supabase Dashboard SQL Editor.',
    503,
    'SUPABASE_SCHEMA_NOT_INITIALIZED'
  );
}

function inspectUniqueViolation(error: unknown): 'phone' | 'username' | 'other' | null {
  const sbViolation = isSupabaseUniqueViolation(error);
  if (sbViolation) return sbViolation;

  const candidates = [
    error as { code?: string; constraint?: string; detail?: string } | undefined,
    (error as { cause?: { code?: string; constraint?: string; detail?: string } } | undefined)
      ?.cause,
  ];

  for (const err of candidates) {
    if (err && err.code === '23505') {
      const constraint = (err.constraint || err.detail || '').toLowerCase();
      if (constraint.includes('phone')) return 'phone';
      if (constraint.includes('username')) return 'username';
      return 'other';
    }
  }
  return null;
}

export interface PublicUserDto {
  id: number;
  uid: string;
  phoneNormalized: string;
  countryCode: string;
  phoneVerified: boolean;
  fullName: string;
  username: string;
  about: string;
  avatarUrl: string | null;
  email: string | null;
  hasGoogleLinked: boolean;
  hasPassword: boolean;
  createdAt: string;
}

export function toPublicUser(user: DbUser): PublicUserDto {
  return {
    id: user.id,
    uid: user.uid,
    phoneNormalized: user.phoneNormalized,
    countryCode: user.countryCode,
    phoneVerified: user.phoneVerified,
    fullName: user.fullName,
    username: user.username || user.phoneNormalized,
    about: user.about,
    avatarUrl: user.avatarUrl ?? null,
    email: user.email ?? null,
    hasGoogleLinked: Boolean(user.firebaseUid),
    hasPassword: Boolean(user.passwordHash),
    createdAt: user.createdAt.toISOString(),
  };
}

export async function checkDatabaseHealth(): Promise<{
  provider: 'supabase' | 'postgresql' | 'supabase+postgresql';
}> {
  const supabase = getSupabaseServerClient();
  let supabaseReady = false;
  let pgReady = false;

  if (supabase) {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (!error) {
      supabaseReady = true;
    } else if (!isSupabaseTableMissingError(error) && !hasPgPoolCredentials()) {
      throw new Error(`Supabase connection error: ${error.message}`);
    }
  }

  if (hasPgPoolCredentials()) {
    try {
      await db.select({ id: users.id }).from(users).limit(1);
      pgReady = true;
    } catch (error) {
      if (!supabaseReady) {
        console.error('Database health check failed:', error);
        throw new Error('Database connection unavailable.', { cause: error });
      }
    }
  }

  if (supabaseReady && pgReady) return { provider: 'supabase+postgresql' };
  if (supabaseReady) return { provider: 'supabase' };
  if (pgReady) return { provider: 'postgresql' };

  if (isSupabaseConfigured()) {
    return { provider: 'supabase' };
  }

  throw new Error('No database connection available.');
}

export async function findUserByPhone(phoneNormalized: string): Promise<DbUser | null> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone_normalized', phoneNormalized)
      .maybeSingle();

    if (!error) {
      if (data) return mapSupabaseUserToDbUser(data as SupabaseUserRow);
      if (!hasPgPoolCredentials()) return null;
    } else if (!isSupabaseTableMissingError(error) && !hasPgPoolCredentials()) {
      throw new Error('Database lookup failed. Please try again.', { cause: error });
    } else if (isSupabaseTableMissingError(error) && !hasPgPoolCredentials()) {
      throwIfSupabaseSchemaMissingWithoutFallback();
    }
  }

  try {
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.phoneNormalized, phoneNormalized))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('findUserByPhone query failed:', error);
    throw new Error('Database lookup failed. Please try again.', { cause: error });
  }
}

export async function findUserById(userId: number): Promise<DbUser | null> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (!error && data) {
      return mapSupabaseUserToDbUser(data as SupabaseUserRow);
    }
    if (!hasPgPoolCredentials()) {
      if (error && isSupabaseTableMissingError(error)) {
        throwIfSupabaseSchemaMissingWithoutFallback();
      }
      return null;
    }
  }

  try {
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error('findUserById query failed:', error);
    throw new Error('Database lookup failed. Please try again.', { cause: error });
  }
}

async function createSupabaseSession(params: {
  userId: number;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{ rawSessionToken: string; session: DbSession } | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const rawSessionToken = generateOpaqueToken(32);
  const tokenHash = hashOpaqueToken(rawSessionToken);
  const sessionId = `ses_${crypto.randomBytes(16).toString('hex')}`;
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const { data, error } = await supabase
    .from('auth_sessions')
    .insert({
      session_id: sessionId,
      user_id: params.userId,
      token_hash: tokenHash,
      user_agent: params.userAgent ? params.userAgent.slice(0, 255) : null,
      ip_address: params.ipAddress ?? null,
      expires_at: expiresAt.toISOString(),
      last_active_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) {
    if (!hasPgPoolCredentials()) {
      if (error && isSupabaseTableMissingError(error)) {
        throwIfSupabaseSchemaMissingWithoutFallback();
      }
      throw new Error('Failed to create session in Supabase.', { cause: error });
    }
    return null;
  }

  return {
    rawSessionToken,
    session: mapSupabaseSessionToDbSession(data as SupabaseSessionRow),
  };
}

async function createSessionInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: {
    userId: number;
    userAgent?: string;
    ipAddress?: string;
    rawTokenOverride?: string;
    sessionIdOverride?: string;
  }
): Promise<{ rawSessionToken: string; session: DbSession }> {
  const rawSessionToken = params.rawTokenOverride ?? generateOpaqueToken(32);
  const tokenHash = hashOpaqueToken(rawSessionToken);
  const sessionId = params.sessionIdOverride ?? `ses_${crypto.randomBytes(16).toString('hex')}`;
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const inserted = await tx
    .insert(authSessions)
    .values({
      sessionId,
      userId: params.userId,
      tokenHash,
      userAgent: params.userAgent ? params.userAgent.slice(0, 255) : null,
      ipAddress: params.ipAddress ?? null,
      expiresAt,
      lastActiveAt: new Date(),
    })
    .returning();

  return { rawSessionToken, session: inserted[0] };
}

/**
 * Registers a lifetime user account directly using the normalized mobile number
 * as the unique account username (no SMS OTP required).
 */
export async function registerUserDirect(params: {
  phoneNormalized: string;
  countryCode: string;
  fullName: string;
  password: string;
  avatarUrl: string | null;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{
  user: DbUser;
  rawSessionToken: string;
  session: DbSession;
  recoveryKey: string;
}> {
  const passwordHash = hashPassword(params.password);
  const recoveryKey = generateRecoveryKey();
  const recoveryKeyHash = hashOpaqueToken(normalizeRecoveryKey(recoveryKey));
  const uid = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
  // Mobile number itself is the unique username
  const mobileUsername = params.phoneNormalized;

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const existingCheck = await supabase
      .from('users')
      .select('id')
      .eq('phone_normalized', params.phoneNormalized)
      .maybeSingle();

    if (!existingCheck.error) {
      if (existingCheck.data) {
        throw new AppDomainError(
          'An account with this mobile number already exists. Please log in instead.',
          409,
          'PHONE_ALREADY_REGISTERED'
        );
      }

      const compositeRecoveryHash = serializeRecoveryAndPass(recoveryKeyHash, passwordHash);
      const { data: insertedRow, error: insertErr } = await supabase
        .from('users')
        .insert({
          uid,
          phone_normalized: params.phoneNormalized,
          country_code: params.countryCode,
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
          full_name: params.fullName.trim(),
          username: mobileUsername,
          about: 'Hey there! I am using ZOLO.',
          avatar_url: params.avatarUrl,
          recovery_key_hash: compositeRecoveryHash,
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (insertErr) {
        const violation = inspectUniqueViolation(insertErr);
        if (violation === 'phone' || violation === 'username') {
          throw new AppDomainError(
            'An account with this mobile number already exists. Please log in instead.',
            409,
            'PHONE_ALREADY_REGISTERED'
          );
        }
        if (!hasPgPoolCredentials()) {
          throw new Error('Registration failed in Supabase.', { cause: insertErr });
        }
      } else if (insertedRow) {
        const sbUser = mapSupabaseUserToDbUser(insertedRow as SupabaseUserRow);
        const sbSession = await createSupabaseSession({
          userId: sbUser.id,
          userAgent: params.userAgent,
          ipAddress: params.ipAddress,
        });

        // Mirror to PostgreSQL pool if active so both stay in sync
        if (hasPgPoolCredentials() && sbSession) {
          db.transaction(async (tx) => {
            const existingPg = await tx
              .select({ id: users.id })
              .from(users)
              .where(eq(users.phoneNormalized, params.phoneNormalized))
              .limit(1);
            if (!existingPg.length) {
              const pgInserted = await tx
                .insert(users)
                .values({
                  uid: sbUser.uid,
                  phoneNormalized: sbUser.phoneNormalized,
                  countryCode: sbUser.countryCode,
                  phoneVerified: true,
                  phoneVerifiedAt: new Date(),
                  fullName: sbUser.fullName,
                  username: mobileUsername,
                  about: sbUser.about,
                  avatarUrl: sbUser.avatarUrl,
                  passwordHash,
                  recoveryKeyHash,
                  updatedAt: new Date(),
                })
                .returning();
              await createSessionInTx(tx, {
                userId: pgInserted[0].id,
                userAgent: params.userAgent,
                ipAddress: params.ipAddress,
                rawTokenOverride: sbSession.rawSessionToken,
                sessionIdOverride: sbSession.session.sessionId,
              });
            }
          }).catch(() => {});
        }

        if (sbSession) {
          return {
            user: sbUser,
            rawSessionToken: sbSession.rawSessionToken,
            session: sbSession.session,
            recoveryKey,
          };
        }
      }
    } else if (isSupabaseTableMissingError(existingCheck.error) && !hasPgPoolCredentials()) {
      throwIfSupabaseSchemaMissingWithoutFallback();
    }
  }

  try {
    return await db.transaction(async (tx) => {
      const existingPhone = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phoneNormalized, params.phoneNormalized))
        .limit(1);

      if (existingPhone.length > 0) {
        throw new AppDomainError(
          'An account with this mobile number already exists. Please log in instead.',
          409,
          'PHONE_ALREADY_REGISTERED'
        );
      }

      const insertedUsers = await tx
        .insert(users)
        .values({
          uid,
          phoneNormalized: params.phoneNormalized,
          countryCode: params.countryCode,
          phoneVerified: true,
          phoneVerifiedAt: new Date(),
          fullName: params.fullName.trim(),
          username: mobileUsername,
          about: 'Hey there! I am using ZOLO.',
          avatarUrl: params.avatarUrl,
          passwordHash,
          recoveryKeyHash,
          updatedAt: new Date(),
        })
        .returning();

      const newUser = insertedUsers[0];
      const { rawSessionToken, session } = await createSessionInTx(tx, {
        userId: newUser.id,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      });

      return {
        user: newUser,
        rawSessionToken,
        session,
        recoveryKey,
      };
    });
  } catch (error) {
    if (error instanceof AppDomainError) throw error;

    const violation = inspectUniqueViolation(error);
    if (violation === 'phone' || violation === 'username') {
      throw new AppDomainError(
        'An account with this mobile number already exists. Please log in instead.',
        409,
        'PHONE_ALREADY_REGISTERED',
        { cause: error }
      );
    }

    console.error('registerUserDirect failed:', error);
    throw new Error('Registration failed due to a database error. Please try again.', {
      cause: error,
    });
  }
}

/**
 * Logs in an existing lifetime account by normalized mobile number AND password.
 * If an older legacy account had no password set yet, verifies and binds the entered password on first login.
 */
export async function loginUserByMobile(params: {
  phoneNormalized: string;
  password: string;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{
  user: DbUser;
  rawSessionToken: string;
  session: DbSession;
}> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone_normalized', params.phoneNormalized)
      .maybeSingle();

    if (!error) {
      if (data) {
        let sbUser = mapSupabaseUserToDbUser(data as SupabaseUserRow);
        if (sbUser.passwordHash) {
          if (!verifyPassword(params.password, sbUser.passwordHash)) {
            throw new AppDomainError(
              'Incorrect password for this mobile number. Please try again or reset via Recover.',
              401,
              'INVALID_PASSWORD'
            );
          }
        } else {
          // Legacy passwordless account upgrade on first password login
          const upgradedHash = hashPassword(params.password);
          const compositeHash = serializeRecoveryAndPass(sbUser.recoveryKeyHash, upgradedHash);
          const { data: upgradedRow } = await supabase
            .from('users')
            .update({ recovery_key_hash: compositeHash, updated_at: new Date().toISOString() })
            .eq('id', sbUser.id)
            .select('*')
            .maybeSingle();
          if (upgradedRow) {
            sbUser = mapSupabaseUserToDbUser(upgradedRow as SupabaseUserRow);
          } else {
            sbUser = { ...sbUser, passwordHash: upgradedHash };
          }
        }

        const sbSession = await createSupabaseSession({
          userId: sbUser.id,
          userAgent: params.userAgent,
          ipAddress: params.ipAddress,
        });

        if (sbSession) {
          return {
            user: sbUser,
            rawSessionToken: sbSession.rawSessionToken,
            session: sbSession.session,
          };
        }
      } else if (!hasPgPoolCredentials()) {
        throw new AppDomainError(
          'No ZOLO account found for this mobile number. Create an account to get started.',
          401,
          'ACCOUNT_NOT_FOUND'
        );
      }
    } else if (isSupabaseTableMissingError(error) && !hasPgPoolCredentials()) {
      throwIfSupabaseSchemaMissingWithoutFallback();
    }
  }

  try {
    return await db.transaction(async (tx) => {
      const found = await tx
        .select()
        .from(users)
        .where(eq(users.phoneNormalized, params.phoneNormalized))
        .limit(1);

      let user = found[0];
      if (!user) {
        throw new AppDomainError(
          'No ZOLO account found for this mobile number. Create an account to get started.',
          401,
          'ACCOUNT_NOT_FOUND'
        );
      }

      if (user.passwordHash) {
        if (!verifyPassword(params.password, user.passwordHash)) {
          throw new AppDomainError(
            'Incorrect password for this mobile number. Please try again or reset via Recover.',
            401,
            'INVALID_PASSWORD'
          );
        }
      } else {
        // Bind password for pre-existing legacy account
        const upgradedHash = hashPassword(params.password);
        const updatedRows = await tx
          .update(users)
          .set({ passwordHash: upgradedHash, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
        if (updatedRows[0]) {
          user = updatedRows[0];
        }
      }

      const { rawSessionToken, session } = await createSessionInTx(tx, {
        userId: user.id,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      });

      return { user, rawSessionToken, session };
    });
  } catch (error) {
    if (error instanceof AppDomainError) throw error;
    console.error('loginUserByMobile failed:', error);
    throw new Error('Login failed due to a server error. Please try again.', { cause: error });
  }
}

export async function getSessionWithUser(
  rawSessionToken: string
): Promise<{ user: DbUser; session: DbSession } | null> {
  if (!rawSessionToken) return null;
  const tokenHash = hashOpaqueToken(rawSessionToken);

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const nowIso = new Date().toISOString();
    const { data: sessRow, error: sessErr } = await supabase
      .from('auth_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .gt('expires_at', nowIso)
      .maybeSingle();

    if (!sessErr && sessRow) {
      const sbSession = mapSupabaseSessionToDbSession(sessRow as SupabaseSessionRow);
      const { data: userRow, error: userErr } = await supabase
        .from('users')
        .select('*')
        .eq('id', sbSession.userId)
        .maybeSingle();

      if (!userErr && userRow) {
        if (Date.now() - sbSession.lastActiveAt.getTime() > 2 * 60 * 1000) {
          supabase
            .from('auth_sessions')
            .update({ last_active_at: new Date().toISOString() })
            .eq('id', sbSession.id)
            .then(() => {});
        }
        return {
          user: mapSupabaseUserToDbUser(userRow as SupabaseUserRow),
          session: sbSession,
        };
      }
    } else if (!hasPgPoolCredentials()) {
      return null;
    }
  }

  try {
    const rows = await db
      .select()
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(
        and(
          eq(authSessions.tokenHash, tokenHash),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!rows.length) return null;
    const { auth_sessions: session, users: user } = rows[0];

    if (Date.now() - session.lastActiveAt.getTime() > 2 * 60 * 1000) {
      db.update(authSessions)
        .set({ lastActiveAt: new Date() })
        .where(eq(authSessions.id, session.id))
        .catch(() => {});
    }

    return { user, session };
  } catch (error) {
    console.error('getSessionWithUser query failed:', error);
    throw new Error('Failed to validate session.', { cause: error });
  }
}

export async function revokeSingleSession(sessionId: string, userId: number): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('session_id', sessionId)
      .eq('user_id', userId);
    if (!error && !hasPgPoolCredentials()) return;
  }

  if (!hasPgPoolCredentials()) return;

  try {
    await db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.sessionId, sessionId), eq(authSessions.userId, userId)));
  } catch (error) {
    console.error('revokeSingleSession failed:', error);
    throw new Error('Failed to revoke session.', { cause: error });
  }
}

export async function revokeAllSessionsForUser(userId: number): Promise<number> {
  let sbRevoked = 0;
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('revoked_at', null)
      .select('id');

    if (!error && data) {
      sbRevoked = data.length;
      if (!hasPgPoolCredentials()) return sbRevoked;
    }
  }

  if (!hasPgPoolCredentials()) return sbRevoked;

  try {
    const updated = await db
      .update(authSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt)))
      .returning({ id: authSessions.id });
    return Math.max(sbRevoked, updated.length);
  } catch (error) {
    console.error('revokeAllSessionsForUser failed:', error);
    throw new Error('Failed to sign out of all devices.', { cause: error });
  }
}

export async function listActiveSessionsForUser(
  userId: number,
  currentSessionId: string
): Promise<
  Array<{
    sessionId: string;
    userAgent: string | null;
    ipAddress: string | null;
    createdAt: string;
    lastActiveAt: string;
    expiresAt: string;
    isCurrent: boolean;
  }>
> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('auth_sessions')
      .select('*')
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('last_active_at', { ascending: false });

    if (!error && data && (data.length > 0 || !hasPgPoolCredentials())) {
      return (data as SupabaseSessionRow[]).map((s) => ({
        sessionId: s.session_id,
        userAgent: s.user_agent,
        ipAddress: s.ip_address,
        createdAt: s.created_at,
        lastActiveAt: s.last_active_at,
        expiresAt: s.expires_at,
        isCurrent: s.session_id === currentSessionId,
      }));
    }
  }

  try {
    const rows = await db
      .select()
      .from(authSessions)
      .where(
        and(
          eq(authSessions.userId, userId),
          isNull(authSessions.revokedAt),
          gt(authSessions.expiresAt, new Date())
        )
      )
      .orderBy(desc(authSessions.lastActiveAt));

    return rows.map((s) => ({
      sessionId: s.sessionId,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      createdAt: s.createdAt.toISOString(),
      lastActiveAt: s.lastActiveAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isCurrent: s.sessionId === currentSessionId,
    }));
  } catch (error) {
    console.error('listActiveSessionsForUser failed:', error);
    throw new Error('Failed to fetch active sessions.', { cause: error });
  }
}

export async function updateUserProfileRecord(
  userId: number,
  updates: {
    fullName?: string;
    about?: string;
    avatarUrl?: string | null;
  }
): Promise<DbUser> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const sbPayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (updates.fullName !== undefined) sbPayload.full_name = updates.fullName.trim();
    if (updates.about !== undefined) sbPayload.about = updates.about.trim();
    if (updates.avatarUrl !== undefined) sbPayload.avatar_url = updates.avatarUrl;

    const { data, error } = await supabase
      .from('users')
      .update(sbPayload)
      .eq('id', userId)
      .select('*')
      .maybeSingle();

    if (!error && data) {
      if (!hasPgPoolCredentials()) {
        return mapSupabaseUserToDbUser(data as SupabaseUserRow);
      }
    } else if (!hasPgPoolCredentials()) {
      throw new AppDomainError('Account not found.', 404, 'ACCOUNT_NOT_FOUND');
    }
  }

  try {
    const payload: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (updates.fullName !== undefined) payload.fullName = updates.fullName.trim();
    if (updates.about !== undefined) payload.about = updates.about.trim();
    if (updates.avatarUrl !== undefined) payload.avatarUrl = updates.avatarUrl;

    const updated = await db
      .update(users)
      .set(payload)
      .where(eq(users.id, userId))
      .returning();

    if (!updated.length) {
      throw new AppDomainError('Account not found.', 404, 'ACCOUNT_NOT_FOUND');
    }
    return updated[0];
  } catch (error) {
    if (error instanceof AppDomainError) throw error;
    console.error('updateUserProfileRecord failed:', error);
    throw new Error('Failed to update profile.', { cause: error });
  }
}

export async function changePhoneNumberDirect(params: {
  userId: number;
  currentSessionId: string;
  newPhoneNormalized: string;
  newCountryCode: string;
}): Promise<DbUser> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: conflictRow, error: conflictErr } = await supabase
      .from('users')
      .select('id')
      .eq('phone_normalized', params.newPhoneNormalized)
      .maybeSingle();

    if (!conflictErr) {
      if (conflictRow && conflictRow.id !== params.userId) {
        throw new AppDomainError(
          'This mobile number already belongs to another ZOLO account.',
          409,
          'PHONE_ALREADY_REGISTERED'
        );
      }

      const { data: updatedRow, error: updateErr } = await supabase
        .from('users')
        .update({
          phone_normalized: params.newPhoneNormalized,
          username: params.newPhoneNormalized,
          country_code: params.newCountryCode,
          phone_verified: true,
          phone_verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.userId)
        .select('*')
        .maybeSingle();

      if (updateErr && inspectUniqueViolation(updateErr)) {
        throw new AppDomainError(
          'This mobile number already belongs to another ZOLO account.',
          409,
          'PHONE_ALREADY_REGISTERED'
        );
      }

      if (!updateErr && updatedRow) {
        await supabase
          .from('auth_sessions')
          .update({ revoked_at: new Date().toISOString() })
          .eq('user_id', params.userId)
          .is('revoked_at', null)
          .neq('session_id', params.currentSessionId);

        if (!hasPgPoolCredentials()) {
          return mapSupabaseUserToDbUser(updatedRow as SupabaseUserRow);
        }
      }
    }
  }

  try {
    return await db.transaction(async (tx) => {
      const conflict = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phoneNormalized, params.newPhoneNormalized))
        .limit(1);

      if (conflict.length > 0 && conflict[0].id !== params.userId) {
        throw new AppDomainError(
          'This mobile number already belongs to another ZOLO account.',
          409,
          'PHONE_ALREADY_REGISTERED'
        );
      }

      const updated = await tx
        .update(users)
        .set({
          phoneNormalized: params.newPhoneNormalized,
          username: params.newPhoneNormalized,
          countryCode: params.newCountryCode,
          phoneVerified: true,
          phoneVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(users.id, params.userId))
        .returning();

      if (!updated.length) {
        throw new AppDomainError('Account not found.', 404, 'ACCOUNT_NOT_FOUND');
      }

      const activeSessions = await tx
        .select()
        .from(authSessions)
        .where(and(eq(authSessions.userId, params.userId), isNull(authSessions.revokedAt)));

      for (const s of activeSessions) {
        if (s.sessionId !== params.currentSessionId) {
          await tx
            .update(authSessions)
            .set({ revokedAt: new Date() })
            .where(eq(authSessions.id, s.id));
        }
      }

      return updated[0];
    });
  } catch (error) {
    if (error instanceof AppDomainError) throw error;
    if (inspectUniqueViolation(error)) {
      throw new AppDomainError(
        'This mobile number already belongs to another ZOLO account.',
        409,
        'PHONE_ALREADY_REGISTERED',
        { cause: error }
      );
    }
    console.error('changePhoneNumberDirect failed:', error);
    throw new Error('Failed to update mobile number.', { cause: error });
  }
}

export async function linkFirebaseGoogleForRecovery(params: {
  userId: number;
  firebaseUid: string;
  email: string | null;
}): Promise<DbUser> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: existingLink, error: linkErr } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', params.firebaseUid)
      .maybeSingle();

    if (!linkErr) {
      if (existingLink && existingLink.id !== params.userId) {
        throw new AppDomainError(
          'This Google account is already linked to another ZOLO account.',
          409,
          'GOOGLE_ALREADY_LINKED'
        );
      }

      const { data: updated, error: updErr } = await supabase
        .from('users')
        .update({
          firebase_uid: params.firebaseUid,
          email: params.email,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.userId)
        .select('*')
        .maybeSingle();

      if (!updErr && updated && !hasPgPoolCredentials()) {
        return mapSupabaseUserToDbUser(updated as SupabaseUserRow);
      }
    }
  }

  try {
    const existingLink = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.firebaseUid, params.firebaseUid))
      .limit(1);

    if (existingLink.length > 0 && existingLink[0].id !== params.userId) {
      throw new AppDomainError(
        'This Google account is already linked to another ZOLO account.',
        409,
        'GOOGLE_ALREADY_LINKED'
      );
    }

    const updated = await db
      .update(users)
      .set({
        firebaseUid: params.firebaseUid,
        email: params.email,
        updatedAt: new Date(),
      })
      .where(eq(users.id, params.userId))
      .returning();

    return updated[0];
  } catch (error) {
    if (error instanceof AppDomainError) throw error;
    console.error('linkFirebaseGoogleForRecovery failed:', error);
    throw new Error('Failed to link Google recovery account.', { cause: error });
  }
}

export async function recoverAccountDirect(params: {
  oldPhoneNormalized: string;
  recoveryKey?: string;
  verifiedFirebaseUid?: string;
  newPhoneNormalized: string;
  newCountryCode: string;
  newPassword?: string;
  userAgent?: string;
  ipAddress?: string;
}): Promise<{
  user: DbUser;
  rawSessionToken: string;
  session: DbSession;
  newRecoveryKey: string;
}> {
  const nextRecoveryKey = generateRecoveryKey();
  const nextRecoveryKeyHash = hashOpaqueToken(normalizeRecoveryKey(nextRecoveryKey));
  const nextPasswordHash = params.newPassword ? hashPassword(params.newPassword) : undefined;

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: targetRow, error: targetErr } = await supabase
      .from('users')
      .select('*')
      .eq('phone_normalized', params.oldPhoneNormalized)
      .maybeSingle();

    if (!targetErr && targetRow) {
      const account = mapSupabaseUserToDbUser(targetRow as SupabaseUserRow);

      let ownershipVerified = false;
      if (params.recoveryKey && account.recoveryKeyHash) {
        ownershipVerified = verifyOpaqueTokenConstantTime(
          normalizeRecoveryKey(params.recoveryKey),
          account.recoveryKeyHash
        );
      } else if (
        params.verifiedFirebaseUid &&
        account.firebaseUid &&
        params.verifiedFirebaseUid === account.firebaseUid
      ) {
        ownershipVerified = true;
      }

      if (!ownershipVerified) {
        throw new AppDomainError(
          'Invalid recovery key or unlinked recovery identity. Account ownership could not be verified.',
          401,
          'RECOVERY_AUTH_FAILED'
        );
      }

      if (params.newPhoneNormalized !== params.oldPhoneNormalized) {
        const { data: conflict } = await supabase
          .from('users')
          .select('id')
          .eq('phone_normalized', params.newPhoneNormalized)
          .maybeSingle();
        if (conflict) {
          throw new AppDomainError(
            'The new mobile number is already registered to another account.',
            409,
            'PHONE_ALREADY_REGISTERED'
          );
        }
      }

      await supabase
        .from('auth_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', account.id)
        .is('revoked_at', null);

      const nextCompositeRecoveryHash = serializeRecoveryAndPass(
        nextRecoveryKeyHash,
        nextPasswordHash ?? account.passwordHash
      );
      const sbUpdatePayload: Record<string, unknown> = {
        phone_normalized: params.newPhoneNormalized,
        username: params.newPhoneNormalized,
        country_code: params.newCountryCode,
        phone_verified: true,
        phone_verified_at: new Date().toISOString(),
        recovery_key_hash: nextCompositeRecoveryHash,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedRow, error: updErr } = await supabase
        .from('users')
        .update(sbUpdatePayload)
        .eq('id', account.id)
        .select('*')
        .single();

      if (!updErr && updatedRow) {
        const updatedUser = mapSupabaseUserToDbUser(updatedRow as SupabaseUserRow);
        const sbSession = await createSupabaseSession({
          userId: updatedUser.id,
          userAgent: params.userAgent,
          ipAddress: params.ipAddress,
        });
        if (sbSession && !hasPgPoolCredentials()) {
          return {
            user: updatedUser,
            rawSessionToken: sbSession.rawSessionToken,
            session: sbSession.session,
            newRecoveryKey: nextRecoveryKey,
          };
        }
      }
    } else if (!targetErr && !targetRow && !hasPgPoolCredentials()) {
      throw new AppDomainError(
        'Could not verify recovery credentials for that account.',
        401,
        'RECOVERY_AUTH_FAILED'
      );
    }
  }

  try {
    return await db.transaction(async (tx) => {
      const targetRows = await tx
        .select()
        .from(users)
        .where(eq(users.phoneNormalized, params.oldPhoneNormalized))
        .limit(1);

      const account = targetRows[0];
      if (!account) {
        throw new AppDomainError(
          'Could not verify recovery credentials for that account.',
          401,
          'RECOVERY_AUTH_FAILED'
        );
      }

      let ownershipVerified = false;
      if (params.recoveryKey && account.recoveryKeyHash) {
        ownershipVerified = verifyOpaqueTokenConstantTime(
          normalizeRecoveryKey(params.recoveryKey),
          account.recoveryKeyHash
        );
      } else if (
        params.verifiedFirebaseUid &&
        account.firebaseUid &&
        params.verifiedFirebaseUid === account.firebaseUid
      ) {
        ownershipVerified = true;
      }

      if (!ownershipVerified) {
        throw new AppDomainError(
          'Invalid recovery key or unlinked recovery identity. Account ownership could not be verified.',
          401,
          'RECOVERY_AUTH_FAILED'
        );
      }

      if (params.newPhoneNormalized !== params.oldPhoneNormalized) {
        const existingNew = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.phoneNormalized, params.newPhoneNormalized))
          .limit(1);

        if (existingNew.length > 0) {
          throw new AppDomainError(
            'The new mobile number is already registered to another account.',
            409,
            'PHONE_ALREADY_REGISTERED'
          );
        }
      }

      await tx
        .update(authSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(authSessions.userId, account.id), isNull(authSessions.revokedAt)));

      const pgUpdatePayload: Partial<typeof users.$inferInsert> = {
        phoneNormalized: params.newPhoneNormalized,
        username: params.newPhoneNormalized,
        countryCode: params.newCountryCode,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
        recoveryKeyHash: nextRecoveryKeyHash,
        updatedAt: new Date(),
      };
      if (nextPasswordHash) {
        pgUpdatePayload.passwordHash = nextPasswordHash;
      }

      const updatedUsers = await tx
        .update(users)
        .set(pgUpdatePayload)
        .where(eq(users.id, account.id))
        .returning();

      const updatedUser = updatedUsers[0];
      const { rawSessionToken, session } = await createSessionInTx(tx, {
        userId: updatedUser.id,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      });

      return {
        user: updatedUser,
        rawSessionToken,
        session,
        newRecoveryKey: nextRecoveryKey,
      };
    });
  } catch (error) {
    if (error instanceof AppDomainError) throw error;
    if (inspectUniqueViolation(error)) {
      throw new AppDomainError(
        'The new mobile number is already registered to another account.',
        409,
        'PHONE_ALREADY_REGISTERED',
        { cause: error }
      );
    }
    console.error('recoverAccountDirect failed:', error);
    throw new Error('Account recovery failed due to a server error.', { cause: error });
  }
}

export async function changeAccountPassword(params: {
  userId: number;
  currentPassword?: string;
  newPassword: string;
}): Promise<DbUser> {
  const newPasswordHash = hashPassword(params.newPassword);

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: row, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', params.userId)
      .maybeSingle();

    if (!error && row) {
      const existing = mapSupabaseUserToDbUser(row as SupabaseUserRow);
      if (existing.passwordHash) {
        if (!params.currentPassword || !verifyPassword(params.currentPassword, existing.passwordHash)) {
          throw new AppDomainError('Current password is incorrect.', 401, 'INVALID_PASSWORD');
        }
      }
      const compositeHash = serializeRecoveryAndPass(existing.recoveryKeyHash, newPasswordHash);
      const { data: updatedRow, error: updErr } = await supabase
        .from('users')
        .update({ recovery_key_hash: compositeHash, updated_at: new Date().toISOString() })
        .eq('id', params.userId)
        .select('*')
        .maybeSingle();
      if (!updErr && updatedRow && !hasPgPoolCredentials()) {
        return mapSupabaseUserToDbUser(updatedRow as SupabaseUserRow);
      }
    }
  }

  const found = await db.select().from(users).where(eq(users.id, params.userId)).limit(1);
  const account = found[0];
  if (!account) {
    throw new AppDomainError('Account not found.', 401, 'ACCOUNT_NOT_FOUND');
  }

  if (account.passwordHash) {
    if (!params.currentPassword || !verifyPassword(params.currentPassword, account.passwordHash)) {
      throw new AppDomainError('Current password is incorrect.', 401, 'INVALID_PASSWORD');
    }
  }

  const updated = await db
    .update(users)
    .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
    .where(eq(users.id, params.userId))
    .returning();

  return updated[0];
}

export async function saveUserChatState(userId: number, chatStateJson: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase
      .from('users')
      .update({ chat_state_json: chatStateJson, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (!error && !hasPgPoolCredentials()) return;
  }

  if (!hasPgPoolCredentials()) return;

  try {
    await db
      .update(users)
      .set({ chatStateJson, updatedAt: new Date() })
      .where(eq(users.id, userId));
  } catch (error) {
    console.error('saveUserChatState failed:', error);
    throw new Error('Failed to sync chat data.', { cause: error });
  }
}

export async function permanentlyDeleteAccount(userId: number): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from('users').delete().eq('id', userId);
    if (!error && !hasPgPoolCredentials()) return;
  }

  if (!hasPgPoolCredentials()) return;

  try {
    await db.delete(users).where(eq(users.id, userId));
  } catch (error) {
    console.error('permanentlyDeleteAccount failed:', error);
    throw new Error('Failed to delete account.', { cause: error });
  }
}
