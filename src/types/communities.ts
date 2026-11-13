import type { GroupConversationWireDto } from './auth';

export type CommunityPrivacy = 'public' | 'private';
export type CommunityRole = 'owner' | 'admin' | 'moderator' | 'member';
export type CommunityJoinRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CommunitySummary {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  category: string;
  privacy: CommunityPrivacy;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  groupCount: number;
  currentRole: CommunityRole | null;
}

export interface CommunityMember {
  phone: string;
  name: string;
  avatarUrl: string | null;
  role: CommunityRole;
  joinedAt: string;
}

export interface CommunityGroup {
  conversation: GroupConversationWireDto;
  createdAt: string;
}

export interface CommunityAnnouncement {
  id: string;
  authorPhone: string;
  authorName: string;
  body: string;
  pinned: boolean;
  createdAt: string;
}

export interface CommunityJoinRequest {
  phone: string;
  name: string;
  avatarUrl: string | null;
  requestedAt: string;
}

export interface CommunityDetail {
  community: CommunitySummary;
  members: CommunityMember[];
  groups: CommunityGroup[];
  announcements: CommunityAnnouncement[];
  pendingJoinRequests: CommunityJoinRequest[];
  joinRequestStatus: CommunityJoinRequestStatus | null;
}

export interface CommunityDirectory {
  mine: CommunitySummary[];
  discover: CommunitySummary[];
}

export interface CommunityInvitePreview {
  community: CommunitySummary;
  expiresAt: string;
}
