import type {
  CallLog,
  ChatCategory,
  ChatThemeConfig,
  Contact,
  LocationData,
  Message,
  MessageReaction,
  PollData,
  RingtonePreferences,
  StatusStory,
} from './chat';

export interface AuthenticatedUser {
  id: number;
  uid: string;
  phoneNormalized: string;
  countryCode: string;
  phoneVerified: boolean;
  fullName: string;
  username: string;
  about: string;
  avatarUrl: string | null;
  email: string | null;
  hasGoogleLinked: boolean;
  hasPassword?: boolean;
  createdAt: string;
}

export interface PersistedChatBundle {
  contacts: Contact[];
  messages: Record<string, Message[]>;
  statuses: StatusStory[];
  callLogs: CallLog[];
  categories?: ChatCategory[];
  chatCategoryMap?: Record<string, string[]>; // contactId -> categoryIds[]
  chatThemes?: Record<string, ChatThemeConfig>; // contactId -> theme
  ringtonePreferences?: RingtonePreferences;
  preferences: {
    theme: 'dark' | 'light';
    soundEnabled: boolean;
    enterIsSend: boolean;
    readReceipts: boolean;
    chatWallpaper: string;
  };
}

export interface ActiveSessionInfo {
  sessionId: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface NotificationPreferences {
  privateMessages: boolean;
  groupMessages: boolean;
  calls: boolean;
  groupCalls: boolean;
  otherActivity: boolean;
}

export interface ApiErrorShape {
  code?: string;
  error: string;
  phoneNormalized?: string;
  status: number;
}

export interface ZoloPeerProfile {
  uid: string;
  phoneNormalized: string;
  fullName: string;
  about: string;
  avatarUrl: string | null;
  online?: boolean;
  lastSeen?: string;
}

export interface ContactLookupResponse {
  phoneNormalized: string;
  isRegistered: boolean;
  user: ZoloPeerProfile | null;
  online: boolean;
  lastSeen: string;
}

export interface DirectMessageRichPayload {
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

export interface DirectMessageWireDto {
  messageId: string;
  conversationKey: string;
  senderPhone: string;
  senderName: string;
  senderAvatar: string | null;
  recipientPhone: string;
  text: string;
  mediaType: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'poll';
  payload: DirectMessageRichPayload;
  status: 'sent' | 'delivered' | 'read';
  createdAt: string;
  timestampRaw: number;
}

export interface GroupConversationWireDto {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  createdBy: string;
  createdAt: string;
  memberPhones: string[];
}

export interface GroupMessageWireDto {
  messageId: string;
  conversationId: string;
  senderPhone: string;
  senderName: string;
  senderAvatar: string | null;
  text: string;
  mediaType: DirectMessageWireDto['mediaType'];
  payload: DirectMessageRichPayload;
  status: DirectMessageWireDto['status'];
  createdAt: string;
  timestampRaw: number;
}

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

export type RealtimeWsEvent =
  | {
      type: 'connected';
      phoneNormalized: string;
      onlinePhones: string[];
    }
  | {
      type: 'message:new';
      message: DirectMessageWireDto;
      senderProfile: ZoloPeerProfile;
    }
  | {
      type: 'message:status';
      peerPhone: string;
      messageIds: string[];
      status: 'delivered' | 'read';
    }
  | {
      type: 'message:updated';
      message: DirectMessageWireDto;
    }
  | {
      type: 'message:deleted';
      messageId: string;
      senderPhone: string;
      recipientPhone: string;
    }
  | {
      type: 'group:created';
      group: GroupConversationWireDto;
    }
  | {
      type: 'group:message';
      message: GroupMessageWireDto;
    }
  | {
      type: 'typing:update';
      fromPhone: string;
      isTyping: boolean;
    }
  | {
      type: 'presence:update';
      phoneNormalized: string;
      online: boolean;
      lastSeen: string;
    }
  | {
      type: 'status:new';
      story: StatusStoryWireDto;
    }
  | {
      type: 'status:viewed';
      story: StatusStoryWireDto;
    }
  | {
      type: 'call:incoming';
      callId: string;
      callerPhone: string;
      callerName: string;
      callerAvatar: string | null;
      callType: 'audio' | 'video';
      sdpOffer: RTCSessionDescriptionInit;
      timestampRaw: number;
    }
  | {
      type: 'call:ringing';
      callId: string;
      calleeOnline: boolean;
    }
  | {
      type: 'call:accepted';
      callId: string;
      calleePhone: string;
      sdpAnswer: RTCSessionDescriptionInit;
    }
  | {
      type: 'call:ice';
      callId: string;
      fromPhone: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      type: 'call:rejected';
      callId: string;
      byPhone: string;
      reason: 'rejected' | 'busy';
      callLog?: CallRecordWireDto | null;
    }
  | {
      type: 'call:ended';
      callId: string;
      byPhone: string;
      outcome: 'answered' | 'missed' | 'rejected' | 'busy';
      durationSeconds: number;
      callLog?: CallRecordWireDto | null;
    }
  | {
      type: 'call:log-updated';
      callLog: CallRecordWireDto;
    }
  | {
      type: 'call:group-incoming';
      callId: string;
      groupId: string;
      groupName: string;
      groupAvatar: string | null;
      callerPhone: string;
      callerName: string;
      callerAvatar: string | null;
      callType: 'audio' | 'video';
      timestampRaw: number;
      memberPhones: string[];
    }
  | {
      type: 'call:group-joined';
      callId: string;
      groupId: string;
      callType: 'audio' | 'video';
      hostPhone: string;
      existingParticipants: Array<{
        phone: string;
        name: string;
        avatar: string | null;
        role: 'host' | 'member';
        isMuted?: boolean;
        isVideoOff?: boolean;
      }>;
    }
  | {
      type: 'call:group-user-joined';
      callId: string;
      groupId: string;
      user: {
        phone: string;
        name: string;
        avatar: string | null;
        role: 'host' | 'member';
        isMuted?: boolean;
        isVideoOff?: boolean;
      };
    }
  | {
      type: 'call:group-signal';
      callId: string;
      fromPhone: string;
      fromName: string;
      signalType: 'offer' | 'answer';
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: 'call:group-ice';
      callId: string;
      fromPhone: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      type: 'call:group-media-updated';
      callId: string;
      phone: string;
      isMuted?: boolean;
      isVideoOff?: boolean;
    }
  | {
      type: 'call:group-user-left';
      callId: string;
      phone: string;
      name: string;
    }
  | {
      type: 'call:group-ended';
      callId: string;
      byPhone: string;
      reason: 'ended_by_host' | 'all_left';
      durationSeconds: number;
      callLog?: CallRecordWireDto | null;
    }
  | {
      type: 'call:group-active-status';
      groupId: string;
      active: boolean;
      callId?: string;
      callType?: 'audio' | 'video';
      hostPhone?: string;
      hostName?: string;
      participantCount?: number;
    }
  | {
      type: 'pong';
    };
