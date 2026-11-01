import crypto from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from './index.ts';
import { authSessions, users, type DbSession, type DbUser } from './schema.ts';
import { getLocalDb } from './localDatabase.ts';
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
  extractPasswordHash,
  extractRecoveryHash,
  getSupabaseServerClient,
  isPostgreSqlConfigured,
  isSupabaseColumnMissingError,
  isSupabaseConfigured,
  isSupabaseTableMissingError,
  isSupabaseUniqueViolation,
  mapSupabaseSessionToDbSession,
  mapSupabaseUserToDbUser,
  packCompoundRecoveryHash,
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

  const str = String(error || '').toLowerCase();
  if (str.includes('unique constraint') || str.includes('duplicate')) {
    if (str.includes('phone')) return 'phone';
    if (str.includes('username')) return 'username';
    return 'other';
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
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : String(user.createdAt),
  };
}

export async function checkDatabaseHealth(): Promise<{
  provider: 'supabase' | 'postgresql' | 'supabase+postgresql' | 'local-fallback';
}> {
  const supabase = getSupabaseServerClient();
  let supabaseReady = false;
  let pgReady = false;

  if (supabase) {
    const { error } = await supabase.from('users').select('id').limit(1);
    if (!error) {
      supabaseReady = true;
    } else if (!isSupabaseTableMissingError(error) && !hasPgPoolCredentials()) {
      console.warn('Supabase health check warning:', error.message);
    }
  }

  if (hasPgPoolCredentials()) {
    try {
      await db.select({ id: users.id }).from(users).limit(1);
      pgReady = true;
    } catch (error) {
      if (!supabaseReady) {
        console.error('Database health check failed:', error);
      }
    }
  }

  if (supabaseReady && pgReady) return { provider: 'supabase+postgresql' };
  if (supabaseReady) return { provider: 'supabase' };
  if (pgReady) return { provider: 'postgresql' };
  return { provider: 'local-fallback' };
}

// ============================================================================
// LOCAL DB HELPER FUNCTIONS FOR USER & SESSION FALLBACK
// ============================================================================

function mapLocalUserRowToDbUser(row: Record<string, unknown>): DbUser {
  return {
    id: Number(row.id),
    uid: String(row.uid),
    firebaseUid: row.firebase_uid ? String(row.firebase_uid) : null,
    email: row.email ? String(row.email) : null,
    phoneNormalized: String(row.phone_normalized),
    countryCode: String(row.country_code || '+91'),
    phoneVerified: Boolean(row.phone_verified),
    phoneVerifiedAt: row.phone_verified_at ? new Date(String(row.phone_verified_at)) : new Date(),
    fullName: String(row.full_name),
    username: String(row.username || row.phone_normalized),
    about: String(row.about || 'Hey there! I am using ZOLO.'),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    passwordHash: extractPasswordHash({
      password_hash: row.password_hash as string | null,
      recovery_key_hash: row.recovery_key_hash as string | null,
    }),
    recoveryKeyHash: extractRecoveryHash(row.recovery_key_hash as string | null),
    chatStateJson: row.chat_state_json ? String(row.chat_state_json) : null,
    createdAt: row.created_at ? new Date(String(row.created_at)) : new Date(),
    updatedAt: row.updated_at ? new Date(String(row.updated_at)) : new Date(),
  };
}

function mapLocalSessionRowToDbSession(row: Record<string, unknown>): DbSession {
  return {
    id: Number(row.id),
    sessionId: String(row.session_id),
    userId: Number(row.user_id),
    tokenHash: String(row.token_hash),
    userAgent: row.user_agent ? String(row.user_agent) : null,
    ipAddress: row.ip_address ? String(row.ip_address) : null,
    expiresAt: new Date(String(row.expires_at)),
    revokedAt: row.revoked_at ? new Date(String(row.revoked_at)) : null,
    lastActiveAt: new Date(String(row.last_active_at)),
    createdAt: new Date(String(row.created_at)),
  };
}

function findLocalUserByPhone(phone: string): DbUser | null {
  try {
    const ldb = getLocalDb();
    const row = ldb.prepare('SELECT * FROM local_users WHERE phone_normalized = ? LIMIT 1').get(phone) as Record<string, unknown> | undefined;
    return row ? mapLocalUserRowToDbUser(row) : null;
  } catch {
    return null;
  }
}

function findLocalUserById(id: number): DbUser | null {
  try {
    const ldb = getLocalDb();
    const row = ldb.prepare('SELECT * FROM local_users WHERE id = ? LIMIT 1').get(id) as Record<string, unknown> | undefined;
    return row ? mapLocalUserRowToDbUser(row) : null;
  } catch {
    return null;
  }
}

function saveLocalUser(params: {
  uid: string;
  phoneNormalized: string;
  countryCode: string;
  fullName: string;
  username: string | null;
  avatarUrl: string | null;
  passwordHash: string;
  recoveryKeyHash: string;
}): DbUser {
  const ldb = getLocalDb();
  const now = new Date().toISOString();
  ldb.prepare(`
    INSERT INTO local_users (
      uid, phone_normalized, country_code, phone_verified, phone_verified_at,
      full_name, username, about, avatar_url, password_hash, recovery_key_hash,
      created_at, updated_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?, 'Hey there! I am using ZOLO.', ?, ?, ?, ?, ?)
    ON CONFLICT(phone_normalized) DO UPDATE SET
      full_name = excluded.full_name,
      password_hash = excluded.password_hash,
      recovery_key_hash = excluded.recovery_key_hash,
      avatar_url = excluded.avatar_url,
      updated_at = excluded.updated_at
  `).run(
    params.uid,
    params.phoneNormalized,
    params.countryCode,
    now,
    params.fullName,
    params.username || params.phoneNormalized,
    params.avatarUrl,
    params.passwordHash,
    params.recoveryKeyHash,
    now,
    now
  );
  return findLocalUserByPhone(params.phoneNormalized)!;
}

function createLocalSession(params: {
  userId: number;
  userAgent?: string;
  ipAddress?: string;
  rawTokenOverride?: string;
  sessionIdOverride?: string;
}): { rawSessionToken: string; session: DbSession } {
  const ldb = getLocalDb();
  const rawSessionToken = params.rawTokenOverride ?? generateOpaqueToken(32);
  const tokenHash = hashOpaqueToken(rawSessionToken);
  const sessionId = params.sessionIdOverride ?? `ses_${crypto.randomBytes(16).toString('hex')}`;
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  ldb.prepare(`
    INSERT INTO local_auth_sessions (
      session_id, user_id, token_hash, user_agent, ip_address, expires_at, last_active_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    params.userId,
    tokenHash,
    params.userAgent?.slice(0, 255) ?? null,
    params.ipAddress ?? null,
    expiresAt,
    now,
    now
  );

  const row = ldb.prepare('SELECT * FROM local_auth_sessions WHERE session_id = ?').get(sessionId) as Record<string, unknown>;
  return {
    rawSessionToken,
    session: mapLocalSessionRowToDbSession(row),
  };
}

// ============================================================================
// CORE USER & AUTH REPOSITORY
// ============================================================================

export async function findUserByPhone(phoneNormalized: string): Promise<DbUser | null> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('phone_normalized', phoneNormalized)
      .maybeSingle();

    if (!error && data) {
      const u = mapSupabaseUserToDbUser(data as SupabaseUserRow);
      // Cache locally
      saveLocalUser({
        uid: u.uid,
        phoneNormalized: u.phoneNormalized,
        countryCode: u.countryCode,
        fullName: u.fullName,
        username: u.username,
        avatarUrl: u.avatarUrl,
        passwordHash: u.passwordHash || '',
        recoveryKeyHash: u.recoveryKeyHash || '',
      });
      return u;
    }
  }

  // Fallback to local DB
  const local = findLocalUserByPhone(phoneNormalized);
  if (local) return local;

  if (hasPgPoolCredentials()) {
    try {
      const rows = await db
        .select()
        .from(users)
        .where(eq(users.phoneNormalized, phoneNormalized))
        .limit(1);
      return rows[0] ?? null;
    } catch {
      // Non-fatal
    }
  }

  return null;
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
  }

  const local = findLocalUserById(userId);
  if (local) return local;

  if (hasPgPoolCredentials()) {
    try {
      const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      return rows[0] ?? null;
    } catch {
      // Non-fatal
    }
  }

  return null;
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
    return null;
  }

  return {
    rawSessionToken,
    session: mapSupabaseSessionToDbSession(data as SupabaseSessionRow),
  };
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
  const rawRecoveryKeyHash = hashOpaqueToken(normalizeRecoveryKey(recoveryKey));
  const compoundRecoveryHash = packCompoundRecoveryHash(rawRecoveryKeyHash, passwordHash);
  const uid = `usr_${crypto.randomUUID().replace(/-/g, '')}`;
  const mobileUsername = params.phoneNormalized;

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const existingCheck = await supabase
      .from('users')
      .select('id')
      .eq('phone_normalized', params.phoneNormalized)
      .maybeSingle();

    if (!existingCheck.error && existingCheck.data) {
      throw new AppDomainError(
        'An account with this mobile number already exists. Please log in instead.',
        409,
        'PHONE_ALREADY_REGISTERED'
      );
    }

    // First attempt: insert with dedicated password_hash column
    let insertResult = await supabase
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
        password_hash: passwordHash,
        recovery_key_hash: rawRecoveryKeyHash,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .maybeSingle();

    // If password_hash column is not present in Supabase table (PGRST204),
    // gracefully insert with compound recovery_key_hash!
    if (insertResult.error && isSupabaseColumnMissingError(insertResult.error, 'password_hash')) {
      insertResult = await supabase
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
          recovery_key_hash: compoundRecoveryHash,
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .maybeSingle();
    }

    if (!insertResult.error && insertResult.data) {
      const sbUser = mapSupabaseUserToDbUser(insertResult.data as SupabaseUserRow);
      // Ensure passwordHash is attached on the mapped user
      if (!sbUser.passwordHash) sbUser.passwordHash = passwordHash;

      // Create session in Supabase
      const sbSession = await createSupabaseSession({
        userId: sbUser.id,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      });

      // Also mirror to local fallback DB for resilient local presence & backup
      const localUser = saveLocalUser({
        uid: sbUser.uid,
        phoneNormalized: sbUser.phoneNormalized,
        countryCode: sbUser.countryCode,
        fullName: sbUser.fullName,
        username: mobileUsername,
        avatarUrl: sbUser.avatarUrl,
        passwordHash,
        recoveryKeyHash: rawRecoveryKeyHash,
      });

      if (sbSession) {
        createLocalSession({
          userId: localUser.id,
          userAgent: params.userAgent,
          ipAddress: params.ipAddress,
          rawTokenOverride: sbSession.rawSessionToken,
          sessionIdOverride: sbSession.session.sessionId,
        });

        return {
          user: sbUser,
          rawSessionToken: sbSession.rawSessionToken,
          session: sbSession.session,
          recoveryKey,
        };
      }

      // If Supabase session creation failed, create local session
      const fallbackSession = createLocalSession({
        userId: localUser.id,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      });

      return {
        user: sbUser,
        rawSessionToken: fallbackSession.rawSessionToken,
        session: fallbackSession.session,
        recoveryKey,
      };
    }

    if (insertResult.error) {
      const violation = inspectUniqueViolation(insertResult.error);
      if (violation === 'phone' || violation === 'username') {
        throw new AppDomainError(
          'An account with this mobile number already exists. Please log in instead.',
          409,
          'PHONE_ALREADY_REGISTERED'
        );
      }
    }
  }

  // Local fallback registration
  const existingLocal = findLocalUserByPhone(params.phoneNormalized);
  if (existingLocal) {
    throw new AppDomainError(
      'An account with this mobile number already exists. Please log in instead.',
      409,
      'PHONE_ALREADY_REGISTERED'
    );
  }

  const localUser = saveLocalUser({
    uid,
    phoneNormalized: params.phoneNormalized,
    countryCode: params.countryCode,
    fullName: params.fullName.trim(),
    username: mobileUsername,
    avatarUrl: params.avatarUrl,
    passwordHash,
    recoveryKeyHash: rawRecoveryKeyHash,
  });

  const sessionData = createLocalSession({
    userId: localUser.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
  });

  return {
    user: localUser,
    rawSessionToken: sessionData.rawSessionToken,
    session: sessionData.session,
    recoveryKey,
  };
}

/**
 * Logs in an existing lifetime account by normalized mobile number AND password.
 * Accurately verifies password against dedicated column or compound recovery key.
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

    if (!error && data) {
      let sbUser = mapSupabaseUserToDbUser(data as SupabaseUserRow);
      const existingHash = extractPasswordHash(data as SupabaseUserRow);

      if (existingHash) {
        if (!verifyPassword(params.password, existingHash)) {
          throw new AppDomainError(
            'Incorrect password for this mobile number. Please try again or reset via Recover.',
            401,
            'INVALID_PASSWORD'
          );
        }
        sbUser.passwordHash = existingHash;
      } else {
        // Upgrade legacy account on first password login
        const upgradedHash = hashPassword(params.password);
        // Try updating password_hash column first
        const updCol = await supabase
          .from('users')
          .update({ password_hash: upgradedHash, updated_at: new Date().toISOString() })
          .eq('id', sbUser.id)
          .select('*')
          .maybeSingle();

        if (updCol.error && isSupabaseColumnMissingError(updCol.error, 'password_hash')) {
          // Fall back to compound recovery_key_hash
          const currentRec = extractRecoveryHash(data.recovery_key_hash);
          const compound = packCompoundRecoveryHash(currentRec || '', upgradedHash);
          await supabase
            .from('users')
            .update({ recovery_key_hash: compound, updated_at: new Date().toISOString() })
            .eq('id', sbUser.id);
        }

        sbUser.passwordHash = upgradedHash;
      }

      // Create session
      const sbSession = await createSupabaseSession({
        userId: sbUser.id,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      });

      // Sync user to local DB
      const localUser = saveLocalUser({
        uid: sbUser.uid,
        phoneNormalized: sbUser.phoneNormalized,
        countryCode: sbUser.countryCode,
        fullName: sbUser.fullName,
        username: sbUser.username,
        avatarUrl: sbUser.avatarUrl,
        passwordHash: sbUser.passwordHash || '',
        recoveryKeyHash: sbUser.recoveryKeyHash || '',
      });

      if (sbSession) {
        createLocalSession({
          userId: localUser.id,
          userAgent: params.userAgent,
          ipAddress: params.ipAddress,
          rawTokenOverride: sbSession.rawSessionToken,
          sessionIdOverride: sbSession.session.sessionId,
        });

        return {
          user: sbUser,
          rawSessionToken: sbSession.rawSessionToken,
          session: sbSession.session,
        };
      }

      const localSession = createLocalSession({
        userId: localUser.id,
        userAgent: params.userAgent,
        ipAddress: params.ipAddress,
      });

      return {
        user: sbUser,
        rawSessionToken: localSession.rawSessionToken,
        session: localSession.session,
      };
    }
  }

  // Local DB lookup
  const localUser = findLocalUserByPhone(params.phoneNormalized);
  if (!localUser) {
    throw new AppDomainError(
      'No ZOLO account found for this mobile number. Create an account to get started.',
      404,
      'ACCOUNT_NOT_FOUND'
    );
  }

  if (localUser.passwordHash) {
    if (!verifyPassword(params.password, localUser.passwordHash)) {
      throw new AppDomainError(
        'Incorrect password for this mobile number. Please try again or reset via Recover.',
        401,
        'INVALID_PASSWORD'
      );
    }
  } else {
    // Set password on first login
    const upgradedHash = hashPassword(params.password);
    getLocalDb()
      .prepare('UPDATE local_users SET password_hash = ? WHERE id = ?')
      .run(upgradedHash, localUser.id);
    localUser.passwordHash = upgradedHash;
  }

  const sessionData = createLocalSession({
    userId: localUser.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
  });

  return {
    user: localUser,
    rawSessionToken: sessionData.rawSessionToken,
    session: sessionData.session,
  };
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
    }
  }

  // Local DB lookup
  try {
    const ldb = getLocalDb();
    const now = new Date().toISOString();
    const sessRow = ldb
      .prepare(
        'SELECT * FROM local_auth_sessions WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ? LIMIT 1'
      )
      .get(tokenHash, now) as Record<string, unknown> | undefined;

    if (sessRow) {
      const session = mapLocalSessionRowToDbSession(sessRow);
      const user = findLocalUserById(session.userId);
      if (user) {
        return { user, session };
      }
    }
  } catch {
    // Non-fatal
  }

  return null;
}

export async function revokeSingleSession(sessionId: string, userId: number): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      await supabase
        .from('auth_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('session_id', sessionId)
        .eq('user_id', userId);
    } catch {}
  }

  try {
    getLocalDb()
      .prepare('UPDATE local_auth_sessions SET revoked_at = ? WHERE session_id = ? AND user_id = ?')
      .run(new Date().toISOString(), sessionId, userId);
  } catch {
    // Non-fatal
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
    }
  }

  let localRevoked = 0;
  try {
    const res = getLocalDb()
      .prepare(
        'UPDATE local_auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL'
      )
      .run(new Date().toISOString(), userId);
    localRevoked = Number(res.changes || 0);
  } catch {
    // Non-fatal
  }

  return Math.max(sbRevoked, localRevoked);
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

    if (!error && data && data.length > 0) {
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

  // Local fallback
  try {
    const now = new Date().toISOString();
    const rows = getLocalDb()
      .prepare(
        'SELECT * FROM local_auth_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_active_at DESC'
      )
      .all(userId, now) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      sessionId: String(r.session_id),
      userAgent: r.user_agent ? String(r.user_agent) : null,
      ipAddress: r.ip_address ? String(r.ip_address) : null,
      createdAt: String(r.created_at),
      lastActiveAt: String(r.last_active_at),
      expiresAt: String(r.expires_at),
      isCurrent: String(r.session_id) === currentSessionId,
    }));
  } catch {
    return [];
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
  let sbUser: DbUser | null = null;
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
      sbUser = mapSupabaseUserToDbUser(data as SupabaseUserRow);
    }
  }

  // Update local DB
  try {
    const ldb = getLocalDb();
    const now = new Date().toISOString();
    const current = ldb.prepare('SELECT * FROM local_users WHERE id = ?').get(userId) as Record<string, unknown> | undefined;
    if (current) {
      const nextName = String(updates.fullName !== undefined ? updates.fullName.trim() : (current.full_name || ''));
      const nextAbout = String(updates.about !== undefined ? updates.about.trim() : (current.about || ''));
      const nextAvatar = updates.avatarUrl !== undefined ? updates.avatarUrl : (current.avatar_url ? String(current.avatar_url) : null);
      ldb.prepare('UPDATE local_users SET full_name = ?, about = ?, avatar_url = ?, updated_at = ? WHERE id = ?')
        .run(nextName, nextAbout, nextAvatar, now, userId);
      const updatedLocal = ldb.prepare('SELECT * FROM local_users WHERE id = ?').get(userId) as Record<string, unknown>;
      return mapLocalUserRowToDbUser(updatedLocal);
    }
  } catch {
    // Non-fatal
  }

  if (sbUser) return sbUser;
  throw new AppDomainError('Account not found.', 404, 'ACCOUNT_NOT_FOUND');
}

export async function changePhoneNumberDirect(params: {
  userId: number;
  currentSessionId: string;
  newPhoneNormalized: string;
  newCountryCode: string;
}): Promise<DbUser> {
  const supabase = getSupabaseServerClient();
  let sbUpdated: DbUser | null = null;
  if (supabase) {
    const { data: conflictRow } = await supabase
      .from('users')
      .select('id')
      .eq('phone_normalized', params.newPhoneNormalized)
      .maybeSingle();

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
      sbUpdated = mapSupabaseUserToDbUser(updatedRow as SupabaseUserRow);
      await supabase
        .from('auth_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', params.userId)
        .is('revoked_at', null)
        .neq('session_id', params.currentSessionId);
    }
  }

  // Update local DB
  try {
    const ldb = getLocalDb();
    const conflict = ldb.prepare('SELECT id FROM local_users WHERE phone_normalized = ? AND id != ? LIMIT 1').get(params.newPhoneNormalized, params.userId);
    if (conflict) {
      throw new AppDomainError(
        'This mobile number already belongs to another ZOLO account.',
        409,
        'PHONE_ALREADY_REGISTERED'
      );
    }

    const now = new Date().toISOString();
    ldb.prepare('UPDATE local_users SET phone_normalized = ?, username = ?, country_code = ?, updated_at = ? WHERE id = ?')
      .run(params.newPhoneNormalized, params.newPhoneNormalized, params.newCountryCode, now, params.userId);

    // Revoke other sessions
    ldb.prepare('UPDATE local_auth_sessions SET revoked_at = ? WHERE user_id = ? AND session_id != ? AND revoked_at IS NULL')
      .run(now, params.userId, params.currentSessionId);

    const updatedLocal = ldb.prepare('SELECT * FROM local_users WHERE id = ?').get(params.userId) as Record<string, unknown> | undefined;
    if (updatedLocal) {
      return mapLocalUserRowToDbUser(updatedLocal);
    }
  } catch (error) {
    if (error instanceof AppDomainError) throw error;
  }

  if (sbUpdated) return sbUpdated;
  throw new AppDomainError('Account not found.', 404, 'ACCOUNT_NOT_FOUND');
}

export async function linkFirebaseGoogleForRecovery(params: {
  userId: number;
  firebaseUid: string;
  email: string | null;
}): Promise<DbUser> {
  const supabase = getSupabaseServerClient();
  let sbUser: DbUser | null = null;
  if (supabase) {
    const { data: existingLink } = await supabase
      .from('users')
      .select('id')
      .eq('firebase_uid', params.firebaseUid)
      .maybeSingle();

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

    if (!updErr && updated) {
      sbUser = mapSupabaseUserToDbUser(updated as SupabaseUserRow);
    }
  }

  // Update local DB
  try {
    const ldb = getLocalDb();
    const conflict = ldb.prepare('SELECT id FROM local_users WHERE firebase_uid = ? AND id != ? LIMIT 1').get(params.firebaseUid, params.userId);
    if (conflict) {
      throw new AppDomainError(
        'This Google account is already linked to another ZOLO account.',
        409,
        'GOOGLE_ALREADY_LINKED'
      );
    }

    const now = new Date().toISOString();
    ldb.prepare('UPDATE local_users SET firebase_uid = ?, email = ?, updated_at = ? WHERE id = ?')
      .run(params.firebaseUid, params.email, now, params.userId);

    const updatedLocal = ldb.prepare('SELECT * FROM local_users WHERE id = ?').get(params.userId) as Record<string, unknown> | undefined;
    if (updatedLocal) {
      return mapLocalUserRowToDbUser(updatedLocal);
    }
  } catch (error) {
    if (error instanceof AppDomainError) throw error;
  }

  if (sbUser) return sbUser;
  throw new AppDomainError('Account not found.', 404, 'ACCOUNT_NOT_FOUND');
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
  const rawRecoveryKeyHash = hashOpaqueToken(normalizeRecoveryKey(nextRecoveryKey));
  const nextPasswordHash = params.newPassword ? hashPassword(params.newPassword) : undefined;
  const compoundRecoveryHash = nextPasswordHash
    ? packCompoundRecoveryHash(rawRecoveryKeyHash, nextPasswordHash)
    : `rec:${rawRecoveryKeyHash}`;

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: targetRow } = await supabase
      .from('users')
      .select('*')
      .eq('phone_normalized', params.oldPhoneNormalized)
      .maybeSingle();

    if (targetRow) {
      const account = mapSupabaseUserToDbUser(targetRow as SupabaseUserRow);
      let ownershipVerified = false;

      if (params.recoveryKey && targetRow.recovery_key_hash) {
        const storedRec = extractRecoveryHash(targetRow.recovery_key_hash);
        if (storedRec) {
          ownershipVerified = verifyOpaqueTokenConstantTime(
            normalizeRecoveryKey(params.recoveryKey),
            storedRec
          );
        }
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

      // Try update with password_hash column first
      const sbUpdatePayload: Record<string, unknown> = {
        phone_normalized: params.newPhoneNormalized,
        username: params.newPhoneNormalized,
        country_code: params.newCountryCode,
        phone_verified: true,
        phone_verified_at: new Date().toISOString(),
        recovery_key_hash: rawRecoveryKeyHash,
        updated_at: new Date().toISOString(),
      };
      if (nextPasswordHash) {
        sbUpdatePayload.password_hash = nextPasswordHash;
      }

      let updRes = await supabase
        .from('users')
        .update(sbUpdatePayload)
        .eq('id', account.id)
        .select('*')
        .maybeSingle();

      if (updRes.error && isSupabaseColumnMissingError(updRes.error, 'password_hash')) {
        // Fall back to compound recovery_key_hash
        sbUpdatePayload.recovery_key_hash = compoundRecoveryHash;
        delete sbUpdatePayload.password_hash;
        updRes = await supabase
          .from('users')
          .update(sbUpdatePayload)
          .eq('id', account.id)
          .select('*')
          .maybeSingle();
      }

      if (!updRes.error && updRes.data) {
        const updatedUser = mapSupabaseUserToDbUser(updRes.data as SupabaseUserRow);
        if (nextPasswordHash) updatedUser.passwordHash = nextPasswordHash;

        const sbSession = await createSupabaseSession({
          userId: updatedUser.id,
          userAgent: params.userAgent,
          ipAddress: params.ipAddress,
        });

        // Mirror to local DB
        const localUser = saveLocalUser({
          uid: updatedUser.uid,
          phoneNormalized: updatedUser.phoneNormalized,
          countryCode: updatedUser.countryCode,
          fullName: updatedUser.fullName,
          username: updatedUser.username,
          avatarUrl: updatedUser.avatarUrl,
          passwordHash: updatedUser.passwordHash || '',
          recoveryKeyHash: rawRecoveryKeyHash,
        });

        if (sbSession) {
          createLocalSession({
            userId: localUser.id,
            userAgent: params.userAgent,
            ipAddress: params.ipAddress,
            rawTokenOverride: sbSession.rawSessionToken,
            sessionIdOverride: sbSession.session.sessionId,
          });

          return {
            user: updatedUser,
            rawSessionToken: sbSession.rawSessionToken,
            session: sbSession.session,
            newRecoveryKey: nextRecoveryKey,
          };
        }
      }
    }
  }

  // Fallback to local DB recovery
  const localAccount = findLocalUserByPhone(params.oldPhoneNormalized);
  if (!localAccount) {
    throw new AppDomainError(
      'Could not verify recovery credentials for that account.',
      401,
      'RECOVERY_AUTH_FAILED'
    );
  }

  let ownershipVerified = false;
  if (params.recoveryKey && localAccount.recoveryKeyHash) {
    ownershipVerified = verifyOpaqueTokenConstantTime(
      normalizeRecoveryKey(params.recoveryKey),
      localAccount.recoveryKeyHash
    );
  } else if (
    params.verifiedFirebaseUid &&
    localAccount.firebaseUid &&
    params.verifiedFirebaseUid === localAccount.firebaseUid
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
    const conflict = findLocalUserByPhone(params.newPhoneNormalized);
    if (conflict) {
      throw new AppDomainError(
        'The new mobile number is already registered to another account.',
        409,
        'PHONE_ALREADY_REGISTERED'
      );
    }
  }

  const ldb = getLocalDb();
  const now = new Date().toISOString();
  ldb.prepare('UPDATE local_auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .run(now, localAccount.id);

  ldb.prepare(`
    UPDATE local_users
    SET phone_normalized = ?, username = ?, country_code = ?, password_hash = ?, recovery_key_hash = ?, updated_at = ?
    WHERE id = ?
  `).run(
    params.newPhoneNormalized,
    params.newPhoneNormalized,
    params.newCountryCode,
    nextPasswordHash || localAccount.passwordHash,
    rawRecoveryKeyHash,
    now,
    localAccount.id
  );

  const updatedLocal = findLocalUserById(localAccount.id)!;
  const sessionData = createLocalSession({
    userId: updatedLocal.id,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
  });

  return {
    user: updatedLocal,
    rawSessionToken: sessionData.rawSessionToken,
    session: sessionData.session,
    newRecoveryKey: nextRecoveryKey,
  };
}

export async function changeAccountPassword(params: {
  userId: number;
  currentPassword?: string;
  newPassword: string;
}): Promise<DbUser> {
  const newPasswordHash = hashPassword(params.newPassword);

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: row } = await supabase
      .from('users')
      .select('*')
      .eq('id', params.userId)
      .maybeSingle();

    if (row) {
      const existingHash = extractPasswordHash(row as SupabaseUserRow);
      if (existingHash && params.currentPassword) {
        if (!verifyPassword(params.currentPassword, existingHash)) {
          throw new AppDomainError('Current password is incorrect.', 401, 'INVALID_PASSWORD');
        }
      }

      // Try updating password_hash column first
      let upd = await supabase
        .from('users')
        .update({ password_hash: newPasswordHash, updated_at: new Date().toISOString() })
        .eq('id', params.userId)
        .select('*')
        .maybeSingle();

      if (upd.error && isSupabaseColumnMissingError(upd.error, 'password_hash')) {
        // Fall back to compound recovery_key_hash
        const recHash = extractRecoveryHash(row.recovery_key_hash);
        const compound = packCompoundRecoveryHash(recHash || '', newPasswordHash);
        upd = await supabase
          .from('users')
          .update({ recovery_key_hash: compound, updated_at: new Date().toISOString() })
          .eq('id', params.userId)
          .select('*')
          .maybeSingle();
      }

      if (!upd.error && upd.data) {
        const u = mapSupabaseUserToDbUser(upd.data as SupabaseUserRow);
        u.passwordHash = newPasswordHash;
        return u;
      }
    }
  }

  // Local DB
  const local = findLocalUserById(params.userId);
  if (!local) {
    throw new AppDomainError('Account not found.', 404, 'ACCOUNT_NOT_FOUND');
  }

  if (local.passwordHash && params.currentPassword) {
    if (!verifyPassword(params.currentPassword, local.passwordHash)) {
      throw new AppDomainError('Current password is incorrect.', 401, 'INVALID_PASSWORD');
    }
  }

  getLocalDb()
    .prepare('UPDATE local_users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(newPasswordHash, new Date().toISOString(), params.userId);

  return findLocalUserById(params.userId)!;
}

export async function saveUserChatState(userId: number, chatStateJson: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      await supabase
        .from('users')
        .update({ chat_state_json: chatStateJson, updated_at: new Date().toISOString() })
        .eq('id', userId);
    } catch {}
  }

  try {
    getLocalDb()
      .prepare('UPDATE local_users SET chat_state_json = ?, updated_at = ? WHERE id = ?')
      .run(chatStateJson, new Date().toISOString(), userId);
  } catch {
    // Non-fatal
  }
}

export async function permanentlyDeleteAccount(userId: number): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      await supabase.from('users').delete().eq('id', userId);
    } catch {}
  }

  try {
    getLocalDb().prepare('DELETE FROM local_users WHERE id = ?').run(userId);
    getLocalDb().prepare('DELETE FROM local_auth_sessions WHERE user_id = ?').run(userId);
  } catch {
    // Non-fatal
  }
}
