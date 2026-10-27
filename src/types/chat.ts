export interface Contact {
  id: string;
  name: string;
  phone: string;
  phoneNormalized?: string;
  isRealContact?: boolean;
  isRegisteredZoloUser?: boolean;
  avatar: string;
  about: string;
  online: boolean;
  lastSeen: string;
  isGroup?: boolean;
  groupMembers?: string[]; // Contact IDs
  isPinned?: boolean;
  isMuted?: boolean;
  isArchived?: boolean;
  disappearingMessages?: 'off' | '24h' | '7d' | '90d';
  inboxType?: 'personal' | 'work';
  isBlocked?: boolean;
  unreadCount: number;
  isTyping?: boolean;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
  voterNames: string[];
}

export interface PollData {
  question: string;
  options: PollOption[];
  userVotedId?: string;
  allowMultipleAnswers?: boolean;
}

export interface LocationData {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[]; // names of users
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string; // 'user' or contact.id
  senderName: string;
  text: string;
  timestamp: string; // formatted time e.g. "10:45 AM"
  timestampRaw: number;
  status: 'sent' | 'delivered' | 'read';
  mediaType?: 'text' | 'image' | 'audio' | 'document' | 'location' | 'poll';
  mediaUrl?: string;
  mediaFileName?: string;
  mediaFileSize?: string;
  audioDuration?: number; // in seconds
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
  isStarred?: boolean;
  isDeleted?: boolean;
}

export interface StatusStory {
  id: string;
  contactId: string;
  authorPhone?: string;
  contactName: string;
  contactAvatar: string;
  timestamp: string;
  timestampRaw: number;
  type: 'image' | 'text';
  mediaUrl?: string;
  text?: string;
  caption?: string;
  bgColor?: string;
  viewed: boolean;
  viewerCount?: number;
}

export interface CallLog {
  id: string;
  contactId: string;
  peerPhone?: string;
  contactName: string;
  contactAvatar: string;
  type: 'audio' | 'video';
  direction: 'incoming' | 'outgoing' | 'missed';
  outcome?: 'ringing' | 'answered' | 'missed' | 'rejected' | 'busy';
  timestamp: string;
  timestampRaw?: number;
  duration?: string;
  missedUnseen?: boolean;
}

export interface UserProfile {
  name: string;
  username?: string | null;
  about: string;
  phone: string;
  avatar: string;
  theme: 'dark' | 'light';
  soundEnabled: boolean;
  enterIsSend: boolean;
  readReceipts: boolean;
  chatWallpaper: string; // preset key or url
}
