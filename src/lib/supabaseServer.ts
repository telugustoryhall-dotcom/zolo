import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DbSession, DbUser } from '../db/schema.ts';

let cachedSupabase: SupabaseClient | null = null;

export function getSupabaseConfig(): { url: string; apiKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  const apiKey = serviceKey || anonKey;

  if (
    !url ||
    !apiKey ||
    url === 'https://your-project-ref.supabase.co' ||
    apiKey === 'YOUR_SUPABASE_ANON_KEY'
  ) {
    return null;
  }

  return { url, apiKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

export function getSupabaseServerClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;

  if (!cachedSupabase) {
    cachedSupabase = createClient(cfg.url, cfg.apiKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return cachedSupabase;
}

export function isPostgreSqlConfigured(): boolean {
  const host = process.env.SQL_HOST?.trim();
  return Boolean(host && host !== '127.0.0.1' && host !== 'YOUR_SQL_HOST');
}

export function isSupabaseTableMissingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: string }).code || '');
  const message = String((err as { message?: string }).message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === 'PGRST204' ||
    code === '42P01' ||
    message.includes('could not find the table') ||
    message.includes('relation') && message.includes('does not exist')
  );
}

export function isSupabaseUniqueViolation(
  err: unknown
): 'phone' | 'username' | 'other' | null {
  if (!err || typeof err !== 'object') return null;
  const code = String((err as { code?: string }).code || '');
  const message = String(
    `${(err as { message?: string }).message || ''} ${(err as { details?: string }).details || ''}`
  ).toLowerCase();

  if (code === '23505' || message.includes('duplicate key value')) {
    if (message.includes('phone')) return 'phone';
    if (message.includes('username')) return 'username';
    return 'other';
  }
  return null;
}

export interface SupabaseUserRow {
  id: number;
  uid: string;
  firebase_uid: string | null;
  email: string | null;
  phone_normalized: string;
  country_code: string;
  phone_verified: boolean;
  phone_verified_at: string;
  full_name: string;
  username: string | null;
  about: string;
  avatar_url: string | null;
  password_hash?: string | null;
  recovery_key_hash: string | null;
  chat_state_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupabaseSessionRow {
  id: number;
  session_id: string;
  user_id: number;
  token_hash: string;
  user_agent: string | null;
  ip_address: string | null;
  expires_at: string;
  revoked_at: string | null;
  last_active_at: string;
  created_at: string;
}

export function serializeRecoveryAndPass(
  recoveryKeyHash: string | null,
  passwordHash: string | null
): string | null {
  if (!passwordHash && !recoveryKeyHash) return null;
  return JSON.stringify({
    recoveryKeyHash: recoveryKeyHash ?? null,
    passwordHash: passwordHash ?? null,
  });
}

export function mapSupabaseUserToDbUser(row: SupabaseUserRow): DbUser {
  let passwordHash = row.password_hash ?? null;
  let recoveryKeyHash = row.recovery_key_hash ?? null;

  if (row.recovery_key_hash && row.recovery_key_hash.startsWith('{')) {
    try {
      const parsed = JSON.parse(row.recovery_key_hash);
      if (parsed && typeof parsed === 'object') {
        if (parsed.passwordHash) passwordHash = parsed.passwordHash;
        if (parsed.recoveryKeyHash !== undefined) recoveryKeyHash = parsed.recoveryKeyHash;
      }
    } catch {
      // Ignore parse error
    }
  }

  return {
    id: row.id,
    uid: row.uid,
    firebaseUid: row.firebase_uid ?? null,
    email: row.email ?? null,
    phoneNormalized: row.phone_normalized,
    countryCode: row.country_code || '+91',
    phoneVerified: row.phone_verified ?? true,
    phoneVerifiedAt: row.phone_verified_at ? new Date(row.phone_verified_at) : new Date(),
    fullName: row.full_name,
    username: row.username ?? row.phone_normalized,
    about: row.about || 'Hey there! I am using ZOLO.',
    avatarUrl: row.avatar_url ?? null,
    passwordHash,
    recoveryKeyHash,
    chatStateJson: row.chat_state_json ?? null,
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
}

export function mapSupabaseSessionToDbSession(row: SupabaseSessionRow): DbSession {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    userAgent: row.user_agent ?? null,
    ipAddress: row.ip_address ?? null,
    expiresAt: new Date(row.expires_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
    lastActiveAt: row.last_active_at ? new Date(row.last_active_at) : new Date(),
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
  };
}
