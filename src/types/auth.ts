import type {
  CallLog,
  Contact,
  LocationData,
  Message,
  MessageReaction,
  PollData,
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
  mediaType: 'text' | 'image' | 'audio' | 'document' | 'location' | 'poll';
  payload: DirectMessageRichPayload;
  status: 'sent' | 'delivered' | 'read';
  createdAt: string;
  timestampRaw: number;
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
      type: 'pong';
    };
