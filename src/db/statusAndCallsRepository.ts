import { getLocalDb } from './localDatabase.ts';
import {
  getSupabaseServerClient,
  isSupabaseTableMissingError,
} from '../lib/supabaseServer.ts';

export interface StatusStoryWireDto {
  storyId: string;
  authorPhone: string;
  authorName: string;
  authorAvatar: string | null;
  storyType: 'text' | 'image' | 'video';
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
  groupId?: string | null;
  isGroup?: boolean;
  groupName?: string | null;
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
  group_id?: string | null;
  is_group?: boolean | null;
  group_name?: string | null;
  started_at: string;
  ended_at: string | null;
}

function parsePhoneArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function mapSbStatusToWire(row: SupabaseStatusRow): StatusStoryWireDto {
  const createdDate = row.created_at ? new Date(row.created_at) : new Date();
  return {
    storyId: row.story_id,
    authorPhone: row.author_phone,
    authorName: row.author_name,
    authorAvatar: row.author_avatar ?? null,
    storyType: row.story_type === 'image' || row.story_type === 'video' ? row.story_type : 'text',
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

function mapLocalStatusToWire(row: Record<string, unknown>): StatusStoryWireDto {
  const createdDate = row.created_at ? new Date(String(row.created_at)) : new Date();
  return {
    storyId: String(row.story_id),
    authorPhone: String(row.author_phone),
    authorName: String(row.author_name),
    authorAvatar: row.author_avatar ? String(row.author_avatar) : null,
    storyType: row.story_type === 'image' || row.story_type === 'video' ? row.story_type : 'text',
    textContent: row.text_content ? String(row.text_content) : null,
    mediaUrl: row.media_url ? String(row.media_url) : null,
    caption: row.caption ? String(row.caption) : null,
    bgColor: row.bg_color ? String(row.bg_color) : null,
    viewerPhones: parsePhoneArray(row.viewer_phones_json as string | null),
    expiresAt: String(row.expires_at),
    createdAt: createdDate.toISOString(),
    timestampRaw: createdDate.getTime(),
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
    groupId: row.group_id ?? null,
    isGroup: Boolean(row.is_group),
    groupName: row.group_name ?? null,
    startedAt: startedDate.toISOString(),
    endedAt: row.ended_at ?? null,
    timestampRaw: startedDate.getTime(),
  };
}

function mapLocalCallToWire(row: Record<string, unknown>): CallRecordWireDto {
  const startedDate = row.started_at ? new Date(String(row.started_at)) : new Date();
  const outcome = String(row.outcome || 'ringing');
  return {
    callId: String(row.call_id),
    callerPhone: String(row.caller_phone),
    callerName: String(row.caller_name),
    callerAvatar: row.caller_avatar ? String(row.caller_avatar) : null,
    calleePhone: String(row.callee_phone),
    calleeName: String(row.callee_name),
    calleeAvatar: row.callee_avatar ? String(row.callee_avatar) : null,
    callType: row.call_type === 'video' ? 'video' : 'audio',
    outcome: (['ringing', 'answered', 'missed', 'rejected', 'busy'].includes(outcome)
      ? outcome
      : 'missed') as CallRecordWireDto['outcome'],
    durationSeconds: Number(row.duration_seconds || 0),
    missedSeenByCallee: Boolean(row.missed_seen_by_callee),
    groupId: row.group_id ? String(row.group_id) : null,
    isGroup: Boolean(row.is_group),
    groupName: row.group_name ? String(row.group_name) : null,
    startedAt: startedDate.toISOString(),
    endedAt: row.ended_at ? String(row.ended_at) : null,
    timestampRaw: startedDate.getTime(),
  };
}

// ============================================================================
// STATUS STORIES
// ============================================================================

export async function createStatusStoryInDb(params: {
  storyId: string;
  authorPhone: string;
  authorName: string;
  authorAvatar: string | null;
  storyType: 'text' | 'image' | 'video';
  textContent?: string | null;
  mediaUrl?: string | null;
  caption?: string | null;
  bgColor?: string | null;
}): Promise<StatusStoryWireDto> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();
  const expiresIso = expiresAt.toISOString();
  const viewersJson = JSON.stringify([params.authorPhone]);

  // Save to local DB first
  const ldb = getLocalDb();
  ldb.prepare(`
    INSERT INTO local_status_stories (
      story_id, author_phone, author_name, author_avatar, story_type,
      text_content, media_url, caption, bg_color, viewer_phones_json,
      expires_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(story_id) DO UPDATE SET
      text_content = excluded.text_content,
      media_url = excluded.media_url,
      caption = excluded.caption,
      bg_color = excluded.bg_color
  `).run(
    params.storyId,
    params.authorPhone,
    params.authorName,
    params.authorAvatar,
    params.storyType,
    params.textContent ?? null,
    params.mediaUrl ?? null,
    params.caption ?? null,
    params.bgColor ?? null,
    viewersJson,
    expiresIso,
    nowIso
  );

  const localRow = ldb.prepare('SELECT * FROM local_status_stories WHERE story_id = ?').get(params.storyId) as Record<string, unknown>;
  const localDto = mapLocalStatusToWire(localRow);

  // Sync to Supabase if available
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase
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
          viewer_phones_json: viewersJson,
          expires_at: expiresIso,
          created_at: nowIso,
        },
        { onConflict: 'story_id' }
      )
      .select('*')
      .maybeSingle();

    if (data) {
      return mapSbStatusToWire(data as SupabaseStatusRow);
    }
  }

  return localDto;
}

export async function fetchVisibleStatusStories(params: {
  viewerPhone: string;
  contactPhones: string[];
}): Promise<StatusStoryWireDto[]> {
  const allowed = Array.from(new Set([params.viewerPhone, ...params.contactPhones].filter(Boolean)));
  if (allowed.length === 0) return [];

  const storyMap = new Map<string, StatusStoryWireDto>();
  const nowIso = new Date().toISOString();

  // Try Supabase first
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const cleanupResult = await supabase.rpc('cleanup_expired_statuses');
    if (cleanupResult.error) {
      console.warn('Could not clean expired Supabase statuses:', cleanupResult.error.message);
    }
    const { data, error } = await supabase
      .from('status_stories')
      .select('*')
      .in('author_phone', allowed)
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(150);

    if (!error && data) {
      for (const r of data as SupabaseStatusRow[]) {
        const dto = mapSbStatusToWire(r);
        storyMap.set(dto.storyId, dto);
      }
    }
  }

  // Merge with local DB
  try {
    const ldb = getLocalDb();
    ldb.prepare('DELETE FROM local_status_stories WHERE expires_at <= ?').run(nowIso);
    const placeholders = allowed.map(() => '?').join(',');
    const rows = ldb.prepare(`
      SELECT * FROM local_status_stories
      WHERE author_phone IN (${placeholders}) AND expires_at > ?
      ORDER BY created_at DESC
      LIMIT 150
    `).all(...allowed, nowIso) as Array<Record<string, unknown>>;

    for (const r of rows) {
      const dto = mapLocalStatusToWire(r);
      if (!storyMap.has(dto.storyId)) {
        storyMap.set(dto.storyId, dto);
      }
    }
  } catch {}

  return Array.from(storyMap.values()).sort((a, b) => b.timestampRaw - a.timestampRaw);
}

export async function markStatusStoryViewedInDb(
  storyId: string,
  viewerPhone: string
): Promise<StatusStoryWireDto | null> {
  const ldb = getLocalDb();
  let row: Record<string, unknown> | undefined;
  try {
    row = ldb.prepare('SELECT * FROM local_status_stories WHERE story_id = ? LIMIT 1').get(storyId) as Record<string, unknown> | undefined;
  } catch {}

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('status_stories')
      .select('*')
      .eq('story_id', storyId)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) {
      console.error('Could not verify status expiration:', error.message);
      return null;
    }
    if (data) {
      const sbRow = data as SupabaseStatusRow;
      const viewers = parsePhoneArray(sbRow.viewer_phones_json);
      if (!viewers.includes(viewerPhone)) {
        viewers.push(viewerPhone);
        const nextJson = JSON.stringify(viewers);
        await supabase.from('status_stories').update({ viewer_phones_json: nextJson }).eq('story_id', storyId);
        sbRow.viewer_phones_json = nextJson;
      }
      return mapSbStatusToWire(sbRow);
    }
  }

  if (!row || Date.parse(String(row.expires_at)) <= Date.now()) return null;
  const currentViewers = parsePhoneArray(row.viewer_phones_json as string | null);
  if (!currentViewers.includes(viewerPhone)) {
    currentViewers.push(viewerPhone);
    const nextJson = JSON.stringify(currentViewers);
    try {
      ldb.prepare('UPDATE local_status_stories SET viewer_phones_json = ? WHERE story_id = ?').run(nextJson, storyId);
      row.viewer_phones_json = nextJson;
    } catch {}
  }

  return mapLocalStatusToWire(row);
}

// ============================================================================
// CALL RECORDS
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
  const nowIso = now.toISOString();
  const endedIso = outcome === 'missed' ? nowIso : null;

  // Save to local DB first
  const ldb = getLocalDb();
  ldb.prepare(`
    INSERT INTO local_call_records (
      call_id, caller_phone, caller_name, caller_avatar,
      callee_phone, callee_name, callee_avatar,
      call_type, outcome, duration_seconds, missed_seen_by_callee,
      started_at, ended_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
    ON CONFLICT(call_id) DO NOTHING
  `).run(
    params.callId,
    params.callerPhone,
    params.callerName,
    params.callerAvatar,
    params.calleePhone,
    params.calleeName,
    params.calleeAvatar,
    params.callType,
    outcome,
    nowIso,
    endedIso
  );

  const localRow = ldb.prepare('SELECT * FROM local_call_records WHERE call_id = ?').get(params.callId) as Record<string, unknown>;
  const localDto = mapLocalCallToWire(localRow);

  // Sync to Supabase
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase
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
          started_at: nowIso,
          ended_at: endedIso,
        },
        { onConflict: 'call_id' }
      )
      .select('*')
      .maybeSingle();

    if (data) {
      return mapSbCallToWire(data as SupabaseCallRow);
    }
  }

  return localDto;
}

export async function finalizeCallRecordInDb(params: {
  callId: string;
  outcome: 'answered' | 'missed' | 'rejected' | 'busy';
  durationSeconds?: number;
}): Promise<CallRecordWireDto | null> {
  const nowIso = new Date().toISOString();
  const duration = Math.max(0, Math.floor(params.durationSeconds ?? 0));

  // 1. Update local DB
  const ldb = getLocalDb();
  let localRow: Record<string, unknown> | undefined;
  try {
    localRow = ldb.prepare('SELECT * FROM local_call_records WHERE call_id = ?').get(params.callId) as Record<string, unknown> | undefined;
    if (localRow) {
      const resolvedOutcome =
        String(localRow.outcome) === 'answered' && duration === 0 && params.outcome === 'missed'
          ? 'answered'
          : params.outcome;
      const resolvedDuration = Math.max(Number(localRow.duration_seconds || 0), duration);
      ldb.prepare('UPDATE local_call_records SET outcome = ?, duration_seconds = ?, ended_at = ? WHERE call_id = ?')
        .run(resolvedOutcome, resolvedDuration, nowIso, params.callId);
      localRow = ldb.prepare('SELECT * FROM local_call_records WHERE call_id = ?').get(params.callId) as Record<string, unknown>;
    }
  } catch {}

  // 2. Update Supabase
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase
      .from('call_records')
      .update({
        outcome: params.outcome,
        duration_seconds: duration,
        ended_at: nowIso,
      })
      .eq('call_id', params.callId)
      .select('*')
      .maybeSingle();

    if (data) {
      return mapSbCallToWire(data as SupabaseCallRow);
    }
  }

  return localRow ? mapLocalCallToWire(localRow) : null;
}

export async function markCallAnsweredInDb(callId: string): Promise<CallRecordWireDto | null> {
  const ldb = getLocalDb();
  try {
    ldb.prepare("UPDATE local_call_records SET outcome = 'answered', missed_seen_by_callee = 1 WHERE call_id = ?")
      .run(callId);
  } catch {}

  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      await supabase
        .from('call_records')
        .update({ outcome: 'answered', missed_seen_by_callee: true })
        .eq('call_id', callId);
    } catch {}
  }

  try {
    const row = ldb.prepare('SELECT * FROM local_call_records WHERE call_id = ?').get(callId) as Record<string, unknown> | undefined;
    return row ? mapLocalCallToWire(row) : null;
  } catch {
    return null;
  }
}

// ============================================================================
// GROUP CALLS REPOSITORY METHODS
// ============================================================================

export async function createGroupCallRecordInDb(params: {
  callId: string;
  groupId: string;
  groupName: string;
  groupAvatar?: string | null;
  callerPhone: string;
  callerName: string;
  callerAvatar: string | null;
  callType: 'audio' | 'video';
  memberPhones: string[];
}): Promise<CallRecordWireDto> {
  const now = new Date();
  const nowIso = now.toISOString();
  const ldb = getLocalDb();

  // 1. Insert local call record
  try {
    ldb.prepare(`
      INSERT INTO local_call_records (
        call_id, caller_phone, caller_name, caller_avatar, callee_phone,
        callee_name, callee_avatar, call_type, outcome, duration_seconds,
        missed_seen_by_callee, group_id, is_group, group_name, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'answered', 0, 1, ?, 1, ?, ?, NULL)
      ON CONFLICT(call_id) DO NOTHING
    `).run(
      params.callId,
      params.callerPhone,
      params.callerName,
      params.callerAvatar,
      params.groupId,
      params.groupName,
      params.groupAvatar ?? null,
      params.callType,
      params.groupId,
      params.groupName,
      nowIso
    );

    // Host participant
    ldb.prepare(`
      INSERT INTO local_call_participants (
        call_id, conversation_id, user_phone, user_name, user_avatar, role, status,
        is_muted, is_video_off, joined_at, left_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'host', 'joined', 0, 0, ?, NULL, ?, ?)
    `).run(
      params.callId,
      params.groupId,
      params.callerPhone,
      params.callerName,
      params.callerAvatar,
      nowIso,
      nowIso,
      nowIso
    );

    // Invited members
    for (const phone of params.memberPhones) {
      if (!phone || phone === params.callerPhone) continue;
      ldb.prepare(`
        INSERT INTO local_call_participants (
          call_id, conversation_id, user_phone, user_name, user_avatar, role, status,
          is_muted, is_video_off, joined_at, left_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, 'member', 'invited', 0, 0, NULL, NULL, ?, ?)
      `).run(params.callId, params.groupId, phone, phone, nowIso, nowIso);
    }
  } catch {}

  // 2. Insert into Supabase if configured
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      await supabase
        .from('call_records')
        .upsert(
          {
            call_id: params.callId,
            caller_phone: params.callerPhone,
            caller_name: params.callerName,
            caller_avatar: params.callerAvatar,
            callee_phone: params.groupId,
            callee_name: params.groupName,
            callee_avatar: params.groupAvatar ?? null,
            call_type: params.callType,
            outcome: 'answered',
            duration_seconds: 0,
            missed_seen_by_callee: true,
            group_id: params.groupId,
            is_group: true,
            group_name: params.groupName,
            started_at: nowIso,
          },
          { onConflict: 'call_id' }
        );

      await supabase
        .from('call_participants')
        .upsert(
          {
            call_id: params.callId,
            conversation_id: params.groupId,
            user_phone: params.callerPhone,
            user_name: params.callerName,
            user_avatar: params.callerAvatar,
            role: 'host',
            status: 'joined',
            joined_at: nowIso,
            created_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: 'call_id,user_phone' }
        );

      const memberInserts = params.memberPhones
        .filter((p) => p && p !== params.callerPhone)
        .map((p) => ({
          call_id: params.callId,
          conversation_id: params.groupId,
          user_phone: p,
          user_name: p,
          user_avatar: null,
          role: 'member',
          status: 'invited',
          created_at: nowIso,
          updated_at: nowIso,
        }));

      if (memberInserts.length > 0) {
        await supabase
          .from('call_participants')
          .upsert(memberInserts, { onConflict: 'call_id,user_phone' });
      }
    } catch {}
  }

  const localRow = ldb.prepare('SELECT * FROM local_call_records WHERE call_id = ?').get(params.callId) as Record<string, unknown>;
  return mapLocalCallToWire(localRow || {
    call_id: params.callId,
    caller_phone: params.callerPhone,
    caller_name: params.callerName,
    caller_avatar: params.callerAvatar,
    callee_phone: params.groupId,
    callee_name: params.groupName,
    callee_avatar: params.groupAvatar ?? null,
    call_type: params.callType,
    outcome: 'answered',
    duration_seconds: 0,
    missed_seen_by_callee: 1,
    group_id: params.groupId,
    is_group: 1,
    group_name: params.groupName,
    started_at: nowIso,
  });
}

export async function updateCallParticipantStatusInDb(params: {
  callId: string;
  userPhone: string;
  userName?: string;
  userAvatar?: string | null;
  status: 'invited' | 'joined' | 'left' | 'declined' | 'missed';
  role?: 'host' | 'member';
  isMuted?: boolean;
  isVideoOff?: boolean;
}): Promise<void> {
  const nowIso = new Date().toISOString();
  const ldb = getLocalDb();

  try {
    const existing = ldb.prepare('SELECT * FROM local_call_participants WHERE call_id = ? AND user_phone = ?').get(params.callId, params.userPhone) as Record<string, unknown> | undefined;
    if (existing) {
      ldb.prepare(`
        UPDATE local_call_participants
        SET status = ?,
            user_name = COALESCE(?, user_name),
            user_avatar = COALESCE(?, user_avatar),
            joined_at = CASE WHEN ? = 'joined' AND joined_at IS NULL THEN ? ELSE joined_at END,
            left_at = CASE WHEN ? IN ('left', 'declined') THEN ? ELSE left_at END,
            is_muted = COALESCE(?, is_muted),
            is_video_off = COALESCE(?, is_video_off),
            updated_at = ?
        WHERE call_id = ? AND user_phone = ?
      `).run(
        params.status,
        params.userName ?? null,
        params.userAvatar ?? null,
        params.status,
        nowIso,
        params.status,
        nowIso,
        params.isMuted !== undefined ? (params.isMuted ? 1 : 0) : null,
        params.isVideoOff !== undefined ? (params.isVideoOff ? 1 : 0) : null,
        nowIso,
        params.callId,
        params.userPhone
      );
    } else {
      ldb.prepare(`
        INSERT INTO local_call_participants (
          call_id, user_phone, user_name, user_avatar, role, status,
          is_muted, is_video_off, joined_at, left_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      `).run(
        params.callId,
        params.userPhone,
        params.userName || params.userPhone,
        params.userAvatar ?? null,
        params.role || 'member',
        params.status,
        params.isMuted ? 1 : 0,
        params.isVideoOff ? 1 : 0,
        params.status === 'joined' ? nowIso : null,
        nowIso,
        nowIso
      );
    }
  } catch {}

  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const updateData: Record<string, unknown> = {
        status: params.status,
        updated_at: nowIso,
      };
      if (params.userName) updateData.user_name = params.userName;
      if (params.userAvatar !== undefined) updateData.user_avatar = params.userAvatar;
      if (params.isMuted !== undefined) updateData.is_muted = params.isMuted;
      if (params.isVideoOff !== undefined) updateData.is_video_off = params.isVideoOff;
      if (params.status === 'joined') updateData.joined_at = nowIso;
      if (params.status === 'left' || params.status === 'declined') updateData.left_at = nowIso;

      await supabase
        .from('call_participants')
        .upsert(
          {
            call_id: params.callId,
            user_phone: params.userPhone,
            ...updateData,
          },
          { onConflict: 'call_id,user_phone' }
        );
    } catch {}
  }
}

export async function fetchUserCallHistory(userPhone: string): Promise<CallRecordWireDto[]> {
  const callMap = new Map<string, CallRecordWireDto>();

  // 1. Try Supabase first
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      // Find direct 1-to-1 calls and calls where user is caller or callee
      const { data: directCalls } = await supabase
        .from('call_records')
        .select('*')
        .or(`caller_phone.eq.${userPhone},callee_phone.eq.${userPhone}`)
        .order('started_at', { ascending: false })
        .limit(100);

      if (directCalls) {
        for (const r of directCalls as SupabaseCallRow[]) {
          const dto = mapSbCallToWire(r);
          callMap.set(dto.callId, dto);
        }
      }

      // Find group calls where user participated
      const { data: participantRows } = await supabase
        .from('call_participants')
        .select('call_id')
        .eq('user_phone', userPhone)
        .limit(50);

      if (participantRows && participantRows.length > 0) {
        const callIds = participantRows.map((p) => p.call_id);
        const { data: groupCalls } = await supabase
          .from('call_records')
          .select('*')
          .in('call_id', callIds);

        if (groupCalls) {
          for (const r of groupCalls as SupabaseCallRow[]) {
            const dto = mapSbCallToWire(r);
            callMap.set(dto.callId, dto);
          }
        }
      }
    } catch {}
  }

  // 2. Merge with local DB
  try {
    const ldb = getLocalDb();
    const rows = ldb.prepare(`
      SELECT * FROM local_call_records
      WHERE caller_phone = ? OR callee_phone = ? OR group_id IN (
        SELECT conversation_id FROM local_call_participants WHERE user_phone = ?
      ) OR call_id IN (
        SELECT call_id FROM local_call_participants WHERE user_phone = ?
      )
      ORDER BY started_at DESC
      LIMIT 100
    `).all(userPhone, userPhone, userPhone, userPhone) as Array<Record<string, unknown>>;

    for (const r of rows) {
      const dto = mapLocalCallToWire(r);
      if (!callMap.has(dto.callId)) {
        callMap.set(dto.callId, dto);
      }
    }
  } catch {}

  return Array.from(callMap.values()).sort((a, b) => b.timestampRaw - a.timestampRaw);
}

export async function markMissedCallsSeenInDb(calleePhone: string): Promise<number> {
  let count = 0;

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data } = await supabase
      .from('call_records')
      .update({ missed_seen_by_callee: true })
      .eq('callee_phone', calleePhone)
      .in('outcome', ['missed', 'ringing'])
      .eq('missed_seen_by_callee', false)
      .select('id');

    if (data) count = data.length;
  }

  try {
    const ldb = getLocalDb();
    const res = ldb.prepare(`
      UPDATE local_call_records SET missed_seen_by_callee = 1
      WHERE callee_phone = ? AND outcome IN ('missed', 'ringing') AND missed_seen_by_callee = 0
    `).run(calleePhone);
    count = Math.max(count, Number(res.changes || 0));
  } catch {}

  return count;
}

export async function getActiveGroupCallFromDb(groupId: string): Promise<{
  active: boolean;
  callId?: string;
  callType?: 'audio' | 'video';
  hostPhone?: string;
  hostName?: string;
  groupName?: string;
  participantCount?: number;
} | null> {
  const ldb = getLocalDb();
  try {
    const row = ldb.prepare(`
      SELECT * FROM local_call_records
      WHERE group_id = ? AND is_group = 1 AND ended_at IS NULL AND outcome IN ('ringing', 'answered')
      ORDER BY started_at DESC
      LIMIT 1
    `).get(groupId) as Record<string, unknown> | undefined;

    if (row) {
      const callId = String(row.call_id);
      const countRow = ldb.prepare(`
        SELECT COUNT(*) as count FROM local_call_participants
        WHERE call_id = ? AND status = 'joined'
      `).get(callId) as { count?: number } | undefined;

      return {
        active: true,
        callId,
        callType: row.call_type === 'video' ? 'video' : 'audio',
        hostPhone: String(row.caller_phone),
        hostName: String(row.caller_name),
        groupName: row.group_name ? String(row.group_name) : undefined,
        participantCount: Math.max(1, Number(countRow?.count || 1)),
      };
    }
  } catch {}

  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const { data } = await supabase
        .from('call_records')
        .select('*')
        .eq('group_id', groupId)
        .eq('is_group', true)
        .is('ended_at', null)
        .in('outcome', ['ringing', 'answered'])
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        const callId = (data as SupabaseCallRow).call_id;
        const { count } = await supabase
          .from('call_participants')
          .select('id', { count: 'exact', head: true })
          .eq('call_id', callId)
          .eq('status', 'joined');

        return {
          active: true,
          callId,
          callType: data.call_type === 'video' ? 'video' : 'audio',
          hostPhone: data.caller_phone,
          hostName: data.caller_name,
          groupName: data.group_name || undefined,
          participantCount: Math.max(1, count || 1),
        };
      }
    } catch {}
  }

  return { active: false };
}
