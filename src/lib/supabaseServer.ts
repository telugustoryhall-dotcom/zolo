import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DbSession, DbUser } from '../db/schema.ts';

let cachedSupabase: SupabaseClient | null = null;

export function getSupabaseConfig(): { url: string; apiKey: string } | null {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || process.env.VITE_SUPABASE_ANON_KEY?.trim();
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
    (message.includes('relation') && message.includes('does not exist'))
  );
}

export function isSupabaseColumnMissingError(err: unknown, columnName?: string): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = String((err as { code?: string }).code || '');
  const message = String((err as { message?: string }).message || '').toLowerCase();
  const isMissing = code === 'PGRST204' || message.includes('could not find') || message.includes('column');
  if (columnName) {
    return isMissing && message.includes(columnName.toLowerCase());
  }
  return isMissing;
}

export function isSupabaseUniqueViolation(
  err: unknown
): 'phone' | 'username' | 'other' | null {
  if (!err || typeof err !== 'object') return null;
  const code = String((err as { code?: string }).code || '');
  const message = String(
    `${(err as { message?: string }).message || ''} ${(err as { details?: string }).details || ''}`
  ).toLowerCase();

  if (code === '23505' || message.includes('duplicate key value') || message.includes('already exists')) {
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

/**
 * Extracts the password hash safely, accommodating both dedicated `password_hash` column
 * and legacy compound `recovery_key_hash: rec:<hash>|pwd:<passwordHash>` format in Supabase.
 */
export function extractPasswordHash(row: {
  password_hash?: string | null;
  recovery_key_hash?: string | null;
}): string | null {
  if (row.password_hash && row.password_hash.trim().length > 0) {
    return row.password_hash.trim();
  }
  if (row.recovery_key_hash && row.recovery_key_hash.includes('|pwd:')) {
    const parts = row.recovery_key_hash.split('|pwd:');
    return parts[1]?.trim() || null;
  }
  return null;
}

/**
 * Extracts the recovery key hash safely, handling compound format.
 */
export function extractRecoveryHash(recoveryKeyHash?: string | null): string | null {
  if (!recoveryKeyHash) return null;
  if (recoveryKeyHash.includes('|pwd:')) {
    const raw = recoveryKeyHash.split('|pwd:')[0];
    return raw.replace(/^rec:/, '').trim() || null;
  }
  if (recoveryKeyHash.startsWith('rec:')) {
    return recoveryKeyHash.replace(/^rec:/, '').trim();
  }
  return recoveryKeyHash.trim();
}

/**
 * Packs recovery key hash and password hash for tables lacking `password_hash` column.
 */
export function packCompoundRecoveryHash(recoveryKeyHash: string, passwordHash?: string | null): string {
  if (!passwordHash) {
    return `rec:${recoveryKeyHash}`;
  }
  return `rec:${recoveryKeyHash}|pwd:${passwordHash}`;
}

export function mapSupabaseUserToDbUser(row: SupabaseUserRow): DbUser {
  const resolvedPassword = extractPasswordHash(row);
  const resolvedRecovery = extractRecoveryHash(row.recovery_key_hash);

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
    passwordHash: resolvedPassword,
    recoveryKeyHash: resolvedRecovery,
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
