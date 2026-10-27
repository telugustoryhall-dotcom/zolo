import { and, asc, eq, ilike, inArray, ne, or } from 'drizzle-orm';
import { db } from './index.ts';
import { directMessages, users, type DbDirectMessage } from './schema.ts';
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
  deletedForEveryone?: boolean;
}

export interface DirectMessageDto {
  messageId: string;
  conversationKey: string;
  senderPhone: string;
  senderName: string;
  senderAvatar: string | null;
  recipientPhone: string;
  text: string;
  mediaType: 'text' | 'image' | 'audio' | 'document' | 'location' | 'poll';
  payload: MessageRichPayload;
  status: 'sent' | 'delivered' | 'read';
  deletedForEveryone?: boolean;
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

export function makeConversationKey(phoneA: string, phoneB: string): string {
  return [phoneA.trim(), phoneB.trim()].sort().join('::');
}

export const inMemoryFallbackMessages = new Map<string, DirectMessageDto>();

function parseRichPayload(raw: string | null): MessageRichPayload {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as MessageRichPayload) : {};
  } catch {
    return {};
  }
}

export function toDirectMessageDto(row: DbDirectMessage): DirectMessageDto {
  const createdMs = row.createdAt instanceof Date ? row.createdAt.getTime() : Date.now();
  return {
    messageId: row.messageId,
    conversationKey: row.conversationKey,
    senderPhone: row.senderPhone,
    senderName: row.senderName,
    senderAvatar: row.senderAvatar ?? null,
    recipientPhone: row.recipientPhone,
    text: row.text,
    mediaType: (row.mediaType as DirectMessageDto['mediaType']) || 'text',
    payload: parseRichPayload(row.payloadJson),
    status: (row.status as DirectMessageDto['status']) || 'sent',
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : new Date(createdMs).toISOString(),
    timestampRaw: createdMs,
  };
}

function mapSupabaseDmRow(row: SupabaseDirectMessageRow): DbDirectMessage {
  return {
    id: row.id,
    messageId: row.message_id,
    conversationKey: row.conversation_key,
    senderPhone: row.sender_phone,
    senderName: row.sender_name,
    senderAvatar: row.sender_avatar ?? null,
    recipientPhone: row.recipient_phone,
    text: row.text,
    mediaType: row.media_type || 'text',
    payloadJson: row.payload_json ?? null,
    status: row.status || 'sent',
    deletedForEveryone: Boolean(row.deleted_for_everyone),
    createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
  };
}

export async function lookupRegisteredUsersByPhones(
  phonesNormalized: string[]
): Promise<PeerDirectoryProfile[]> {
  const uniquePhones = Array.from(new Set(phonesNormalized.map((p) => p.trim()).filter(Boolean)));
  if (uniquePhones.length === 0) return [];

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('uid, phone_normalized, full_name, about, avatar_url')
      .in('phone_normalized', uniquePhones);

    if (!error && data && (data.length > 0 || !hasPgPoolCredentials())) {
      return data.map((r) => ({
        uid: String(r.uid),
        phoneNormalized: String(r.phone_normalized),
        fullName: String(r.full_name),
        about: String(r.about || 'Hey there! I am using ZOLO.'),
        avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
      }));
    }
  }

  if (!hasPgPoolCredentials()) return [];

  try {
    const rows = await db
      .select({
        uid: users.uid,
        phoneNormalized: users.phoneNormalized,
        fullName: users.fullName,
        about: users.about,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(inArray(users.phoneNormalized, uniquePhones));

    return rows.map((r) => ({
      uid: r.uid,
      phoneNormalized: r.phoneNormalized,
      fullName: r.fullName,
      about: r.about,
      avatarUrl: r.avatarUrl ?? null,
    }));
  } catch (error) {
    console.error('lookupRegisteredUsersByPhones failed:', error);
    throw new Error('Failed to look up ZOLO contacts.', { cause: error });
  }
}

export async function searchRegisteredUsers(
  rawQuery: string,
  excludePhone: string
): Promise<PeerDirectoryProfile[]> {
  const q = rawQuery.trim();
  if (!q) return [];

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('users')
      .select('uid, phone_normalized, full_name, about, avatar_url')
      .neq('phone_normalized', excludePhone)
      .or(`phone_normalized.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(15);

    if (!error && data && (data.length > 0 || !hasPgPoolCredentials())) {
      return data.map((r) => ({
        uid: String(r.uid),
        phoneNormalized: String(r.phone_normalized),
        fullName: String(r.full_name),
        about: String(r.about || 'Hey there! I am using ZOLO.'),
        avatarUrl: r.avatar_url ? String(r.avatar_url) : null,
      }));
    }
  }

  if (!hasPgPoolCredentials()) return [];

  try {
    const pattern = `%${q}%`;
    const rows = await db
      .select({
        uid: users.uid,
        phoneNormalized: users.phoneNormalized,
        fullName: users.fullName,
        about: users.about,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(
        and(
          ne(users.phoneNormalized, excludePhone),
          or(ilike(users.phoneNormalized, pattern), ilike(users.fullName, pattern))
        )
      )
      .limit(15);

    return rows.map((r) => ({
      uid: r.uid,
      phoneNormalized: r.phoneNormalized,
      fullName: r.fullName,
      about: r.about,
      avatarUrl: r.avatarUrl ?? null,
    }));
  } catch (error) {
    console.error('searchRegisteredUsers failed:', error);
    throw new Error('Failed to search ZOLO users.', { cause: error });
  }
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
  const now = new Date();

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const existing = await supabase
      .from('direct_messages')
      .select('*')
      .eq('message_id', params.messageId)
      .maybeSingle();

    if (!existing.error && existing.data) {
      return toDirectMessageDto(mapSupabaseDmRow(existing.data as SupabaseDirectMessageRow));
    }

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
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select('*')
      .single();

    if (!error && data) {
      const savedDto = toDirectMessageDto(mapSupabaseDmRow(data as SupabaseDirectMessageRow));
      if (hasPgPoolCredentials()) {
        db.insert(directMessages)
          .values({
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
            deletedForEveryone: false,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing({ target: directMessages.messageId })
          .catch(() => {});
      }
      return savedDto;
    } else if (error && !isSupabaseTableMissingError(error) && !hasPgPoolCredentials()) {
      throw new Error('Failed to send message via Supabase.', { cause: error });
    }
  }

  if (!hasPgPoolCredentials()) {
    const fallbackDto: DirectMessageDto = {
      messageId: params.messageId,
      conversationKey,
      senderPhone: params.senderPhone,
      senderName: params.senderName,
      senderAvatar: params.senderAvatar,
      recipientPhone: params.recipientPhone,
      text: params.text,
      mediaType: params.mediaType,
      payload: params.payload || {},
      status: params.initialStatus,
      createdAt: now.toISOString(),
      timestampRaw: now.getTime(),
    };
    inMemoryFallbackMessages.set(params.messageId, fallbackDto);
    return fallbackDto;
  }

  try {
    const inserted = await db
      .insert(directMessages)
      .values({
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
        deletedForEveryone: false,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: directMessages.messageId })
      .returning();

    if (inserted.length > 0) {
      return toDirectMessageDto(inserted[0]);
    }

    const existingRows = await db
      .select()
      .from(directMessages)
      .where(eq(directMessages.messageId, params.messageId))
      .limit(1);

    return toDirectMessageDto(existingRows[0]);
  } catch (error) {
    console.error('saveDirectMessage failed:', error);
    throw new Error('Failed to store message.', { cause: error });
  }
}

export async function fetchUserDirectMessagesAndPeers(myPhone: string): Promise<{
  messages: DirectMessageDto[];
  peers: PeerDirectoryProfile[];
}> {
  let messageDtos: DirectMessageDto[] | null = null;

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('direct_messages')
      .select('*')
      .eq('deleted_for_everyone', false)
      .or(`sender_phone.eq.${myPhone},recipient_phone.eq.${myPhone}`)
      .order('created_at', { ascending: true })
      .limit(2000);

    if (!error && data && (data.length > 0 || !hasPgPoolCredentials())) {
      messageDtos = (data as SupabaseDirectMessageRow[]).map((r) =>
        toDirectMessageDto(mapSupabaseDmRow(r))
      );
    }
  }

  if (messageDtos === null) {
    if (!hasPgPoolCredentials()) {
      messageDtos = Array.from(inMemoryFallbackMessages.values())
        .filter(
          (m) =>
            (m.senderPhone === myPhone || m.recipientPhone === myPhone) &&
            !m.payload?.deletedForEveryone
        )
        .sort((a, b) => a.timestampRaw - b.timestampRaw);
    } else {
      try {
        const rows = await db
          .select()
          .from(directMessages)
          .where(
            and(
              eq(directMessages.deletedForEveryone, false),
              or(
                eq(directMessages.senderPhone, myPhone),
                eq(directMessages.recipientPhone, myPhone)
              )
            )
          )
          .orderBy(asc(directMessages.createdAt))
          .limit(2000);

        messageDtos = rows.map(toDirectMessageDto);
      } catch (error) {
        console.error('fetchUserDirectMessagesAndPeers failed:', error);
        throw new Error('Failed to load conversations.', { cause: error });
      }
    }
  }

  const peerPhonesSet = new Set<string>();
  for (const m of messageDtos) {
    if (m.senderPhone !== myPhone) peerPhonesSet.add(m.senderPhone);
    if (m.recipientPhone !== myPhone) peerPhonesSet.add(m.recipientPhone);
  }

  const peers = await lookupRegisteredUsersByPhones(Array.from(peerPhonesSet));
  return { messages: messageDtos, peers };
}

export async function markUndeliveredMessagesDelivered(recipientPhone: string): Promise<
  Array<{ senderPhone: string; messageIds: string[] }>
> {
  const bySender = new Map<string, string[]>();

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('direct_messages')
      .update({ status: 'delivered', updated_at: new Date().toISOString() })
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
      if (!hasPgPoolCredentials()) {
        return Array.from(bySender.entries()).map(([senderPhone, messageIds]) => ({
          senderPhone,
          messageIds,
        }));
      }
    }
  }

  if (!hasPgPoolCredentials()) {
    return Array.from(bySender.entries()).map(([senderPhone, messageIds]) => ({
      senderPhone,
      messageIds,
    }));
  }

  try {
    const updated = await db
      .update(directMessages)
      .set({ status: 'delivered', updatedAt: new Date() })
      .where(
        and(
          eq(directMessages.recipientPhone, recipientPhone),
          eq(directMessages.status, 'sent'),
          eq(directMessages.deletedForEveryone, false)
        )
      )
      .returning({
        messageId: directMessages.messageId,
        senderPhone: directMessages.senderPhone,
      });

    for (const r of updated) {
      const list = bySender.get(r.senderPhone) || [];
      if (!list.includes(r.messageId)) list.push(r.messageId);
      bySender.set(r.senderPhone, list);
    }

    return Array.from(bySender.entries()).map(([senderPhone, messageIds]) => ({
      senderPhone,
      messageIds,
    }));
  } catch (error) {
    console.error('markUndeliveredMessagesDelivered failed:', error);
    return [];
  }
}

export async function markConversationReadInDb(
  myPhone: string,
  peerPhone: string
): Promise<string[]> {
  const updatedIds = new Set<string>();

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('direct_messages')
      .update({ status: 'read', updated_at: new Date().toISOString() })
      .eq('recipient_phone', myPhone)
      .eq('sender_phone', peerPhone)
      .neq('status', 'read')
      .eq('deleted_for_everyone', false)
      .select('message_id');

    if (!error && data) {
      for (const r of data) updatedIds.add(String(r.message_id));
      if (!hasPgPoolCredentials()) return Array.from(updatedIds);
    }
  }

  if (!hasPgPoolCredentials()) return Array.from(updatedIds);

  try {
    const rows = await db
      .update(directMessages)
      .set({ status: 'read', updatedAt: new Date() })
      .where(
        and(
          eq(directMessages.recipientPhone, myPhone),
          eq(directMessages.senderPhone, peerPhone),
          ne(directMessages.status, 'read'),
          eq(directMessages.deletedForEveryone, false)
        )
      )
      .returning({ messageId: directMessages.messageId });

    for (const r of rows) updatedIds.add(r.messageId);
    return Array.from(updatedIds);
  } catch (error) {
    console.error('markConversationReadInDb failed:', error);
    return [];
  }
}

async function mutateDirectMessagePayload(
  messageId: string,
  actorPhone: string,
  mutator: (current: MessageRichPayload) => MessageRichPayload
): Promise<DirectMessageDto | null> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: existing, error: fetchErr } = await supabase
      .from('direct_messages')
      .select('*')
      .eq('message_id', messageId)
      .maybeSingle();

    if (!fetchErr && existing) {
      const dm = mapSupabaseDmRow(existing as SupabaseDirectMessageRow);
      if (dm.senderPhone !== actorPhone && dm.recipientPhone !== actorPhone) {
        return null;
      }
      const nextPayload = mutator(parseRichPayload(dm.payloadJson));
      const nextJson = JSON.stringify(nextPayload);

      const { data: updated, error: updErr } = await supabase
        .from('direct_messages')
        .update({ payload_json: nextJson, updated_at: new Date().toISOString() })
        .eq('message_id', messageId)
        .select('*')
        .single();

      if (!updErr && updated) {
        if (hasPgPoolCredentials()) {
          db.update(directMessages)
            .set({ payloadJson: nextJson, updatedAt: new Date() })
            .where(eq(directMessages.messageId, messageId))
            .catch(() => {});
        }
        return toDirectMessageDto(mapSupabaseDmRow(updated as SupabaseDirectMessageRow));
      }
    }
  }

  if (!hasPgPoolCredentials()) return null;

  try {
    return await db.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(directMessages)
        .where(eq(directMessages.messageId, messageId))
        .limit(1);

      const dm = rows[0];
      if (!dm) return null;
      if (dm.senderPhone !== actorPhone && dm.recipientPhone !== actorPhone) {
        return null;
      }

      const nextPayload = mutator(parseRichPayload(dm.payloadJson));
      const nextJson = JSON.stringify(nextPayload);

      const updated = await tx
        .update(directMessages)
        .set({ payloadJson: nextJson, updatedAt: new Date() })
        .where(eq(directMessages.id, dm.id))
        .returning();

      return updated[0] ? toDirectMessageDto(updated[0]) : null;
    });
  } catch (error) {
    console.error('mutateDirectMessagePayload failed:', error);
    throw new Error('Failed to update message.', { cause: error });
  }
}

export async function toggleMessageReactionInDb(params: {
  messageId: string;
  actorPhone: string;
  actorName: string;
  emoji: string;
}): Promise<DirectMessageDto | null> {
  return mutateDirectMessagePayload(params.messageId, params.actorPhone, (current) => {
    const reactions = [...(current.reactions || [])];
    const idx = reactions.findIndex((r) => r.emoji === params.emoji);
    const actorTag = `${params.actorName} (${params.actorPhone})`;

    if (idx >= 0) {
      const existing = reactions[idx];
      const hasActor = existing.users.includes(actorTag);
      const nextUsers = hasActor
        ? existing.users.filter((u) => u !== actorTag)
        : [...existing.users, actorTag];

      if (nextUsers.length === 0) {
        reactions.splice(idx, 1);
      } else {
        reactions[idx] = {
          emoji: params.emoji,
          count: nextUsers.length,
          users: nextUsers,
        };
      }
    } else {
      reactions.push({
        emoji: params.emoji,
        count: 1,
        users: [actorTag],
      });
    }

    return { ...current, reactions };
  });
}

export async function voteMessagePollInDb(params: {
  messageId: string;
  actorPhone: string;
  voterName: string;
  optionId: string;
}): Promise<DirectMessageDto | null> {
  return mutateDirectMessagePayload(params.messageId, params.actorPhone, (current) => {
    if (!current.poll) return current;
    const poll = current.poll;
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

    return {
      ...current,
      poll: {
        ...poll,
        options: nextOptions,
      },
    };
  });
}

export async function deleteDirectMessageInDb(
  messageId: string,
  actorPhone: string
): Promise<{ messageId: string; senderPhone: string; recipientPhone: string } | null> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: existing, error: fetchErr } = await supabase
      .from('direct_messages')
      .select('message_id, sender_phone, recipient_phone')
      .eq('message_id', messageId)
      .maybeSingle();

    if (!fetchErr && existing) {
      if (
        existing.sender_phone !== actorPhone &&
        existing.recipient_phone !== actorPhone
      ) {
        return null;
      }
      await supabase
        .from('direct_messages')
        .update({ deleted_for_everyone: true, updated_at: new Date().toISOString() })
        .eq('message_id', messageId);

      if (!hasPgPoolCredentials()) {
        return {
          messageId: String(existing.message_id),
          senderPhone: String(existing.sender_phone),
          recipientPhone: String(existing.recipient_phone),
        };
      }
    }
  }

  if (!hasPgPoolCredentials()) return null;

  try {
    const rows = await db
      .select()
      .from(directMessages)
      .where(eq(directMessages.messageId, messageId))
      .limit(1);

    const dm = rows[0];
    if (!dm) return null;
    if (dm.senderPhone !== actorPhone && dm.recipientPhone !== actorPhone) {
      return null;
    }

    await db
      .update(directMessages)
      .set({ deletedForEveryone: true, updatedAt: new Date() })
      .where(eq(directMessages.id, dm.id));

    return {
      messageId: dm.messageId,
      senderPhone: dm.senderPhone,
      recipientPhone: dm.recipientPhone,
    };
  } catch (error) {
    console.error('deleteDirectMessageInDb failed:', error);
    throw new Error('Failed to delete message.', { cause: error });
  }
}
