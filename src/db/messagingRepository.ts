import { getLocalDb } from './localDatabase.ts';
import {
  getSupabaseServerClient,
  isSupabaseTableMissingError,
} from '../lib/supabaseServer.ts';
import type { LocationData, MessageReaction, PollData } from '../types/chat.ts';

export interface MessageRichPayload {
  mediaUrl?: string;
  mediaFileName?: string;
  mediaFileSize?: string;
  audioDuration?: number;
  waveformSamples?: number[];
  location?: LocationData;
  poll?: PollData;
  replyTo?: {
    id: string;
    text: string;
    senderName: string;
    mediaType?: string;
  };
  reactions?: MessageReaction[];
}

export interface DirectMessageDto {
  messageId: string;
  conversationKey: string;
  senderPhone: string;
  senderName: string;
  senderAvatar: string | null;
  recipientPhone: string;
  text: string;
  mediaType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'poll';
  payload: MessageRichPayload;
  status: 'sent' | 'delivered' | 'read';
  createdAt: string;
  timestampRaw: number;
}

export interface PeerDirectoryProfile {
  uid: string;
  phoneNormalized: string;
  fullName: string;
  about: string;
  avatarUrl: string | null;
}

interface SupabaseDirectMessageRow {
  id: number;
  message_id: string;
  conversation_key: string;
  sender_phone: string;
  sender_name: string;
  sender_avatar: string | null;
  recipient_phone: string;
  text: string;
  media_type: string;
  payload_json: string | null;
  status: string;
  deleted_for_everyone: boolean;
  created_at: string;
  updated_at: string;
}

export function makeConversationKey(phoneA: string, phoneB: string): string {
  return [phoneA.trim(), phoneB.trim()].sort().join('::');
}

function parseRichPayload(raw: string | null): MessageRichPayload {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as MessageRichPayload) : {};
  } catch {
    return {};
  }
}

function mapSupabaseDmToDto(row: SupabaseDirectMessageRow): DirectMessageDto {
  const createdDate = row.created_at ? new Date(row.created_at) : new Date();
  return {
    messageId: row.message_id,
    conversationKey: row.conversation_key,
    senderPhone: row.sender_phone,
    senderName: row.sender_name,
    senderAvatar: row.sender_avatar ?? null,
    recipientPhone: row.recipient_phone,
    text: row.text,
    mediaType: (row.media_type as DirectMessageDto['mediaType']) || 'text',
    payload: parseRichPayload(row.payload_json),
    status: (row.status as DirectMessageDto['status']) || 'sent',
    createdAt: createdDate.toISOString(),
    timestampRaw: createdDate.getTime(),
  };
}

function mapLocalDmToDto(row: Record<string, unknown>): DirectMessageDto {
  const createdDate = row.created_at ? new Date(String(row.created_at)) : new Date();
  return {
    messageId: String(row.message_id),
    conversationKey: String(row.conversation_key),
    senderPhone: String(row.sender_phone),
    senderName: String(row.sender_name),
    senderAvatar: row.sender_avatar ? String(row.sender_avatar) : null,
    recipientPhone: String(row.recipient_phone),
    text: String(row.text || ''),
    mediaType: (String(row.media_type || 'text') as DirectMessageDto['mediaType']),
    payload: parseRichPayload(row.payload_json as string | null),
    status: (String(row.status || 'sent') as DirectMessageDto['status']),
    createdAt: createdDate.toISOString(),
    timestampRaw: createdDate.getTime(),
  };
}

// Save to local SQLite cache
function saveLocalDm(params: {
  messageId: string;
  conversationKey: string;
  senderPhone: string;
  senderName: string;
  senderAvatar: string | null;
  recipientPhone: string;
  text: string;
  mediaType: string;
  payloadJson: string;
  status: string;
  createdAt: string;
}): DirectMessageDto {
  const ldb = getLocalDb();
  ldb.prepare(`
    INSERT INTO local_direct_messages (
      message_id, conversation_key, sender_phone, sender_name, sender_avatar,
      recipient_phone, text, media_type, payload_json, status, deleted_for_everyone,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(message_id) DO UPDATE SET
      payload_json = excluded.payload_json,
      status = excluded.status,
      updated_at = excluded.updated_at
  `).run(
    params.messageId,
    params.conversationKey,
    params.senderPhone,
    params.senderName,
    params.senderAvatar,
    params.recipientPhone,
    params.text,
    params.mediaType,
    params.payloadJson,
    params.status,
    params.createdAt,
    params.createdAt
  );

  const row = ldb.prepare('SELECT * FROM local_direct_messages WHERE message_id = ?').get(params.messageId) as Record<string, unknown>;
  return mapLocalDmToDto(row);
}

export async function lookupRegisteredUsersByPhones(
  phonesNormalized: string[]
): Promise<PeerDirectoryProfile[]> {
  const uniquePhones = Array.from(new Set(phonesNormalized.map((p) => p.trim()).filter(Boolean)));
  if (uniquePhones.length === 0) return [];

  const foundProfiles = new Map<string, PeerDirectoryProfile>();

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('uid, phone_normalized, full_name, about, avatar_url')
      .in('phone_normalized', uniquePhones);

    if (!error && data) {
      for (const r of data) {
        foundProfiles.set(String(r.phone_normalized), {
          uid: String(r.uid),
          phoneNormalized: String(r.phone_normalized),
          fullName: String(r.full_name),
          about: String(r.about || 'Hey there! I am using ZOLO.'),
          avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
        });
      }
    }
  }

  // Also check local users for any missing phones
  const missing = uniquePhones.filter((p) => !foundProfiles.has(p));
  if (missing.length > 0) {
    try {
      const ldb = getLocalDb();
      const placeholders = missing.map(() => '?').join(',');
      const rows = ldb.prepare(
        `SELECT uid, phone_normalized, full_name, about, avatar_url FROM local_users WHERE phone_normalized IN (${placeholders})`
      ).all(...missing) as Array<Record<string, unknown>>;

      for (const r of rows) {
        foundProfiles.set(String(r.phone_normalized), {
          uid: String(r.uid),
          phoneNormalized: String(r.phone_normalized),
          fullName: String(r.full_name),
          about: String(r.about || 'Hey there! I am using ZOLO.'),
          avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
        });
      }
    } catch {
      // Non-fatal
    }
  }

  return Array.from(foundProfiles.values());
}

export async function searchRegisteredUsers(
  rawQuery: string,
  excludePhone: string
): Promise<PeerDirectoryProfile[]> {
  const q = rawQuery.trim();
  if (!q) return [];

  const resultMap = new Map<string, PeerDirectoryProfile>();

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('uid, phone_normalized, full_name, about, avatar_url')
      .neq('phone_normalized', excludePhone)
      .or(`phone_normalized.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(20);

    if (!error && data) {
      for (const r of data) {
        resultMap.set(String(r.phone_normalized), {
          uid: String(r.uid),
          phoneNormalized: String(r.phone_normalized),
          fullName: String(r.full_name),
          about: String(r.about || 'Hey there! I am using ZOLO.'),
          avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
        });
      }
    }
  }

  // Also check local database
  try {
    const ldb = getLocalDb();
    const pattern = `%${q}%`;
    const rows = ldb.prepare(`
      SELECT uid, phone_normalized, full_name, about, avatar_url
      FROM local_users
      WHERE phone_normalized != ? AND (phone_normalized LIKE ? OR full_name LIKE ?)
      LIMIT 20
    `).all(excludePhone, pattern, pattern) as Array<Record<string, unknown>>;

    for (const r of rows) {
      if (!resultMap.has(String(r.phone_normalized))) {
        resultMap.set(String(r.phone_normalized), {
          uid: String(r.uid),
          phoneNormalized: String(r.phone_normalized),
          fullName: String(r.full_name),
          about: String(r.about || 'Hey there! I am using ZOLO.'),
          avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
        });
      }
    }
  } catch {
    // Non-fatal
  }

  return Array.from(resultMap.values());
}

export async function saveDirectMessage(params: {
  messageId: string;
  senderPhone: string;
  senderName: string;
  senderAvatar: string | null;
  recipientPhone: string;
  text: string;
  mediaType: DirectMessageDto['mediaType'];
  payload: MessageRichPayload;
  initialStatus: 'sent' | 'delivered' | 'read';
}): Promise<DirectMessageDto> {
  const conversationKey = makeConversationKey(params.senderPhone, params.recipientPhone);
  const payloadJson = JSON.stringify(params.payload || {});
  const nowIso = new Date().toISOString();

  // Save to local persistent DB first for 100% guarantee
  const localDto = saveLocalDm({
    messageId: params.messageId,
    conversationKey,
    senderPhone: params.senderPhone,
    senderName: params.senderName,
    senderAvatar: params.senderAvatar,
    recipientPhone: params.recipientPhone,
    text: params.text,
    mediaType: params.mediaType,
    payloadJson,
    status: params.initialStatus,
    createdAt: nowIso,
  });

  // Attempt to persist in Supabase as cloud source of truth
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('direct_messages')
      .insert({
        message_id: params.messageId,
        conversation_key: conversationKey,
        sender_phone: params.senderPhone,
        sender_name: params.senderName,
        sender_avatar: params.senderAvatar,
        recipient_phone: params.recipientPhone,
        text: params.text,
        media_type: params.mediaType,
        payload_json: payloadJson,
        status: params.initialStatus,
        deleted_for_everyone: false,
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .maybeSingle();

    if (!error && data) {
      return mapSupabaseDmToDto(data as SupabaseDirectMessageRow);
    } else if (error && !isSupabaseTableMissingError(error)) {
      console.warn('Supabase direct_messages insert notice:', error.message);
    }
  }

  return localDto;
}

export async function fetchUserDirectMessagesAndPeers(myPhone: string): Promise<{
  messages: DirectMessageDto[];
  peers: PeerDirectoryProfile[];
}> {
  const messageMap = new Map<string, DirectMessageDto>();

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .eq('deleted_for_everyone', false)
      .or(`sender_phone.eq.${myPhone},recipient_phone.eq.${myPhone}`)
      .order('created_at', { ascending: true })
      .limit(2000);

    if (!error && data) {
      for (const r of data as SupabaseDirectMessageRow[]) {
        const dto = mapSupabaseDmToDto(r);
        messageMap.set(dto.messageId, dto);
        // Sync to local cache
        saveLocalDm({
          messageId: dto.messageId,
          conversationKey: dto.conversationKey,
          senderPhone: dto.senderPhone,
          senderName: dto.senderName,
          senderAvatar: dto.senderAvatar,
          recipientPhone: dto.recipientPhone,
          text: dto.text,
          mediaType: dto.mediaType,
          payloadJson: JSON.stringify(dto.payload),
          status: dto.status,
          createdAt: dto.createdAt,
        });
      }
    }
  }

  // Merge with local persistent messages
  try {
    const ldb = getLocalDb();
    const localRows = ldb.prepare(`
      SELECT * FROM local_direct_messages
      WHERE deleted_for_everyone = 0 AND (sender_phone = ? OR recipient_phone = ?)
      ORDER BY created_at ASC
      LIMIT 2000
    `).all(myPhone, myPhone) as Array<Record<string, unknown>>;

    for (const r of localRows) {
      const dto = mapLocalDmToDto(r);
      if (!messageMap.has(dto.messageId)) {
        messageMap.set(dto.messageId, dto);
      }
    }
  } catch {
    // Non-fatal
  }

  const sortedMessages = Array.from(messageMap.values()).sort(
    (a, b) => a.timestampRaw - b.timestampRaw
  );

  const peerPhonesSet = new Set<string>();
  for (const m of sortedMessages) {
    if (m.senderPhone !== myPhone) peerPhonesSet.add(m.senderPhone);
    if (m.recipientPhone !== myPhone) peerPhonesSet.add(m.recipientPhone);
  }

  const peers = await lookupRegisteredUsersByPhones(Array.from(peerPhonesSet));
  return { messages: sortedMessages, peers };
}

export async function markUndeliveredMessagesDelivered(recipientPhone: string): Promise<
  Array<{ senderPhone: string; messageIds: string[] }>
> {
  const bySender = new Map<string, string[]>();
  const nowIso = new Date().toISOString();

  // 1. Supabase
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('direct_messages')
      .update({ status: 'delivered', updated_at: nowIso })
      .eq('recipient_phone', recipientPhone)
      .eq('status', 'sent')
      .eq('deleted_for_everyone', false)
      .select('message_id, sender_phone');

    if (!error && data) {
      for (const r of data) {
        const sender = String(r.sender_phone);
        const list = bySender.get(sender) || [];
        list.push(String(r.message_id));
        bySender.set(sender, list);
      }
    }
  }

  // 2. Local DB
  try {
    const ldb = getLocalDb();
    const rows = ldb.prepare(`
      SELECT message_id, sender_phone FROM local_direct_messages
      WHERE recipient_phone = ? AND status = 'sent' AND deleted_for_everyone = 0
    `).all(recipientPhone) as Array<{ message_id: string; sender_phone: string }>;

    if (rows.length > 0) {
      ldb.prepare(`
        UPDATE local_direct_messages SET status = 'delivered', updated_at = ?
        WHERE recipient_phone = ? AND status = 'sent' AND deleted_for_everyone = 0
      `).run(nowIso, recipientPhone);

      for (const r of rows) {
        const sender = r.sender_phone;
        const list = bySender.get(sender) || [];
        if (!list.includes(r.message_id)) list.push(r.message_id);
        bySender.set(sender, list);
      }
    }
  } catch {
    // Non-fatal
  }

  return Array.from(bySender.entries()).map(([senderPhone, messageIds]) => ({
    senderPhone,
    messageIds,
  }));
}

export async function markConversationReadInDb(
  myPhone: string,
  peerPhone: string
): Promise<string[]> {
  const updatedIds = new Set<string>();
  const nowIso = new Date().toISOString();

  // 1. Supabase
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('direct_messages')
      .update({ status: 'read', updated_at: nowIso })
      .eq('recipient_phone', myPhone)
      .eq('sender_phone', peerPhone)
      .neq('status', 'read')
      .eq('deleted_for_everyone', false)
      .select('message_id');

    if (!error && data) {
      for (const r of data) updatedIds.add(String(r.message_id));
    }
  }

  // 2. Local DB
  try {
    const ldb = getLocalDb();
    const rows = ldb.prepare(`
      SELECT message_id FROM local_direct_messages
      WHERE recipient_phone = ? AND sender_phone = ? AND status != 'read' AND deleted_for_everyone = 0
    `).all(myPhone, peerPhone) as Array<{ message_id: string }>;

    if (rows.length > 0) {
      ldb.prepare(`
        UPDATE local_direct_messages SET status = 'read', updated_at = ?
        WHERE recipient_phone = ? AND sender_phone = ? AND status != 'read' AND deleted_for_everyone = 0
      `).run(nowIso, myPhone, peerPhone);

      for (const r of rows) updatedIds.add(r.message_id);
    }
  } catch {
    // Non-fatal
  }

  return Array.from(updatedIds);
}

export async function toggleMessageReactionInDb(params: {
  messageId: string;
  actorPhone: string;
  actorName: string;
  emoji: string;
}): Promise<DirectMessageDto | null> {
  const ldb = getLocalDb();
  let dmRow: Record<string, unknown> | undefined;

  try {
    dmRow = ldb.prepare('SELECT * FROM local_direct_messages WHERE message_id = ? LIMIT 1').get(params.messageId) as Record<string, unknown> | undefined;
  } catch {
    // Non-fatal
  }

  const supabase = getSupabaseServerClient();
  if (!dmRow && supabase) {
    const { data } = await supabase.from('direct_messages').select('*').eq('message_id', params.messageId).maybeSingle();
    if (data) {
      dmRow = {
        message_id: data.message_id,
        conversation_key: data.conversation_key,
        sender_phone: data.sender_phone,
        sender_name: data.sender_name,
        sender_avatar: data.sender_avatar,
        recipient_phone: data.recipient_phone,
        text: data.text,
        media_type: data.media_type,
        payload_json: data.payload_json,
        status: data.status,
        created_at: data.created_at,
      };
    }
  }

  if (!dmRow) return null;

  const currentPayload = parseRichPayload(dmRow.payload_json as string | null);
  const reactions = [...(currentPayload.reactions || [])];
  const idx = reactions.findIndex((r) => r.emoji === params.emoji);
  const actorTag = `${params.actorName} (${params.actorPhone})`;

  if (idx >= 0) {
    const existing = reactions[idx];
    const hasActor = existing.users.includes(actorTag);
    const nextUsers = hasActor ? existing.users.filter((u) => u !== actorTag) : [...existing.users, actorTag];
    if (nextUsers.length === 0) {
      reactions.splice(idx, 1);
    } else {
      reactions[idx] = { emoji: params.emoji, count: nextUsers.length, users: nextUsers };
    }
  } else {
    reactions.push({ emoji: params.emoji, count: 1, users: [actorTag] });
  }

  const nextPayload = { ...currentPayload, reactions };
  const nextJson = JSON.stringify(nextPayload);
  const nowIso = new Date().toISOString();

  // Update local
  try {
    ldb.prepare('UPDATE local_direct_messages SET payload_json = ?, updated_at = ? WHERE message_id = ?')
      .run(nextJson, nowIso, params.messageId);
  } catch {}

  // Update Supabase
  if (supabase) {
    try {
      await supabase
        .from('direct_messages')
        .update({ payload_json: nextJson, updated_at: nowIso })
        .eq('message_id', params.messageId);
    } catch {}
  }

  const updatedLocal = ldb.prepare('SELECT * FROM local_direct_messages WHERE message_id = ?').get(params.messageId) as Record<string, unknown> | undefined;
  return updatedLocal ? mapLocalDmToDto(updatedLocal) : null;
}

export async function voteMessagePollInDb(params: {
  messageId: string;
  actorPhone: string;
  voterName: string;
  optionId: string;
}): Promise<DirectMessageDto | null> {
  const ldb = getLocalDb();
  let dmRow: Record<string, unknown> | undefined;

  try {
    dmRow = ldb.prepare('SELECT * FROM local_direct_messages WHERE message_id = ? LIMIT 1').get(params.messageId) as Record<string, unknown> | undefined;
  } catch {}

  const supabase = getSupabaseServerClient();
  if (!dmRow && supabase) {
    const { data } = await supabase.from('direct_messages').select('*').eq('message_id', params.messageId).maybeSingle();
    if (data) {
      dmRow = {
        message_id: data.message_id,
        conversation_key: data.conversation_key,
        sender_phone: data.sender_phone,
        sender_name: data.sender_name,
        sender_avatar: data.sender_avatar,
        recipient_phone: data.recipient_phone,
        text: data.text,
        media_type: data.media_type,
        payload_json: data.payload_json,
        status: data.status,
        created_at: data.created_at,
      };
    }
  }

  if (!dmRow) return null;

  const currentPayload = parseRichPayload(dmRow.payload_json as string | null);
  if (!currentPayload.poll) return null;

  const poll = currentPayload.poll;
  const voterLabel = `${params.voterName}`;

  const nextOptions = poll.options.map((opt) => {
    const alreadyVoted = opt.voterNames.includes(voterLabel);
    if (opt.id === params.optionId) {
      if (alreadyVoted) {
        const filtered = opt.voterNames.filter((n) => n !== voterLabel);
        return { ...opt, votes: filtered.length, voterNames: filtered };
      }
      const added = [...opt.voterNames, voterLabel];
      return { ...opt, votes: added.length, voterNames: added };
    }
    if (!poll.allowMultipleAnswers && alreadyVoted) {
      const filtered = opt.voterNames.filter((n) => n !== voterLabel);
      return { ...opt, votes: filtered.length, voterNames: filtered };
    }
    return opt;
  });

  const nextPayload = { ...currentPayload, poll: { ...poll, options: nextOptions } };
  const nextJson = JSON.stringify(nextPayload);
  const nowIso = new Date().toISOString();

  try {
    ldb.prepare('UPDATE local_direct_messages SET payload_json = ?, updated_at = ? WHERE message_id = ?')
      .run(nextJson, nowIso, params.messageId);
  } catch {}

  if (supabase) {
    try {
      await supabase
        .from('direct_messages')
        .update({ payload_json: nextJson, updated_at: nowIso })
        .eq('message_id', params.messageId);
    } catch {}
  }

  const updatedLocal = ldb.prepare('SELECT * FROM local_direct_messages WHERE message_id = ?').get(params.messageId) as Record<string, unknown> | undefined;
  return updatedLocal ? mapLocalDmToDto(updatedLocal) : null;
}

export async function deleteDirectMessageInDb(
  messageId: string,
  actorPhone: string
): Promise<{ messageId: string; senderPhone: string; recipientPhone: string } | null> {
  const ldb = getLocalDb();
  let dmRow = ldb.prepare('SELECT * FROM local_direct_messages WHERE message_id = ? LIMIT 1').get(messageId) as Record<string, unknown> | undefined;

  const supabase = getSupabaseServerClient();
  if (!dmRow && supabase) {
    const { data } = await supabase.from('direct_messages').select('*').eq('message_id', messageId).maybeSingle();
    if (data) dmRow = data as Record<string, unknown>;
  }

  if (!dmRow) return null;

  const senderPhone = String(dmRow.sender_phone);
  const recipientPhone = String(dmRow.recipient_phone);
  if (senderPhone !== actorPhone && recipientPhone !== actorPhone) {
    return null;
  }

  const nowIso = new Date().toISOString();
  try {
    ldb.prepare('UPDATE local_direct_messages SET deleted_for_everyone = 1, updated_at = ? WHERE message_id = ?')
      .run(nowIso, messageId);
  } catch {}

  if (supabase) {
    try {
      await supabase
        .from('direct_messages')
        .update({ deleted_for_everyone: true, updated_at: nowIso })
        .eq('message_id', messageId);
    } catch {}
  }

  return { messageId, senderPhone, recipientPhone };
}
