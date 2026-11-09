import crypto from 'node:crypto';
import { getLocalDb } from './localDatabase.ts';
import { getSupabaseServerClient, isSupabaseTableMissingError } from '../lib/supabaseServer.ts';
import type { DirectMessageDto, MessageRichPayload } from './messagingRepository.ts';
import type { GroupConversationWireDto, GroupMessageWireDto } from '../types/auth.ts';

export interface GroupInboxDto {
  groups: GroupConversationWireDto[];
  messages: GroupMessageWireDto[];
}

function parsePayload(raw: unknown): MessageRichPayload {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as MessageRichPayload) : {};
  } catch {
    return {};
  }
}

function mapGroup(row: Record<string, unknown>, memberPhones: string[]): GroupConversationWireDto {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    description: String(row.description || ''),
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    createdBy: String(row.created_by || ''),
    createdAt: new Date(String(row.created_at)).toISOString(),
    memberPhones,
  };
}

function mapGroupMessage(row: Record<string, unknown>): GroupMessageWireDto {
  const createdAt = new Date(String(row.created_at));
  return {
    messageId: String(row.id),
    conversationId: String(row.conversation_id),
    senderPhone: String(row.sender_phone),
    senderName: String(row.sender_name || ''),
    senderAvatar: typeof row.sender_avatar === 'string' ? row.sender_avatar : null,
    text: String(row.text || ''),
    mediaType: (String(row.media_type || 'text') as DirectMessageDto['mediaType']),
    payload: parsePayload(row.payload_json),
    status: (String(row.status || 'sent') as DirectMessageDto['status']),
    createdAt: createdAt.toISOString(),
    timestampRaw: createdAt.getTime(),
  };
}

function throwStorageError(operation: string, error: { message: string; code?: string }): never {
  if (isSupabaseTableMissingError(error)) {
    throw new Error(`Group chat storage is not initialized. Apply the database schema before ${operation}.`);
  }
  throw new Error(`Could not ${operation}: ${error.message}`);
}

export async function createGroupInDb(params: {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string | null;
  createdBy: string;
  memberPhones: string[];
}): Promise<GroupConversationWireDto> {
  const memberPhones = Array.from(new Set([params.createdBy, ...params.memberPhones]));
  const now = new Date().toISOString();
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const conversation = await supabase
      .from('conversations')
      .insert({
        id: params.id,
        type: 'group',
        name: params.name,
        description: params.description || '',
        avatar_url: params.avatarUrl || null,
        created_by: params.createdBy,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();
    if (conversation.error) throwStorageError('create the group', conversation.error);

    const memberships = await supabase.from('conversation_members').insert(
      memberPhones.map((userPhone) => ({
        conversation_id: params.id,
        user_phone: userPhone,
        role: userPhone === params.createdBy ? 'owner' : 'member',
        joined_at: now,
      }))
    );
    if (memberships.error) {
      const cleanup = await supabase.from('conversations').delete().eq('id', params.id);
      if (cleanup.error) {
        console.error('Failed to roll back incomplete group creation:', cleanup.error.message);
      }
      throwStorageError('add group members', memberships.error);
    }

    return mapGroup(conversation.data as Record<string, unknown>, memberPhones);
  }

  const db = getLocalDb();
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO local_conversations (id, type, name, description, avatar_url, created_by, created_at, updated_at)
      VALUES (?, 'group', ?, ?, ?, ?, ?, ?)
    `).run(params.id, params.name, params.description || '', params.avatarUrl || null, params.createdBy, now, now);
    const insertMember = db.prepare(`
      INSERT INTO local_conversation_members (conversation_id, user_phone, role, joined_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const phone of memberPhones) {
      insertMember.run(params.id, phone, phone === params.createdBy ? 'owner' : 'member', now);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return {
    id: params.id,
    name: params.name,
    description: params.description || '',
    avatarUrl: params.avatarUrl || null,
    createdBy: params.createdBy,
    createdAt: now,
    memberPhones,
  };
}

export async function fetchGroupInboxForUser(userPhone: string): Promise<GroupInboxDto> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const membershipRes = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_phone', userPhone);
    if (membershipRes.error) throwStorageError('load group memberships', membershipRes.error);

    const ids = Array.from(new Set((membershipRes.data || []).map((r) => String(r.conversation_id))));
    if (ids.length === 0) return { groups: [], messages: [] };

    const [groupsRes, membersRes, messagesRes] = await Promise.all([
      supabase.from('conversations').select('*').in('id', ids).eq('type', 'group'),
      supabase.from('conversation_members').select('conversation_id, user_phone').in('conversation_id', ids),
      supabase.from('messages').select('*').in('conversation_id', ids).eq('deleted_for_everyone', false).order('created_at', { ascending: true }).limit(2000),
    ]);
    if (groupsRes.error) throwStorageError('load groups', groupsRes.error);
    if (membersRes.error) throwStorageError('load group members', membersRes.error);
    if (messagesRes.error) throwStorageError('load group messages', messagesRes.error);

    const memberMap = new Map<string, string[]>();
    for (const row of membersRes.data || []) {
      const groupId = String(row.conversation_id);
      const list = memberMap.get(groupId) || [];
      list.push(String(row.user_phone));
      memberMap.set(groupId, list);
    }
    return {
      groups: (groupsRes.data || []).map((row) =>
        mapGroup(row as Record<string, unknown>, memberMap.get(String(row.id)) || [])
      ),
      messages: (messagesRes.data || []).map((row) => mapGroupMessage(row as Record<string, unknown>)),
    };
  }

  const db = getLocalDb();
  const groups = db.prepare(`
    SELECT c.*, m.user_phone
    FROM local_conversations c
    JOIN local_conversation_members m ON m.conversation_id = c.id
    WHERE c.type = 'group' AND EXISTS (
      SELECT 1 FROM local_conversation_members mine
      WHERE mine.conversation_id = c.id AND mine.user_phone = ?
    )
    ORDER BY c.created_at DESC
  `).all(userPhone) as Array<Record<string, unknown>>;
  const membersByGroup = new Map<string, string[]>();
  const groupRows = new Map<string, Record<string, unknown>>();
  for (const row of groups) {
    const id = String(row.id);
    groupRows.set(id, row);
    const list = membersByGroup.get(id) || [];
    list.push(String(row.user_phone));
    membersByGroup.set(id, list);
  }
  const ids = Array.from(groupRows.keys());
  if (ids.length === 0) return { groups: [], messages: [] };
  const placeholders = ids.map(() => '?').join(',');
  const messages = db.prepare(`
    SELECT * FROM local_group_messages
    WHERE conversation_id IN (${placeholders})
    ORDER BY created_at ASC LIMIT 2000
  `).all(...ids) as Array<Record<string, unknown>>;
  return {
    groups: Array.from(groupRows, ([id, row]) => mapGroup(row, membersByGroup.get(id) || [])),
    messages: messages.map(mapGroupMessage),
  };
}

export async function isGroupMember(groupId: string, userPhone: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('conversation_members')
      .select('id')
      .eq('conversation_id', groupId)
      .eq('user_phone', userPhone)
      .maybeSingle();
    if (error) throwStorageError('check group access', error);
    return Boolean(data);
  }
  return Boolean(getLocalDb().prepare(`
    SELECT 1 FROM local_conversation_members WHERE conversation_id = ? AND user_phone = ?
  `).get(groupId, userPhone));
}

export async function saveGroupMessage(params: {
  groupId: string;
  senderPhone: string;
  senderName: string;
  senderAvatar: string | null;
  text: string;
  mediaType: DirectMessageDto['mediaType'];
  payload: MessageRichPayload;
}): Promise<GroupMessageWireDto> {
  const messageId = `gm_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  const createdAt = new Date().toISOString();
  const payloadJson = JSON.stringify(params.payload || {});
  const supabase = getSupabaseServerClient();

  if (supabase) {
    const { data, error } = await supabase.from('messages').insert({
      id: messageId,
      conversation_id: params.groupId,
      sender_phone: params.senderPhone,
      sender_name: params.senderName,
      sender_avatar: params.senderAvatar,
      text: params.text,
      media_type: params.mediaType,
      payload_json: payloadJson,
      status: 'sent',
      deleted_for_everyone: false,
      created_at: createdAt,
      updated_at: createdAt,
    }).select('*').single();
    if (error) throwStorageError('save the group message', error);
    return mapGroupMessage(data as Record<string, unknown>);
  }

  const db = getLocalDb();
  db.prepare(`
    INSERT INTO local_group_messages (
      id, conversation_id, sender_phone, sender_name, sender_avatar, text, media_type, payload_json, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)
  `).run(messageId, params.groupId, params.senderPhone, params.senderName, params.senderAvatar, params.text, params.mediaType, payloadJson, createdAt);
  return mapGroupMessage({
    id: messageId,
    conversation_id: params.groupId,
    sender_phone: params.senderPhone,
    sender_name: params.senderName,
    sender_avatar: params.senderAvatar,
    text: params.text,
    media_type: params.mediaType,
    payload_json: payloadJson,
    status: 'sent',
    created_at: createdAt,
  });
}
