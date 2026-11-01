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
  unreadCount: number;
  isTyping?: boolean;
  categoryIds?: string[];
  customTheme?: ChatThemeConfig;
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
  isLive?: boolean;
  liveExpiresAt?: number;
  liveDurationMinutes?: number;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[]; // names of users
}

export interface MessageTranslation {
  translatedText: string;
  targetLanguage: string;
  provider: string;
}

export interface Message {
  id: string;
  chatId: string;
  senderId: string; // 'user' or contact.id
  senderName: string;
  text: string;
  timestamp: string; // formatted time e.g. "10:45 AM"
  timestampRaw: number;
  status: 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  mediaType?: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'poll';
  mediaUrl?: string;
  mediaFileName?: string;
  mediaFileSize?: string;
  audioDuration?: number; // in seconds
  waveformSamples?: number[];
  location?: LocationData;
  poll?: PollData;
  translation?: MessageTranslation;
  showTranslation?: boolean;
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

export interface ChatCategory {
  id: string; // 'all' | 'personal' | 'work' | 'study' | 'family' | 'friends' | 'important' | 'unread' | custom id
  name: string;
  color?: string; // hex or badge color
  icon?: string;
  isSystem?: boolean;
  order?: number;
}

export type PresetThemeId =
  | 'classic-white'
  | 'midnight-black'
  | 'ocean-blue'
  | 'sunset-orange'
  | 'forest-green'
  | 'purple-galaxy'
  | 'rose-pink'
  | 'minimal-grey'
  | 'lavender'
  | 'amoled-black'
  | 'emerald'
  | 'custom-gradient';

export interface ChatThemeConfig {
  presetId?: PresetThemeId;
  name?: string;
  // Background & wallpaper
  backgroundColor?: string;
  backgroundGradient?: string;
  wallpaperUrl?: string; // built-in preset or custom device upload URL / base64
  wallpaperOverlayOpacity?: number;
  // Message bubbles
  outgoingBubbleBg?: string;
  outgoingBubbleTextColor?: string;
  incomingBubbleBg?: string;
  incomingBubbleTextColor?: string;
  // Accent & Header
  headerBg?: string;
  headerTextColor?: string;
  accentColor?: string;
  bubbleRadius?: 'compact' | 'normal' | 'round';
  textContrast?: 'high' | 'normal';
}

export interface RingtoneItem {
  id: string;
  name: string;
  type: 'builtin' | 'custom';
  audioUrl?: string;
  dataBase64?: string;
  storageMode?: 'device' | 'synced';
  durationSeconds?: number;
  fileSizeFormatted?: string;
}

export interface RingtonePreferences {
  voiceCallRingtoneId: string; // default e.g. 'zolo-pulse'
  videoCallRingtoneId: string; // default e.g. 'classic-bell'
  groupCallRingtoneId: string; // default e.g. 'neon-cyber'
  volume: number; // 0 to 1
  vibrationEnabled: boolean;
  customRingtones: RingtoneItem[];
}
