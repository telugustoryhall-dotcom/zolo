import crypto from 'node:crypto';
import { getLocalDb } from './localDatabase.ts';
import { getSupabaseServerClient, isSupabaseTableMissingError } from '../lib/supabaseServer.ts';
import type {
  CommunityAnnouncement,
  CommunityDetail,
  CommunityDirectory,
  CommunityGroup,
  CommunityJoinRequest,
  CommunityInvitePreview,
  CommunityRole,
  CommunitySummary,
} from '../types/communities.ts';
import type { GroupConversationWireDto } from '../types/auth.ts';

type Row = Record<string, unknown>;

const COMMUNITY_ROLES = new Set<CommunityRole>(['owner', 'admin', 'moderator', 'member']);

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((row): row is Row => Boolean(row) && typeof row === 'object') : [];
}

function field(row: Row, key: string, fallback = ''): string {
  const value = row[key];
  return typeof value === 'string' ? value : value == null ? fallback : String(value);
}

function asRole(value: unknown): CommunityRole | null {
  return typeof value === 'string' && COMMUNITY_ROLES.has(value as CommunityRole)
    ? value as CommunityRole
    : null;
}

function isoDate(value: unknown): string {
  const date = new Date(String(value || ''));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function mapSummary(
  row: Row,
  role: CommunityRole | null,
  memberCount: number,
  groupCount: number
): CommunitySummary {
  return {
    id: field(row, 'id'),
    name: field(row, 'name'),
    description: field(row, 'description'),
    imageUrl: typeof row.image_url === 'string' ? row.image_url : null,
    category: field(row, 'category', 'General'),
    privacy: field(row, 'privacy', 'public') === 'private' ? 'private' : 'public',
    createdBy: field(row, 'created_by'),
    createdAt: isoDate(row.created_at),
    memberCount,
    groupCount,
    currentRole: role,
  };
}

function mapGroup(
  row: Row,
  memberPhones: string[]
): CommunityGroup {
  const conversation: GroupConversationWireDto = {
    id: field(row, 'id'),
    name: field(row, 'name'),
    description: field(row, 'description'),
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    createdBy: field(row, 'created_by'),
    createdAt: isoDate(row.created_at),
    memberPhones,
  };
  return { conversation, createdAt: conversation.createdAt };
}

function mapAnnouncement(row: Row): CommunityAnnouncement {
  return {
    id: field(row, 'id'),
    authorPhone: field(row, 'author_phone'),
    authorName: field(row, 'author_name'),
    body: field(row, 'body'),
    pinned: Boolean(row.pinned),
    createdAt: isoDate(row.created_at),
  };
}

function throwStorageError(operation: string, error: { message: string; code?: string }): never {
  if (isSupabaseTableMissingError(error)) {
    throw new Error(`Community storage is not initialized. Apply the Communities section of supabase_schema.sql before ${operation}.`);
  }
  throw new Error(`Could not ${operation}: ${error.message}`);
}

async function getMembershipRole(communityId: string, phone: string): Promise<CommunityRole | null> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('community_members')
      .select('role')
      .eq('community_id', communityId)
      .eq('member_phone', phone)
      .maybeSingle();
    if (error) throwStorageError('check community permissions', error);
    return asRole(data?.role);
  }
  const row = getLocalDb().prepare(`
    SELECT role FROM local_community_members WHERE community_id = ? AND member_phone = ?
  `).get(communityId, phone) as Row | undefined;
  return row ? asRole(row.role) : null;
}

function requireManager(role: CommunityRole | null): void {
  if (!role || !['owner', 'admin', 'moderator'].includes(role)) {
    throw new Error('You do not have permission to manage this community.');
  }
}

async function syncGroupMemberships(communityId: string, phone: string): Promise<void> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: groups, error: groupError } = await supabase
      .from('community_groups')
      .select('conversation_id')
      .eq('community_id', communityId);
    if (groupError) throwStorageError('load community groups', groupError);
    const conversationIds = asRows(groups).map((row) => field(row, 'conversation_id')).filter(Boolean);
    if (conversationIds.length === 0) return;
    const { error } = await supabase.from('conversation_members').upsert(
      conversationIds.map((conversationId) => ({
        conversation_id: conversationId,
        user_phone: phone,
        role: 'member',
        joined_at: new Date().toISOString(),
      })),
      { onConflict: 'conversation_id,user_phone', ignoreDuplicates: true }
    );
    if (error) throw new Error(`Could not add you to community chats: ${error.message}`);
    return;
  }

  const db = getLocalDb();
  const conversations = db.prepare(`
    SELECT conversation_id FROM local_community_groups WHERE community_id = ?
  `).all(communityId) as Row[];
  const addMember = db.prepare(`
    INSERT OR IGNORE INTO local_conversation_members (conversation_id, user_phone, role, joined_at)
    VALUES (?, ?, 'member', ?)
  `);
  const joinedAt = new Date().toISOString();
  for (const row of conversations) addMember.run(field(row, 'conversation_id'), phone, joinedAt);
}

export async function listCommunitiesForUser(phone: string): Promise<CommunityDirectory> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const [membershipsResult, publicResult] = await Promise.all([
      supabase.from('community_members').select('community_id,role').eq('member_phone', phone),
      supabase.from('communities').select('*').eq('privacy', 'public').order('created_at', { ascending: false }).limit(100),
    ]);
    if (membershipsResult.error) throwStorageError('load community memberships', membershipsResult.error);
    if (publicResult.error) throwStorageError('discover communities', publicResult.error);

    const memberships = new Map(
      asRows(membershipsResult.data).map((row) => [field(row, 'community_id'), asRole(row.role)])
    );
    const ids = Array.from(new Set([
      ...memberships.keys(),
      ...asRows(publicResult.data).map((row) => field(row, 'id')),
    ]));
    if (ids.length === 0) return { mine: [], discover: [] };

    const [communitiesResult, memberRowsResult, groupRowsResult] = await Promise.all([
      supabase.from('communities').select('*').in('id', ids),
      supabase.from('community_members').select('community_id').in('community_id', ids),
      supabase.from('community_groups').select('community_id').in('community_id', ids),
    ]);
    if (communitiesResult.error) throwStorageError('load community details', communitiesResult.error);
    if (memberRowsResult.error) throwStorageError('count community members', memberRowsResult.error);
    if (groupRowsResult.error) throwStorageError('count community groups', groupRowsResult.error);

    const memberCounts = new Map<string, number>();
    for (const row of asRows(memberRowsResult.data)) {
      const id = field(row, 'community_id');
      memberCounts.set(id, (memberCounts.get(id) || 0) + 1);
    }
    const groupCounts = new Map<string, number>();
    for (const row of asRows(groupRowsResult.data)) {
      const id = field(row, 'community_id');
      groupCounts.set(id, (groupCounts.get(id) || 0) + 1);
    }
    const communities = asRows(communitiesResult.data)
      .map((row) => mapSummary(
        row,
        memberships.get(field(row, 'id')) || null,
        memberCounts.get(field(row, 'id')) || 0,
        groupCounts.get(field(row, 'id')) || 0
      ))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      mine: communities.filter((community) => community.currentRole !== null),
      discover: communities.filter((community) => community.privacy === 'public' && community.currentRole === null),
    };
  }

  const rows = getLocalDb().prepare(`
    SELECT c.*,
      (SELECT COUNT(*) FROM local_community_members cm WHERE cm.community_id = c.id) AS member_count,
      (SELECT COUNT(*) FROM local_community_groups cg WHERE cg.community_id = c.id) AS group_count,
      (SELECT cm.role FROM local_community_members cm
       WHERE cm.community_id = c.id AND cm.member_phone = ?) AS current_role
    FROM local_communities c
    WHERE c.privacy = 'public' OR EXISTS (
      SELECT 1 FROM local_community_members cm
      WHERE cm.community_id = c.id AND cm.member_phone = ?
    )
    ORDER BY c.created_at DESC LIMIT 200
  `).all(phone, phone) as Row[];
  const communities = rows.map((row) => mapSummary(
    row,
    asRole(row.current_role),
    Number(row.member_count) || 0,
    Number(row.group_count) || 0
  ));
  return {
    mine: communities.filter((community) => community.currentRole !== null),
    discover: communities.filter((community) => community.currentRole === null && community.privacy === 'public'),
  };
}

export async function createCommunity(params: {
  name: string;
  description: string;
  category: string;
  imageUrl: string | null;
  privacy: 'public' | 'private';
  createdBy: string;
}): Promise<CommunitySummary> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase.from('communities').insert({
      id,
      name: params.name,
      description: params.description,
      category: params.category,
      image_url: params.imageUrl,
      privacy: params.privacy,
      created_by: params.createdBy,
      created_at: createdAt,
      updated_at: createdAt,
    }).select('*').single();
    if (error) throwStorageError('create the community', error);
    const { error: memberError } = await supabase.from('community_members').insert({
      community_id: id,
      member_phone: params.createdBy,
      role: 'owner',
      joined_at: createdAt,
    });
    if (memberError) {
      const { error: rollbackError } = await supabase.from('communities').delete().eq('id', id);
      if (rollbackError) console.error('Failed to roll back incomplete community creation:', rollbackError.message);
      throwStorageError('make you the community owner', memberError);
    }
    return mapSummary(data as Row, 'owner', 1, 0);
  }

  const db = getLocalDb();
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO local_communities
        (id, name, description, image_url, category, privacy, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, params.name, params.description, params.imageUrl, params.category, params.privacy, params.createdBy, createdAt, createdAt);
    db.prepare(`
      INSERT INTO local_community_members (community_id, member_phone, role, joined_at)
      VALUES (?, ?, 'owner', ?)
    `).run(id, params.createdBy, createdAt);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return mapSummary({
    id,
    name: params.name,
    description: params.description,
    image_url: params.imageUrl,
    category: params.category,
    privacy: params.privacy,
    created_by: params.createdBy,
    created_at: createdAt,
  }, 'owner', 1, 0);
}

export async function getCommunityDetail(
  communityId: string,
  phone: string
): Promise<CommunityDetail | null> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: community, error: communityError } = await supabase
      .from('communities').select('*').eq('id', communityId).maybeSingle();
    if (communityError) throwStorageError('load the community', communityError);
    if (!community) return null;
    const role = await getMembershipRole(communityId, phone);
    if (community.privacy === 'private' && !role) return null;

    const [memberResult, groupResult, announcementResult, requestResult] = await Promise.all([
      supabase.from('community_members').select('member_phone,role,joined_at').eq('community_id', communityId).order('joined_at'),
      supabase.from('community_groups').select('conversation_id').eq('community_id', communityId),
      supabase.from('community_announcements').select('*').eq('community_id', communityId).order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(100),
      role ? supabase.from('community_join_requests').select('requester_phone,requested_at,status').eq('community_id', communityId).eq('status', 'pending').order('requested_at') : Promise.resolve({ data: [], error: null }),
    ]);
    if (memberResult.error) throwStorageError('load community members', memberResult.error);
    if (groupResult.error) throwStorageError('load community groups', groupResult.error);
    if (announcementResult.error) throwStorageError('load community announcements', announcementResult.error);
    if (requestResult.error) throwStorageError('load community join requests', requestResult.error);

    const memberRows = asRows(memberResult.data);
    const memberPhones = memberRows.map((row) => field(row, 'member_phone'));
    const groupConversationIds = asRows(groupResult.data).map((row) => field(row, 'conversation_id'));
    const profilePhones = Array.from(new Set([...memberPhones, ...asRows(requestResult.data).map((row) => field(row, 'requester_phone'))]));
    const [profilesResult, conversationsResult, conversationMembersResult, ownRequestResult] = await Promise.all([
      profilePhones.length
        ? supabase.from('users').select('phone_normalized,full_name,avatar_url').in('phone_normalized', profilePhones)
        : Promise.resolve({ data: [], error: null }),
      groupConversationIds.length
        ? supabase.from('conversations').select('*').in('id', groupConversationIds)
        : Promise.resolve({ data: [], error: null }),
      groupConversationIds.length
        ? supabase.from('conversation_members').select('conversation_id,user_phone').in('conversation_id', groupConversationIds)
        : Promise.resolve({ data: [], error: null }),
      role
        ? Promise.resolve({ data: null, error: null })
        : supabase.from('community_join_requests').select('status').eq('community_id', communityId).eq('requester_phone', phone).maybeSingle(),
    ]);
    if (profilesResult.error) throwStorageError('load community member profiles', profilesResult.error);
    if (conversationsResult.error) throwStorageError('load subgroup chats', conversationsResult.error);
    if (conversationMembersResult.error) throwStorageError('load subgroup members', conversationMembersResult.error);
    if (ownRequestResult.error) throwStorageError('load your community join request', ownRequestResult.error);
    const profiles = new Map(asRows(profilesResult.data).map((row) => [field(row, 'phone_normalized'), row]));
    const members: CommunityDetail['members'] = memberRows.map((row) => {
      const memberPhone = field(row, 'member_phone');
      const profile = profiles.get(memberPhone) || {};
      return {
        phone: memberPhone,
        name: field(profile, 'full_name', memberPhone),
        avatarUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : null,
        role: asRole(row.role) || 'member',
        joinedAt: isoDate(row.joined_at),
      };
    });
    const groupMembers = new Map<string, string[]>();
    for (const row of asRows(conversationMembersResult.data)) {
      const id = field(row, 'conversation_id');
      groupMembers.set(id, [...(groupMembers.get(id) || []), field(row, 'user_phone')]);
    }
    const groups = asRows(conversationsResult.data).map((row) =>
      mapGroup(row, groupMembers.get(field(row, 'id')) || [])
    );
    const pendingJoinRequests: CommunityJoinRequest[] = asRows(requestResult.data).map((row) => {
      const requesterPhone = field(row, 'requester_phone');
      const profile = profiles.get(requesterPhone) || {};
      return {
        phone: requesterPhone,
        name: field(profile, 'full_name', requesterPhone),
        avatarUrl: typeof profile.avatar_url === 'string' ? profile.avatar_url : null,
        requestedAt: isoDate(row.requested_at),
      };
    });
    const { data: groupRows, error: groupRowsError } = groupConversationIds.length
      ? await supabase.from('community_groups').select('conversation_id,created_at').eq('community_id', communityId)
      : { data: [], error: null };
    if (groupRowsError) throwStorageError('load subgroup metadata', groupRowsError);
    const groupCreatedAt = new Map(asRows(groupRows).map((row) => [field(row, 'conversation_id'), isoDate(row.created_at)]));
    const currentGroups: CommunityGroup[] = groups.map((group) => ({
      conversation: group.conversation,
      createdAt: groupCreatedAt.get(group.conversation.id) || group.createdAt,
    }));
    return {
      community: mapSummary(
        community as Row,
        role,
        members.length,
        currentGroups.length
      ),
      members,
      groups: currentGroups,
      announcements: asRows(announcementResult.data).map(mapAnnouncement),
      pendingJoinRequests,
      joinRequestStatus: ownRequestResult.data ? field(ownRequestResult.data as Row, 'status') as CommunityDetail['joinRequestStatus'] : null,
    };
  }

  const db = getLocalDb();
  const community = db.prepare('SELECT * FROM local_communities WHERE id = ?').get(communityId) as Row | undefined;
  if (!community) return null;
  const memberRows = db.prepare(`
    SELECT cm.member_phone, cm.role, cm.joined_at, u.full_name, u.avatar_url
    FROM local_community_members cm
    LEFT JOIN local_users u ON u.phone_normalized = cm.member_phone
    WHERE cm.community_id = ? ORDER BY cm.joined_at
  `).all(communityId) as Row[];
  const currentMember = memberRows.find((row) => field(row, 'member_phone') === phone);
  const role = currentMember ? asRole(currentMember.role) : null;
  if (field(community, 'privacy') === 'private' && !role) return null;
  const groupRows = db.prepare(`
    SELECT c.* FROM local_community_groups cg
    JOIN local_conversations c ON c.id = cg.conversation_id
    WHERE cg.community_id = ? ORDER BY cg.created_at
  `).all(communityId) as Row[];
  const groups = groupRows.map((row) => {
    const rows = db.prepare(`
      SELECT user_phone FROM local_conversation_members WHERE conversation_id = ? ORDER BY joined_at
    `).all(field(row, 'id')) as Row[];
    return mapGroup(row, rows.map((member) => field(member, 'user_phone')));
  });
  const announcements = db.prepare(`
    SELECT * FROM local_community_announcements
    WHERE community_id = ? ORDER BY pinned DESC, created_at DESC LIMIT 100
  `).all(communityId) as Row[];
  const pendingRows = role
    ? db.prepare(`
        SELECT r.requester_phone, r.requested_at, u.full_name, u.avatar_url
        FROM local_community_join_requests r
        LEFT JOIN local_users u ON u.phone_normalized = r.requester_phone
        WHERE r.community_id = ? AND r.status = 'pending'
        ORDER BY r.requested_at
      `).all(communityId) as Row[]
    : [];
  const ownRequest = role ? undefined : db.prepare(`
    SELECT status FROM local_community_join_requests
    WHERE community_id = ? AND requester_phone = ?
  `).get(communityId, phone) as Row | undefined;
  const members: CommunityDetail['members'] = memberRows.map((row) => ({
    phone: field(row, 'member_phone'),
    name: field(row, 'full_name', field(row, 'member_phone')),
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    role: asRole(row.role) || 'member',
    joinedAt: isoDate(row.joined_at),
  }));
  const pendingJoinRequests: CommunityJoinRequest[] = pendingRows.map((row) => ({
    phone: field(row, 'requester_phone'),
    name: field(row, 'full_name', field(row, 'requester_phone')),
    avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    requestedAt: isoDate(row.requested_at),
  }));
  return {
    community: mapSummary(community, role, members.length, groups.length),
    members,
    groups,
    announcements: announcements.map(mapAnnouncement),
    pendingJoinRequests,
    joinRequestStatus: ownRequest ? field(ownRequest, 'status') as CommunityDetail['joinRequestStatus'] : null,
  };
}

export async function requestToJoinCommunity(
  communityId: string,
  phone: string
): Promise<'joined' | 'requested' | 'already_joined'> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: community, error: communityError } = await supabase
      .from('communities').select('privacy').eq('id', communityId).maybeSingle();
    if (communityError) throwStorageError('load community privacy', communityError);
    if (!community) throw new Error('Community not found.');
    if (await getMembershipRole(communityId, phone)) return 'already_joined';
    if (community.privacy === 'private') {
      const { error } = await supabase.from('community_join_requests').upsert({
        community_id: communityId,
        requester_phone: phone,
        status: 'pending',
        requested_at: new Date().toISOString(),
        reviewed_at: null,
        reviewed_by: null,
      }, { onConflict: 'community_id,requester_phone' });
      if (error) throwStorageError('request to join the community', error);
      return 'requested';
    }
    const { error } = await supabase.from('community_members').insert({
      community_id: communityId,
      member_phone: phone,
      role: 'member',
      joined_at: new Date().toISOString(),
    });
    if (error) throwStorageError('join the community', error);
    try {
      await syncGroupMemberships(communityId, phone);
    } catch (error) {
      const { error: rollbackError } = await supabase.from('community_members').delete()
        .eq('community_id', communityId).eq('member_phone', phone);
      if (rollbackError) console.error('Failed to roll back incomplete community join:', rollbackError.message);
      throw error;
    }
    return 'joined';
  }

  const db = getLocalDb();
  const community = db.prepare('SELECT privacy FROM local_communities WHERE id = ?').get(communityId) as Row | undefined;
  if (!community) throw new Error('Community not found.');
  const existing = db.prepare(`
    SELECT role FROM local_community_members WHERE community_id = ? AND member_phone = ?
  `).get(communityId, phone);
  if (existing) return 'already_joined';
  if (field(community, 'privacy') === 'private') {
    db.prepare(`
      INSERT INTO local_community_join_requests (community_id, requester_phone, status, requested_at)
      VALUES (?, ?, 'pending', ?)
      ON CONFLICT(community_id, requester_phone) DO UPDATE SET
        status = 'pending', requested_at = excluded.requested_at, reviewed_at = NULL, reviewed_by = NULL
    `).run(communityId, phone, new Date().toISOString());
    return 'requested';
  }
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO local_community_members (community_id, member_phone, role, joined_at)
      VALUES (?, ?, 'member', ?)
    `).run(communityId, phone, new Date().toISOString());
    await syncGroupMemberships(communityId, phone);
    db.exec('COMMIT');
    return 'joined';
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export async function createCommunityInvite(
  communityId: string,
  createdBy: string
): Promise<{ token: string; expiresAt: string }> {
  requireManager(await getMembershipRole(communityId, createdBy));
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60_000).toISOString();
  const id = crypto.randomUUID();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from('community_invites').insert({
      id,
      community_id: communityId,
      token_hash: tokenHash,
      created_by: createdBy,
      created_at: createdAt.toISOString(),
      expires_at: expiresAt,
      revoked_at: null,
    });
    if (error) throwStorageError('create the community invitation', error);
    return { token, expiresAt };
  }
  getLocalDb().prepare(`
    INSERT INTO local_community_invites
      (id, community_id, token_hash, created_by, created_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL)
  `).run(id, communityId, tokenHash, createdBy, createdAt.toISOString(), expiresAt);
  return { token, expiresAt };
}

async function findValidCommunityInvite(token: string): Promise<{
  community: Row;
  expiresAt: string;
} | null> {
  if (!/^[a-f0-9]{64}$/i.test(token)) return null;
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const now = new Date().toISOString();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: invite, error: inviteError } = await supabase.from('community_invites')
      .select('community_id,expires_at')
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .gt('expires_at', now)
      .maybeSingle();
    if (inviteError) throwStorageError('validate the community invitation', inviteError);
    if (!invite) return null;
    const { data: community, error: communityError } = await supabase.from('communities')
      .select('*').eq('id', invite.community_id).maybeSingle();
    if (communityError) throwStorageError('load the invited community', communityError);
    if (!community) return null;
    return { community: community as Row, expiresAt: isoDate(invite.expires_at) };
  }
  const db = getLocalDb();
  const invite = db.prepare(`
    SELECT community_id, expires_at FROM local_community_invites
    WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
  `).get(tokenHash, now) as Row | undefined;
  if (!invite) return null;
  const community = db.prepare('SELECT * FROM local_communities WHERE id = ?')
    .get(field(invite, 'community_id')) as Row | undefined;
  return community ? { community, expiresAt: isoDate(invite.expires_at) } : null;
}

export async function getCommunityInvitePreview(
  token: string,
  phone: string
): Promise<CommunityInvitePreview | null> {
  const invite = await findValidCommunityInvite(token);
  if (!invite) return null;
  const communityId = field(invite.community, 'id');
  const role = await getMembershipRole(communityId, phone);
  const supabase = getSupabaseServerClient();
  let memberCount = 0;
  let groupCount = 0;
  if (supabase) {
    const [membersResult, groupsResult] = await Promise.all([
      supabase.from('community_members').select('member_phone').eq('community_id', communityId),
      supabase.from('community_groups').select('conversation_id').eq('community_id', communityId),
    ]);
    if (membersResult.error) throwStorageError('count invited community members', membersResult.error);
    if (groupsResult.error) throwStorageError('count invited community subgroups', groupsResult.error);
    memberCount = asRows(membersResult.data).length;
    groupCount = asRows(groupsResult.data).length;
  } else {
    const db = getLocalDb();
    memberCount = Number((db.prepare('SELECT COUNT(*) AS count FROM local_community_members WHERE community_id = ?')
      .get(communityId) as Row).count) || 0;
    groupCount = Number((db.prepare('SELECT COUNT(*) AS count FROM local_community_groups WHERE community_id = ?')
      .get(communityId) as Row).count) || 0;
  }
  return {
    community: mapSummary(invite.community, role, memberCount, groupCount),
    expiresAt: invite.expiresAt,
  };
}

export async function acceptCommunityInvite(token: string, phone: string): Promise<string> {
  const invite = await findValidCommunityInvite(token);
  if (!invite) throw new Error('This community invitation is invalid, revoked, or expired.');
  const communityId = field(invite.community, 'id');
  if (await getMembershipRole(communityId, phone)) return communityId;
  if (field(invite.community, 'privacy') === 'private') {
    throw new Error('This private community requires approval. Request to join instead.');
  }
  const joinedAt = new Date().toISOString();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from('community_members').insert({
      community_id: communityId,
      member_phone: phone,
      role: 'member',
      joined_at: joinedAt,
    });
    if (error) throwStorageError('accept the community invitation', error);
    try {
      await syncGroupMemberships(communityId, phone);
    } catch (error) {
      const { error: rollbackError } = await supabase.from('community_members').delete()
        .eq('community_id', communityId).eq('member_phone', phone);
      if (rollbackError) console.error('Failed to roll back invitation acceptance:', rollbackError.message);
      throw error;
    }
    return communityId;
  }
  const db = getLocalDb();
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO local_community_members (community_id, member_phone, role, joined_at)
      VALUES (?, ?, 'member', ?)
    `).run(communityId, phone, joinedAt);
    await syncGroupMemberships(communityId, phone);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return communityId;
}

export async function requestCommunityInvite(
  token: string,
  phone: string
): Promise<'joined' | 'requested' | 'already_joined'> {
  const invite = await findValidCommunityInvite(token);
  if (!invite) throw new Error('This community invitation is invalid, revoked, or expired.');
  return requestToJoinCommunity(field(invite.community, 'id'), phone);
}

export async function leaveCommunity(communityId: string, phone: string): Promise<void> {
  const role = await getMembershipRole(communityId, phone);
  if (!role) throw new Error('You are not a member of this community.');
  if (role === 'owner') throw new Error('Transfer ownership before leaving this community.');
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: groups, error: groupError } = await supabase.from('community_groups')
      .select('conversation_id').eq('community_id', communityId);
    if (groupError) throwStorageError('load community chats', groupError);
    const conversationIds = asRows(groups).map((row) => field(row, 'conversation_id'));
    if (conversationIds.length) {
      const { error } = await supabase.from('conversation_members').delete()
        .in('conversation_id', conversationIds).eq('user_phone', phone);
      if (error) throw new Error(`Could not leave community chats: ${error.message}`);
    }
    const { error } = await supabase.from('community_members').delete()
      .eq('community_id', communityId).eq('member_phone', phone);
    if (error) throwStorageError('leave the community', error);
    return;
  }
  const db = getLocalDb();
  db.exec('BEGIN');
  try {
    db.prepare(`
      DELETE FROM local_conversation_members
      WHERE user_phone = ? AND conversation_id IN (
        SELECT conversation_id FROM local_community_groups WHERE community_id = ?
      )
    `).run(phone, communityId);
    db.prepare(`
      DELETE FROM local_community_members WHERE community_id = ? AND member_phone = ?
    `).run(communityId, phone);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export async function createCommunityGroup(params: {
  communityId: string;
  name: string;
  description: string;
  createdBy: string;
}): Promise<GroupConversationWireDto> {
  requireManager(await getMembershipRole(params.communityId, params.createdBy));
  const supabase = getSupabaseServerClient();
  const id = `community_${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();

  if (supabase) {
    const { data: memberRows, error: memberError } = await supabase.from('community_members')
      .select('member_phone').eq('community_id', params.communityId);
    if (memberError) throwStorageError('load community members', memberError);
    const memberPhones = asRows(memberRows).map((row) => field(row, 'member_phone'));
    const { data: conversation, error: conversationError } = await supabase.from('conversations')
      .insert({
        id,
        type: 'group',
        name: params.name,
        description: params.description,
        avatar_url: null,
        created_by: params.createdBy,
        created_at: createdAt,
        updated_at: createdAt,
      }).select('*').single();
    if (conversationError) throw new Error(`Could not create subgroup chat: ${conversationError.message}`);
    const { error: membershipError } = await supabase.from('conversation_members').insert(
      memberPhones.map((memberPhone) => ({
        conversation_id: id,
        user_phone: memberPhone,
        role: memberPhone === params.createdBy ? 'owner' : 'member',
        joined_at: createdAt,
      }))
    );
    if (membershipError) {
      const { error: rollbackError } = await supabase.from('conversations').delete().eq('id', id);
      if (rollbackError) console.error('Failed to roll back incomplete subgroup creation:', rollbackError.message);
      throw new Error(`Could not add community members to the subgroup: ${membershipError.message}`);
    }
    const { error: linkError } = await supabase.from('community_groups').insert({
      community_id: params.communityId,
      conversation_id: id,
      created_at: createdAt,
    });
    if (linkError) {
      const { error: rollbackError } = await supabase.from('conversations').delete().eq('id', id);
      if (rollbackError) console.error('Failed to roll back unlinked subgroup:', rollbackError.message);
      throwStorageError('link the subgroup to the community', linkError);
    }
    return mapGroup(conversation as Row, memberPhones).conversation;
  }

  const db = getLocalDb();
  const memberRows = db.prepare(`
    SELECT member_phone FROM local_community_members WHERE community_id = ?
  `).all(params.communityId) as Row[];
  const memberPhones = memberRows.map((row) => field(row, 'member_phone'));
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO local_conversations (id, type, name, description, avatar_url, created_by, created_at, updated_at)
      VALUES (?, 'group', ?, ?, NULL, ?, ?, ?)
    `).run(id, params.name, params.description, params.createdBy, createdAt, createdAt);
    const insertMember = db.prepare(`
      INSERT INTO local_conversation_members (conversation_id, user_phone, role, joined_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const memberPhone of memberPhones) {
      insertMember.run(id, memberPhone, memberPhone === params.createdBy ? 'owner' : 'member', createdAt);
    }
    db.prepare(`
      INSERT INTO local_community_groups (community_id, conversation_id, created_at)
      VALUES (?, ?, ?)
    `).run(params.communityId, id, createdAt);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return {
    id,
    name: params.name,
    description: params.description,
    avatarUrl: null,
    createdBy: params.createdBy,
    createdAt,
    memberPhones,
  };
}

export async function publishCommunityAnnouncement(params: {
  communityId: string;
  authorPhone: string;
  authorName: string;
  body: string;
}): Promise<CommunityAnnouncement> {
  requireManager(await getMembershipRole(params.communityId, params.authorPhone));
  const row = {
    id: crypto.randomUUID(),
    community_id: params.communityId,
    author_phone: params.authorPhone,
    author_name: params.authorName,
    body: params.body,
    pinned: false,
    created_at: new Date().toISOString(),
  };
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data, error } = await supabase.from('community_announcements').insert(row).select('*').single();
    if (error) throwStorageError('publish the announcement', error);
    return mapAnnouncement(data as Row);
  }
  getLocalDb().prepare(`
    INSERT INTO local_community_announcements
      (id, community_id, author_phone, author_name, body, pinned, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(row.id, row.community_id, row.author_phone, row.author_name, row.body, row.created_at);
  return mapAnnouncement(row);
}

export async function reviewCommunityJoinRequest(params: {
  communityId: string;
  requesterPhone: string;
  reviewerPhone: string;
  approve: boolean;
}): Promise<void> {
  requireManager(await getMembershipRole(params.communityId, params.reviewerPhone));
  const nextStatus = params.approve ? 'approved' : 'rejected';
  const reviewedAt = new Date().toISOString();
  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { data: request, error: requestError } = await supabase.from('community_join_requests')
      .select('status').eq('community_id', params.communityId)
      .eq('requester_phone', params.requesterPhone).maybeSingle();
    if (requestError) throwStorageError('load the join request', requestError);
    if (!request || request.status !== 'pending') throw new Error('This join request is no longer pending.');
    if (params.approve) {
      const { error } = await supabase.from('community_members').upsert({
        community_id: params.communityId,
        member_phone: params.requesterPhone,
        role: 'member',
        joined_at: reviewedAt,
      }, { onConflict: 'community_id,member_phone', ignoreDuplicates: true });
      if (error) throwStorageError('approve the join request', error);
      try {
        await syncGroupMemberships(params.communityId, params.requesterPhone);
      } catch (error) {
        const { error: rollbackError } = await supabase.from('community_members').delete()
          .eq('community_id', params.communityId).eq('member_phone', params.requesterPhone);
        if (rollbackError) console.error('Failed to roll back approved community request:', rollbackError.message);
        throw error;
      }
    }

    const { error } = await supabase.from('community_join_requests').update({
      status: nextStatus,
      reviewed_at: reviewedAt,
      reviewed_by: params.reviewerPhone,
    }).eq('community_id', params.communityId).eq('requester_phone', params.requesterPhone).eq('status', 'pending');
    if (error) throwStorageError('review the join request', error);
    return;
  }

  const db = getLocalDb();
  const request = db.prepare(`
    SELECT status FROM local_community_join_requests
    WHERE community_id = ? AND requester_phone = ?
  `).get(params.communityId, params.requesterPhone) as Row | undefined;
  if (!request || field(request, 'status') !== 'pending') throw new Error('This join request is no longer pending.');
  db.exec('BEGIN');
  try {
    if (params.approve) {
      db.prepare(`
        INSERT OR IGNORE INTO local_community_members (community_id, member_phone, role, joined_at)
        VALUES (?, ?, 'member', ?)
      `).run(params.communityId, params.requesterPhone, reviewedAt);
      await syncGroupMemberships(params.communityId, params.requesterPhone);
    }
    db.prepare(`
      UPDATE local_community_join_requests
      SET status = ?, reviewed_at = ?, reviewed_by = ?
      WHERE community_id = ? AND requester_phone = ? AND status = 'pending'
    `).run(nextStatus, reviewedAt, params.reviewerPhone, params.communityId, params.requesterPhone);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
