import { getMessaging } from 'firebase-admin/messaging';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import { getLocalDb } from '../db/localDatabase.ts';
import { db } from '../db/index.ts';
import { authSessions, fcmDevices, notificationEvents, notificationPreferences } from '../db/schema.ts';
import {
  getSupabaseServerClient,
  isPostgreSqlConfigured,
} from '../lib/supabaseServer.ts';

export interface NotificationPreferences {
  privateMessages: boolean;
  groupMessages: boolean;
  calls: boolean;
  groupCalls: boolean;
  otherActivity: boolean;
}

export type NotificationCategory = keyof NotificationPreferences;

const defaultPreferences: NotificationPreferences = {
  privateMessages: true,
  groupMessages: true,
  calls: true,
  groupCalls: true,
  otherActivity: true,
};
let lastNotificationEventCleanupAt = 0;

export async function registerFcmDevice(phone: string, sessionId: string, token: string): Promise<void> {
  const now = new Date().toISOString();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from('fcm_devices').upsert({
      token,
      phone_normalized: phone,
      session_id: sessionId,
      created_at: now,
      updated_at: now,
    }, { onConflict: 'token' });
    if (error) throw new Error(`Could not register notification device: ${error.message}`);
    return;
  }
  if (isPostgreSqlConfigured()) {
    await db.insert(fcmDevices).values({
      token,
      phoneNormalized: phone,
      sessionId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    }).onConflictDoUpdate({
      target: fcmDevices.token,
      set: { phoneNormalized: phone, sessionId, updatedAt: new Date(now) },
    });
    return;
  }
  getLocalDb().prepare(`
    INSERT INTO local_fcm_devices (token, phone_normalized, session_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      phone_normalized = excluded.phone_normalized,
      session_id = excluded.session_id,
      updated_at = excluded.updated_at
  `).run(token, phone, sessionId, now, now);
}

export async function unregisterFcmDevice(phone: string, sessionId: string, token: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from('fcm_devices')
      .delete().eq('token', token).eq('phone_normalized', phone).eq('session_id', sessionId);
    if (error) throw new Error(`Could not remove notification device: ${error.message}`);
    return;
  }
  if (isPostgreSqlConfigured()) {
    await db.delete(fcmDevices).where(and(
      eq(fcmDevices.token, token),
      eq(fcmDevices.phoneNormalized, phone),
      eq(fcmDevices.sessionId, sessionId)
    ));
    return;
  }
  getLocalDb().prepare(
    'DELETE FROM local_fcm_devices WHERE token = ? AND phone_normalized = ? AND session_id = ?'
  ).run(token, phone, sessionId);
}

export async function unregisterSessionFcmDevices(sessionId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from('fcm_devices').delete().eq('session_id', sessionId);
    if (error) throw new Error(`Could not remove signed-out notification devices: ${error.message}`);
    return;
  }
  if (isPostgreSqlConfigured()) {
    await db.delete(fcmDevices).where(eq(fcmDevices.sessionId, sessionId));
    return;
  }
  getLocalDb().prepare('DELETE FROM local_fcm_devices WHERE session_id = ?').run(sessionId);
}

export async function unregisterUserFcmDevices(phone: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from('fcm_devices').delete().eq('phone_normalized', phone);
    if (error) throw new Error(`Could not remove account notification devices: ${error.message}`);
    return;
  }
  if (isPostgreSqlConfigured()) {
    await db.delete(fcmDevices).where(eq(fcmDevices.phoneNormalized, phone));
    return;
  }
  getLocalDb().prepare('DELETE FROM local_fcm_devices WHERE phone_normalized = ?').run(phone);
}

export async function getNotificationPreferences(phone: string): Promise<NotificationPreferences> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase.from('notification_preferences')
      .select('private_messages, group_messages, calls, group_calls, other_activity')
      .eq('phone_normalized', phone).maybeSingle();
    if (error) throw new Error(`Could not load notification preferences: ${error.message}`);
    if (!data) return { ...defaultPreferences };
    return {
      privateMessages: data.private_messages,
      groupMessages: data.group_messages,
      calls: data.calls,
      groupCalls: data.group_calls,
      otherActivity: data.other_activity,
    };
  }
  if (isPostgreSqlConfigured()) {
    const [row] = await db.select().from(notificationPreferences)
      .where(eq(notificationPreferences.phoneNormalized, phone)).limit(1);
    return row ? {
      privateMessages: row.privateMessages,
      groupMessages: row.groupMessages,
      calls: row.calls,
      groupCalls: row.groupCalls,
      otherActivity: row.otherActivity,
    } : { ...defaultPreferences };
  }
  const row = getLocalDb().prepare(
    'SELECT * FROM local_notification_preferences WHERE phone_normalized = ?'
  ).get(phone) as Record<string, unknown> | undefined;
  return row ? {
    privateMessages: Boolean(row.private_messages),
    groupMessages: Boolean(row.group_messages),
    calls: Boolean(row.calls),
    groupCalls: Boolean(row.group_calls),
    otherActivity: Boolean(row.other_activity),
  } : { ...defaultPreferences };
}

export async function saveNotificationPreferences(
  phone: string,
  updates: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const preferences = { ...await getNotificationPreferences(phone), ...updates };
  const now = new Date().toISOString();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from('notification_preferences').upsert({
      phone_normalized: phone,
      private_messages: preferences.privateMessages,
      group_messages: preferences.groupMessages,
      calls: preferences.calls,
      group_calls: preferences.groupCalls,
      other_activity: preferences.otherActivity,
      updated_at: now,
    }, { onConflict: 'phone_normalized' });
    if (error) throw new Error(`Could not save notification preferences: ${error.message}`);
    return preferences;
  }
  if (isPostgreSqlConfigured()) {
    await db.insert(notificationPreferences).values({
      phoneNormalized: phone,
      ...preferences,
      updatedAt: new Date(now),
    }).onConflictDoUpdate({
      target: notificationPreferences.phoneNormalized,
      set: { ...preferences, updatedAt: new Date(now) },
    });
    return preferences;
  }
  getLocalDb().prepare(`
    INSERT INTO local_notification_preferences
      (phone_normalized, private_messages, group_messages, calls, group_calls, other_activity, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(phone_normalized) DO UPDATE SET
      private_messages = excluded.private_messages,
      group_messages = excluded.group_messages,
      calls = excluded.calls,
      group_calls = excluded.group_calls,
      other_activity = excluded.other_activity,
      updated_at = excluded.updated_at
  `).run(
    phone,
    Number(preferences.privateMessages),
    Number(preferences.groupMessages),
    Number(preferences.calls),
    Number(preferences.groupCalls),
    Number(preferences.otherActivity),
    now
  );
  return preferences;
}

export async function moveNotificationPreferences(oldPhone: string, newPhone: string): Promise<void> {
  if (oldPhone === newPhone) return;
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from('notification_preferences')
      .update({ phone_normalized: newPhone, updated_at: new Date().toISOString() })
      .eq('phone_normalized', oldPhone);
    if (error) throw new Error(`Could not preserve notification preferences: ${error.message}`);
    return;
  }
  if (isPostgreSqlConfigured()) {
    await db.update(notificationPreferences)
      .set({ phoneNormalized: newPhone, updatedAt: new Date() })
      .where(eq(notificationPreferences.phoneNormalized, oldPhone));
    return;
  }
  getLocalDb().prepare(`
    UPDATE local_notification_preferences
    SET phone_normalized = ?, updated_at = ?
    WHERE phone_normalized = ?
  `).run(newPhone, new Date().toISOString(), oldPhone);
}

async function getTokensForUser(phone: string): Promise<string[]> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: user, error: userError } = await supabase.from('users')
      .select('id').eq('phone_normalized', phone).maybeSingle();
    if (userError) throw new Error(`Could not verify notification account: ${userError.message}`);
    if (!user) return [];
    const { data: sessions, error: sessionError } = await supabase.from('auth_sessions')
      .select('session_id')
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString());
    if (sessionError) throw new Error(`Could not verify notification sessions: ${sessionError.message}`);
    const sessionIds = (sessions || []).map((session) => String(session.session_id));
    if (sessionIds.length === 0) return [];
    const { data, error } = await supabase.from('fcm_devices').select('token')
      .eq('phone_normalized', phone).in('session_id', sessionIds);
    if (error) throw new Error(`Could not load notification devices: ${error.message}`);
    return (data || []).map((device) => String(device.token));
  }
  if (isPostgreSqlConfigured()) {
    const rows = await db.select({ token: fcmDevices.token })
      .from(fcmDevices)
      .innerJoin(authSessions, eq(fcmDevices.sessionId, authSessions.sessionId))
      .where(and(
        eq(fcmDevices.phoneNormalized, phone),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date())
      ));
    return rows.map(({ token }) => token);
  }
  const rows = getLocalDb().prepare(
    `SELECT d.token FROM local_fcm_devices d
     INNER JOIN local_auth_sessions s ON s.session_id = d.session_id
     WHERE d.phone_normalized = ? AND s.revoked_at IS NULL AND s.expires_at > ?`
  ).all(phone, new Date().toISOString()) as Array<{ token: string }>;
  return rows.map(({ token }) => token);
}

async function removeInvalidToken(token: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from('fcm_devices').delete().eq('token', token);
    if (error) throw new Error(`Could not remove invalid notification device: ${error.message}`);
  } else if (isPostgreSqlConfigured()) {
    await db.delete(fcmDevices).where(eq(fcmDevices.token, token));
  } else {
    getLocalDb().prepare('DELETE FROM local_fcm_devices WHERE token = ?').run(token);
  }
}

async function pruneNotificationEvents(): Promise<void> {
  const now = Date.now();
  if (now - lastNotificationEventCleanupAt < 24 * 60 * 60 * 1000) return;
  lastNotificationEventCleanupAt = now;
  const cutoff = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const supabase = getSupabaseServerClient();
  try {
    if (supabase) {
      const { error } = await supabase.from('notification_events').delete()
        .lt('created_at', cutoff.toISOString());
      if (error) throw new Error(error.message);
    } else if (isPostgreSqlConfigured()) {
      await db.delete(notificationEvents).where(lt(notificationEvents.createdAt, cutoff));
    } else {
      getLocalDb().prepare('DELETE FROM local_notification_events WHERE created_at < ?')
        .run(cutoff.toISOString());
    }
  } catch (error) {
    console.error('Notification event cleanup failed:', {
      code: error instanceof Error ? error.name : 'unknown',
    });
  }
}

async function claimNotificationEvent(phone: string, eventId: string): Promise<boolean> {
  await pruneNotificationEvents();
  const now = new Date();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase.from('notification_events')
      .insert({
        phone_normalized: phone,
        event_id: eventId,
        created_at: now.toISOString(),
      })
      .select('event_id')
      .maybeSingle();
    if (error?.code === '23505') return false;
    if (error) throw new Error(`Could not claim notification event: ${error.message}`);
    return Boolean(data);
  }
  if (isPostgreSqlConfigured()) {
    const inserted = await db.insert(notificationEvents).values({
      phoneNormalized: phone,
      eventId,
      createdAt: now,
    }).onConflictDoNothing().returning({ eventId: notificationEvents.eventId });
    return inserted.length > 0;
  }
  const result = getLocalDb().prepare(`
    INSERT OR IGNORE INTO local_notification_events (phone_normalized, event_id, created_at)
    VALUES (?, ?, ?)
  `).run(phone, eventId, now.toISOString());
  return Number(result.changes) > 0;
}

async function releaseNotificationEvent(phone: string, eventId: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from('notification_events').delete()
      .eq('phone_normalized', phone).eq('event_id', eventId);
    if (error) throw new Error(`Could not release notification event: ${error.message}`);
  } else if (isPostgreSqlConfigured()) {
    await db.delete(notificationEvents).where(and(
      eq(notificationEvents.phoneNormalized, phone),
      eq(notificationEvents.eventId, eventId)
    ));
  } else {
    getLocalDb().prepare(
      'DELETE FROM local_notification_events WHERE phone_normalized = ? AND event_id = ?'
    ).run(phone, eventId);
  }
}

export async function sendPushNotification(
  phone: string,
  category: NotificationCategory,
  payload: { eventId: string; title: string; body: string; [key: string]: string }
): Promise<void> {
  const [preferences, tokens] = await Promise.all([
    getNotificationPreferences(phone),
    getTokensForUser(phone),
  ]);
  if (!preferences[category] || tokens.length === 0) return;
  if (!(await claimNotificationEvent(phone, payload.eventId))) return;

  try {
    const messaging = getMessaging();
    const safeData: Record<string, string> = {};
    let payloadBytes = 0;
    for (const [key, rawValue] of Object.entries(payload)) {
      let value = String(rawValue);
      if (key.toLowerCase().includes('avatar') && value) {
        if (!/^https?:\/\//i.test(value) && !/^\/api\/media\/[a-zA-Z0-9._-]+$/.test(value)) {
          value = '';
        }
      }
      const maxValueBytes = key.toLowerCase().includes('avatar') ? 1024 : 512;
      while (value && Buffer.byteLength(value, 'utf8') > maxValueBytes) {
        value = value.slice(0, Math.floor(value.length * 0.8));
      }
      const entryBytes = Buffer.byteLength(key, 'utf8') + Buffer.byteLength(value, 'utf8');
      if (!value || payloadBytes + entryBytes > 3800) continue;
      safeData[key] = value;
      payloadBytes += entryBytes;
    }
    const timeToLive = payload.type === 'incoming-call'
      ? '35'
      : payload.type === 'incoming-group-call'
        ? '3600'
        : '86400';
    for (let offset = 0; offset < tokens.length; offset += 500) {
      const tokenBatch = tokens.slice(offset, offset + 500);
      const response = await messaging.sendEachForMulticast({
        tokens: tokenBatch,
        data: safeData,
        webpush: { headers: { Urgency: 'high', TTL: timeToLive } },
      });
      const invalidTokens: string[] = [];
      const retryTokens: string[] = [];
      response.responses.forEach((result, index) => {
        if (result.success) return;
        const code = result.error?.code || '';
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.push(tokenBatch[index]);
        } else if (
          code === 'messaging/server-unavailable' ||
          code === 'messaging/internal-error' ||
          code === 'messaging/message-rate-exceeded'
        ) {
          retryTokens.push(tokenBatch[index]);
        } else {
          console.error('FCM delivery failed:', { code, category });
        }
      });

      await Promise.all(invalidTokens.map(removeInvalidToken));
      if (retryTokens.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const retry = await messaging.sendEachForMulticast({
          tokens: retryTokens,
          data: safeData,
          webpush: { headers: { Urgency: 'high', TTL: timeToLive } },
        });
        const retryInvalid = retry.responses.flatMap((result, index) =>
          !result.success && (
            result.error?.code === 'messaging/registration-token-not-registered' ||
            result.error?.code === 'messaging/invalid-registration-token'
          ) ? [retryTokens[index]] : []
        );
        await Promise.all(retryInvalid.map(removeInvalidToken));
        retry.responses.forEach((result) => {
          if (!result.success) {
            console.error('FCM retry failed:', {
              code: result.error?.code || 'unknown',
              category,
            });
          }
        });
      }
    }
  } catch (error) {
    try {
      await releaseNotificationEvent(phone, payload.eventId);
    } catch (releaseError) {
      console.error('Failed to release notification event:', {
        code: releaseError instanceof Error ? releaseError.name : 'unknown',
      });
    }
    throw error;
  }
}

export async function cancelCallPushNotification(phone: string, callId: string): Promise<void> {
  const tokens = await getTokensForUser(phone);
  if (tokens.length === 0) return;
  for (let offset = 0; offset < tokens.length; offset += 500) {
    const batch = tokens.slice(offset, offset + 500);
    const response = await getMessaging().sendEachForMulticast({
      tokens: batch,
      data: {
        eventId: `call-cancel:${callId}`,
        type: 'call-cancel',
        callId,
        title: '',
        body: '',
      },
      webpush: { headers: { Urgency: 'high', TTL: '60' } },
    });
    const invalidTokens = response.responses.flatMap((result, index) =>
      !result.success && (
        result.error?.code === 'messaging/registration-token-not-registered' ||
        result.error?.code === 'messaging/invalid-registration-token'
      ) ? [batch[index]] : []
    );
    await Promise.all(invalidTokens.map(removeInvalidToken));
  }
}

export function getVapidPublicKey(): string {
  return process.env.FCM_VAPID_PUBLIC_KEY?.trim() || '';
}

export function isFcmServerConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}
