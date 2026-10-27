import { and, desc, eq, gt, inArray, or } from 'drizzle-orm';
import { db } from './index.ts';
import {
  callRecords,
  directMessages,
  statusStories,
  type DbCallRecord,
  type DbStatusStory,
} from './schema.ts';
import {
  getSupabaseServerClient,
  isSupabaseTableMissingError,
} from '../lib/supabaseServer.ts';

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

export interface StatusStoryWireDto {
  storyId: string;
  authorPhone: string;
  authorName: string;
  authorAvatar: string | null;
  storyType: 'text' | 'image';
  textContent: string | null;
  mediaUrl: string | null;
  caption: string | null;
  bgColor: string | null;
  viewerPhones: string[];
  expiresAt: string;
  createdAt: string;
  timestampRaw: number;
}

export interface CallRecordWireDto {
  callId: string;
  callerPhone: string;
  callerName: string;
  callerAvatar: string | null;
  calleePhone: string;
  calleeName: string;
  calleeAvatar: string | null;
  callType: 'audio' | 'video';
  outcome: 'ringing' | 'answered' | 'missed' | 'rejected' | 'busy';
  durationSeconds: number;
  missedSeenByCallee: boolean;
  startedAt: string;
  endedAt: string | null;
  timestampRaw: number;
}

interface SupabaseStatusRow {
  id: number;
  story_id: string;
  author_phone: string;
  author_name: string;
  author_avatar: string | null;
  story_type: string;
  text_content: string | null;
  media_url: string | null;
  caption: string | null;
  bg_color: string | null;
  viewer_phones_json: string | null;
  expires_at: string;
  created_at: string;
}

interface SupabaseCallRow {
  id: number;
  call_id: string;
  caller_phone: string;
  caller_name: string;
  caller_avatar: string | null;
  callee_phone: string;
  callee_name: string;
  callee_avatar: string | null;
  call_type: string;
  outcome: string;
  duration_seconds: number;
  missed_seen_by_callee: boolean;
  started_at: string;
  ended_at: string | null;
}

export const inMemoryFallbackStatuses = new Map<string, StatusStoryWireDto>();
export const inMemoryFallbackCalls = new Map<string, CallRecordWireDto>();

function parsePhoneArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function mapPgStatusToWire(row: DbStatusStory): StatusStoryWireDto {
  const createdIso = row.createdAt.toISOString();
  return {
    storyId: row.storyId,
    authorPhone: row.authorPhone,
    authorName: row.authorName,
    authorAvatar: row.authorAvatar ?? null,
    storyType: row.storyType === 'image' ? 'image' : 'text',
    textContent: row.textContent ?? null,
    mediaUrl: row.mediaUrl ?? null,
    caption: row.caption ?? null,
    bgColor: row.bgColor ?? null,
    viewerPhones: parsePhoneArray(row.viewerPhonesJson),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: createdIso,
    timestampRaw: row.createdAt.getTime(),
  };
}

function mapSbStatusToWire(row: SupabaseStatusRow): StatusStoryWireDto {
  const createdDate = row.created_at ? new Date(row.created_at) : new Date();
  return {
    storyId: row.story_id,
    authorPhone: row.author_phone,
    authorName: row.author_name,
    authorAvatar: row.author_avatar ?? null,
    storyType: row.story_type === 'image' ? 'image' : 'text',
    textContent: row.text_content ?? null,
    mediaUrl: row.media_url ?? null,
    caption: row.caption ?? null,
    bgColor: row.bg_color ?? null,
    viewerPhones: parsePhoneArray(row.viewer_phones_json),
    expiresAt: row.expires_at,
    createdAt: createdDate.toISOString(),
    timestampRaw: createdDate.getTime(),
  };
}

function mapPgCallToWire(row: DbCallRecord): CallRecordWireDto {
  return {
    callId: row.callId,
    callerPhone: row.callerPhone,
    callerName: row.callerName,
    callerAvatar: row.callerAvatar ?? null,
    calleePhone: row.calleePhone,
    calleeName: row.calleeName,
    calleeAvatar: row.calleeAvatar ?? null,
    callType: row.callType === 'video' ? 'video' : 'audio',
    outcome: (['ringing', 'answered', 'missed', 'rejected', 'busy'].includes(row.outcome)
      ? row.outcome
      : 'missed') as CallRecordWireDto['outcome'],
    durationSeconds: row.durationSeconds ?? 0,
    missedSeenByCallee: Boolean(row.missedSeenByCallee),
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt ? row.endedAt.toISOString() : null,
    timestampRaw: row.startedAt.getTime(),
  };
}

function mapSbCallToWire(row: SupabaseCallRow): CallRecordWireDto {
  const startedDate = row.started_at ? new Date(row.started_at) : new Date();
  return {
    callId: row.call_id,
    callerPhone: row.caller_phone,
    callerName: row.caller_name,
    callerAvatar: row.caller_avatar ?? null,
    calleePhone: row.callee_phone,
    calleeName: row.callee_name,
    calleeAvatar: row.callee_avatar ?? null,
    callType: row.call_type === 'video' ? 'video' : 'audio',
    outcome: (['ringing', 'answered', 'missed', 'rejected', 'busy'].includes(row.outcome)
      ? row.outcome
      : 'missed') as CallRecordWireDto['outcome'],
    durationSeconds: row.duration_seconds ?? 0,
    missedSeenByCallee: Boolean(row.missed_seen_by_callee),
    startedAt: startedDate.toISOString(),
    endedAt: row.ended_at ?? null,
    timestampRaw: startedDate.getTime(),
  };
}

/**
 * Returns all unique peer phones that have chatted with `userPhone` in direct_messages,
 * so status broadcasts reach everyone in their chat threads.
 */
export async function getConversationPeerPhones(userPhone: string): Promise<string[]> {
  const peerSet = new Set<string>();

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('direct_messages')
      .select('sender_phone, recipient_phone')
      .or(`sender_phone.eq.${userPhone},recipient_phone.eq.${userPhone}`)
      .limit(300);

    if (!error && data) {
      for (const row of data as Array<{ sender_phone: string; recipient_phone: string }>) {
        if (row.sender_phone && row.sender_phone !== userPhone) peerSet.add(row.sender_phone);
        if (row.recipient_phone && row.recipient_phone !== userPhone) peerSet.add(row.recipient_phone);
      }
      if (!hasPgPoolCredentials()) {
        return Array.from(peerSet);
      }
    }
  }

  if (hasPgPoolCredentials()) {
    try {
      const rows = await db
        .select({
          senderPhone: directMessages.senderPhone,
          recipientPhone: directMessages.recipientPhone,
        })
        .from(directMessages)
        .where(
          or(
            eq(directMessages.senderPhone, userPhone),
            eq(directMessages.recipientPhone, userPhone)
          )
        )
        .limit(400);

      for (const row of rows) {
        if (row.senderPhone && row.senderPhone !== userPhone) peerSet.add(row.senderPhone);
        if (row.recipientPhone && row.recipientPhone !== userPhone) peerSet.add(row.recipientPhone);
      }
    } catch {
      // Non-fatal
    }
  }

  return Array.from(peerSet);
}

/**
 * Publishes a 24-hour status story visible to everyone who has added the author to their chats
 * or chatted with the author.
 */
export async function createStatusStoryInDb(params: {
  storyId: string;
  authorPhone: string;
  authorName: string;
  authorAvatar: string | null;
  storyType: 'text' | 'image';
  textContent?: string | null;
  mediaUrl?: string | null;
  caption?: string | null;
  bgColor?: string | null;
}): Promise<StatusStoryWireDto> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
  const initialViewersJson = JSON.stringify([params.authorPhone]);

  const supabase = getSupabaseServerClient();
  let sbResult: StatusStoryWireDto | null = null;

  if (supabase) {
    const { data, error } = await supabase
      .from('status_stories')
      .upsert(
        {
          story_id: params.storyId,
          author_phone: params.authorPhone,
          author_name: params.authorName,
          author_avatar: params.authorAvatar,
          story_type: params.storyType,
          text_content: params.textContent ?? null,
          media_url: params.mediaUrl ?? null,
          caption: params.caption ?? null,
          bg_color: params.bgColor ?? null,
          viewer_phones_json: initialViewersJson,
          expires_at: expiresAt.toISOString(),
          created_at: now.toISOString(),
        },
        { onConflict: 'story_id' }
      )
      .select('*')
      .single();

    if (!error && data) {
      sbResult = mapSbStatusToWire(data as SupabaseStatusRow);
      if (!hasPgPoolCredentials()) {
        return sbResult;
      }
    } else if (error && !isSupabaseTableMissingError(error) && !hasPgPoolCredentials()) {
      throw new Error(`Failed to save status story: ${error.message}`);
    }
  }

  if (hasPgPoolCredentials()) {
    const existing = await db
      .select()
      .from(statusStories)
      .where(eq(statusStories.storyId, params.storyId))
      .limit(1);

    if (existing.length > 0) {
      return mapPgStatusToWire(existing[0]);
    }

    const inserted = await db
      .insert(statusStories)
      .values({
        storyId: params.storyId,
        authorPhone: params.authorPhone,
        authorName: params.authorName,
        authorAvatar: params.authorAvatar,
        storyType: params.storyType,
        textContent: params.textContent ?? null,
        mediaUrl: params.mediaUrl ?? null,
        caption: params.caption ?? null,
        bgColor: params.bgColor ?? null,
        viewerPhonesJson: initialViewersJson,
        expiresAt,
        createdAt: now,
      })
      .returning();

    return mapPgStatusToWire(inserted[0]);
  }

  if (sbResult) return sbResult;

  if (!hasPgPoolCredentials()) {
    const created: StatusStoryWireDto = {
      storyId: params.storyId,
      authorPhone: params.authorPhone,
      authorName: params.authorName,
      authorAvatar: params.authorAvatar,
      storyType: params.storyType,
      textContent: params.textContent ?? null,
      mediaUrl: params.mediaUrl ?? null,
      caption: params.caption ?? null,
      bgColor: params.bgColor ?? null,
      viewerPhones: [params.authorPhone],
      expiresAt: expiresAt.toISOString(),
      createdAt: now.toISOString(),
      timestampRaw: now.getTime(),
    };
    inMemoryFallbackStatuses.set(params.storyId, created);
    return created;
  }

  throw new Error('No database available to save status story.');
}

/**
 * Fetches active (unexpired) 24-hour status stories authored by the user, all users they
 * have added contacts with, and all contacts across the app.
 */
export async function fetchVisibleStatusStories(params: {
  viewerPhone: string;
  contactPhones: string[];
}): Promise<StatusStoryWireDto[]> {
  const now = new Date();

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('status_stories')
      .select('*')
      .gt('expires_at', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(200);

    if (!error && data && (data.length > 0 || !hasPgPoolCredentials())) {
      return (data as SupabaseStatusRow[]).map(mapSbStatusToWire);
    }
  }

  if (!hasPgPoolCredentials()) {
    const nowMs = now.getTime();
    return Array.from(inMemoryFallbackStatuses.values())
      .filter((s) => new Date(s.expiresAt).getTime() > nowMs)
      .sort((a, b) => b.timestampRaw - a.timestampRaw);
  }

  const rows = await db
    .select()
    .from(statusStories)
    .where(gt(statusStories.expiresAt, now))
    .orderBy(desc(statusStories.createdAt))
    .limit(200);

  return rows.map(mapPgStatusToWire);
}

export async function markStatusStoryViewedInDb(
  storyId: string,
  viewerPhone: string
): Promise<StatusStoryWireDto | null> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: existing, error } = await supabase
      .from('status_stories')
      .select('*')
      .eq('story_id', storyId)
      .maybeSingle();

    if (!error && existing) {
      const row = existing as SupabaseStatusRow;
      const viewers = parsePhoneArray(row.viewer_phones_json);
      if (!viewers.includes(viewerPhone)) {
        viewers.push(viewerPhone);
        const { data: updated } = await supabase
          .from('status_stories')
          .update({ viewer_phones_json: JSON.stringify(viewers) })
          .eq('story_id', storyId)
          .select('*')
          .maybeSingle();
        if (updated && !hasPgPoolCredentials()) {
          return mapSbStatusToWire(updated as SupabaseStatusRow);
        }
      } else if (!hasPgPoolCredentials()) {
        return mapSbStatusToWire(row);
      }
    }
  }

  if (!hasPgPoolCredentials()) {
    const story = inMemoryFallbackStatuses.get(storyId);
    if (!story) return null;
    if (!story.viewerPhones.includes(viewerPhone)) {
      story.viewerPhones.push(viewerPhone);
    }
    return story;
  }

  const rows = await db
    .select()
    .from(statusStories)
    .where(eq(statusStories.storyId, storyId))
    .limit(1);

  if (!rows.length) return null;
  const current = rows[0];
  const viewers = parsePhoneArray(current.viewerPhonesJson);
  if (!viewers.includes(viewerPhone)) {
    viewers.push(viewerPhone);
    const updated = await db
      .update(statusStories)
      .set({ viewerPhonesJson: JSON.stringify(viewers) })
      .where(eq(statusStories.id, current.id))
      .returning();
    return updated[0] ? mapPgStatusToWire(updated[0]) : null;
  }

  return mapPgStatusToWire(current);
}

// ============================================================================
// REAL INTERNET CALL LOGS & MISSED CALL PERSISTENCE
// ============================================================================

export async function createCallRecordInDb(params: {
  callId: string;
  callerPhone: string;
  callerName: string;
  callerAvatar: string | null;
  calleePhone: string;
  calleeName: string;
  calleeAvatar: string | null;
  callType: 'audio' | 'video';
  initialOutcome?: 'ringing' | 'missed';
}): Promise<CallRecordWireDto> {
  const now = new Date();
  const outcome = params.initialOutcome || 'ringing';
  const endedAt = outcome === 'missed' ? now : null;

  const supabase = getSupabaseServerClient();
  let sbRecord: CallRecordWireDto | null = null;

  if (supabase) {
    const { data, error } = await supabase
      .from('call_records')
      .upsert(
        {
          call_id: params.callId,
          caller_phone: params.callerPhone,
          caller_name: params.callerName,
          caller_avatar: params.callerAvatar,
          callee_phone: params.calleePhone,
          callee_name: params.calleeName,
          callee_avatar: params.calleeAvatar,
          call_type: params.callType,
          outcome,
          duration_seconds: 0,
          missed_seen_by_callee: false,
          started_at: now.toISOString(),
          ended_at: endedAt ? endedAt.toISOString() : null,
        },
        { onConflict: 'call_id' }
      )
      .select('*')
      .single();

    if (!error && data) {
      sbRecord = mapSbCallToWire(data as SupabaseCallRow);
      if (!hasPgPoolCredentials()) return sbRecord;
    }
  }

  if (hasPgPoolCredentials()) {
    const existing = await db
      .select()
      .from(callRecords)
      .where(eq(callRecords.callId, params.callId))
      .limit(1);

    if (existing.length > 0) {
      return mapPgCallToWire(existing[0]);
    }

    const inserted = await db
      .insert(callRecords)
      .values({
        callId: params.callId,
        callerPhone: params.callerPhone,
        callerName: params.callerName,
        callerAvatar: params.callerAvatar,
        calleePhone: params.calleePhone,
        calleeName: params.calleeName,
        calleeAvatar: params.calleeAvatar,
        callType: params.callType,
        outcome,
        durationSeconds: 0,
        missedSeenByCallee: false,
        startedAt: now,
        endedAt,
      })
      .returning();

    return mapPgCallToWire(inserted[0]);
  }

  if (sbRecord) return sbRecord;

  if (!hasPgPoolCredentials()) {
    const record: CallRecordWireDto = {
      callId: params.callId,
      callerPhone: params.callerPhone,
      callerName: params.callerName,
      callerAvatar: params.callerAvatar,
      calleePhone: params.calleePhone,
      calleeName: params.calleeName,
      calleeAvatar: params.calleeAvatar,
      callType: params.callType,
      outcome,
      durationSeconds: 0,
      missedSeenByCallee: false,
      startedAt: now.toISOString(),
      endedAt: endedAt ? endedAt.toISOString() : null,
      timestampRaw: now.getTime(),
    };
    inMemoryFallbackCalls.set(params.callId, record);
    return record;
  }

  throw new Error('No database available to save call record.');
}

export async function finalizeCallRecordInDb(params: {
  callId: string;
  outcome: 'answered' | 'missed' | 'rejected' | 'busy';
  durationSeconds?: number;
}): Promise<CallRecordWireDto | null> {
  const now = new Date();
  const duration = Math.max(0, Math.floor(params.durationSeconds ?? 0));

  const supabase = getSupabaseServerClient();
  let sbUpdated: CallRecordWireDto | null = null;

  if (supabase) {
    const { data, error } = await supabase
      .from('call_records')
      .update({
        outcome: params.outcome,
        duration_seconds: duration,
        ended_at: now.toISOString(),
      })
      .eq('call_id', params.callId)
      .select('*')
      .maybeSingle();

    if (!error && data) {
      sbUpdated = mapSbCallToWire(data as SupabaseCallRow);
      if (!hasPgPoolCredentials()) return sbUpdated;
    }
  }

  if (!hasPgPoolCredentials()) {
    const record = inMemoryFallbackCalls.get(params.callId);
    if (!record) return sbUpdated;
    const resolvedOutcome =
      record.outcome === 'answered' && duration === 0 && params.outcome === 'missed'
        ? 'answered'
        : params.outcome;
    record.outcome = resolvedOutcome;
    record.durationSeconds = Math.max(record.durationSeconds || 0, duration);
    record.endedAt = now.toISOString();
    return record;
  }

  const existing = await db
    .select()
    .from(callRecords)
    .where(eq(callRecords.callId, params.callId))
    .limit(1);

  if (!existing.length) return sbUpdated;

  // Preserve 'answered' if call was already connected and duration > 0
  const current = existing[0];
  const resolvedOutcome =
    current.outcome === 'answered' && duration === 0 && params.outcome === 'missed'
      ? 'answered'
      : params.outcome;
  const resolvedDuration = Math.max(current.durationSeconds || 0, duration);

  const updated = await db
    .update(callRecords)
    .set({
      outcome: resolvedOutcome,
      durationSeconds: resolvedDuration,
      endedAt: now,
    })
    .where(eq(callRecords.id, current.id))
    .returning();

  return updated[0] ? mapPgCallToWire(updated[0]) : sbUpdated;
}

export async function markCallAnsweredInDb(callId: string): Promise<CallRecordWireDto | null> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    await supabase
      .from('call_records')
      .update({ outcome: 'answered', missed_seen_by_callee: true })
      .eq('call_id', callId);
  }

  if (!hasPgPoolCredentials()) return null;

  const updated = await db
    .update(callRecords)
    .set({ outcome: 'answered', missedSeenByCallee: true })
    .where(eq(callRecords.callId, callId))
    .returning();

  return updated[0] ? mapPgCallToWire(updated[0]) : null;
}

export async function fetchUserCallHistory(userPhone: string): Promise<CallRecordWireDto[]> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('call_records')
      .select('*')
      .or(`caller_phone.eq.${userPhone},callee_phone.eq.${userPhone}`)
      .order('started_at', { ascending: false })
      .limit(100);

    if (!error && data && (data.length > 0 || !hasPgPoolCredentials())) {
      return (data as SupabaseCallRow[]).map(mapSbCallToWire);
    }
  }

  if (!hasPgPoolCredentials()) {
    return Array.from(inMemoryFallbackCalls.values())
      .filter((c) => c.callerPhone === userPhone || c.calleePhone === userPhone)
      .sort((a, b) => b.timestampRaw - a.timestampRaw);
  }

  const rows = await db
    .select()
    .from(callRecords)
    .where(
      or(
        eq(callRecords.callerPhone, userPhone),
        eq(callRecords.calleePhone, userPhone)
      )
    )
    .orderBy(desc(callRecords.startedAt))
    .limit(100);

  return rows.map(mapPgCallToWire);
}

export async function markMissedCallsSeenInDb(calleePhone: string): Promise<number> {
  let sbCount = 0;
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('call_records')
      .update({ missed_seen_by_callee: true })
      .eq('callee_phone', calleePhone)
      .in('outcome', ['missed', 'ringing'])
      .eq('missed_seen_by_callee', false)
      .select('id');

    if (!error && data) {
      sbCount = data.length;
      if (!hasPgPoolCredentials()) return sbCount;
    }
  }

  if (!hasPgPoolCredentials()) {
    let count = 0;
    for (const record of inMemoryFallbackCalls.values()) {
      if (record.calleePhone === calleePhone && !record.missedSeenByCallee) {
        record.missedSeenByCallee = true;
        count++;
      }
    }
    return count;
  }

  const updated = await db
    .update(callRecords)
    .set({ missedSeenByCallee: true })
    .where(
      and(
        eq(callRecords.calleePhone, calleePhone),
        eq(callRecords.missedSeenByCallee, false)
      )
    )
    .returning({ id: callRecords.id });

  return Math.max(sbCount, updated.length);
}
