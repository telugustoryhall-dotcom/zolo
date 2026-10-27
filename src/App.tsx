import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Contact, Message, StatusStory, CallLog, UserProfile } from './types/chat';
import {
  INITIAL_USER,
  INITIAL_CONTACTS,
  INITIAL_MESSAGES,
  INITIAL_STATUSES,
  INITIAL_CALLS,
} from './data/initialData';
import { Sidebar } from './components/Sidebar';
import { ChatArea } from './components/ChatArea';
import { CallModal, CallSignalEvent } from './components/CallModal';
import { StatusViewerModal } from './components/StatusViewerModal';
import { StatusCreatorModal } from './components/StatusCreatorModal';
import { NewChatModal } from './components/NewChatModal';
import { NewGroupModal } from './components/NewGroupModal';
import { ContactInfoDrawer } from './components/ContactInfoDrawer';
import {
  LocationPickerModal,
  CreatePollModal,
} from './components/AttachmentModals';
import { AuthScreen } from './components/AuthScreen';
import { ZoloLogo } from './components/ZoloLogo';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { ZoloHome } from './components/ZoloHome';
import { QRCodeModal } from './components/QRCodeModal';
import { ZoloVaultModal } from './components/ZoloVaultModal';
import { RemindersAndScheduledModal } from './components/RemindersAndScheduledModal';
import { SecurityAndPrivacyModal } from './components/SecurityAndPrivacyModal';
import { GlobalSearchModal } from './components/GlobalSearchModal';
import { SharedMediaModal } from './components/SharedMediaModal';
import {
  NotificationToastContainer,
  type AppNotificationItem,
  showBrowserNotification,
  requestBrowserNotificationPermission,
} from './components/NotificationToast';
import { sound } from './utils/audio';
import { getSimulatedReply } from './utils/botReplies';
import { authApi, buildRealtimeWebSocketUrl } from './utils/authApi';
import type {
  AuthenticatedUser,
  CallRecordWireDto,
  DirectMessageWireDto,
  PersistedChatBundle,
  RealtimeWsEvent,
  StatusStoryWireDto,
  ZoloPeerProfile,
} from './types/auth';
import { Lock, Loader2, Bell, X } from 'lucide-react';

const THEME_PREF_KEY = 'zolochat_theme_pref';
const DEMO_CONTACT_IDS = new Set(['c1', 'c2', 'self']);

function makePeerContactId(phoneNormalized: string): string {
  return `zolo_${phoneNormalized.replace(/[^\d+]/g, '')}`;
}

function resolveContactPhoneNormalized(contact: Contact): string | null {
  if (contact.isGroup || DEMO_CONTACT_IDS.has(contact.id)) {
    return null;
  }
  if (contact.phoneNormalized && /^\+\d{7,15}$/.test(contact.phoneNormalized)) {
    return contact.phoneNormalized;
  }
  const raw = (contact.phone || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits || digits.length < 7 || digits.length > 15) return null;
  if (raw.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  return `+${digits}`;
}

function formatMessageTime(tsRaw: number): string {
  const d = new Date(tsRaw);
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelativeOrCalendarTime(tsRaw: number): string {
  const now = Date.now();
  const diffMs = Math.max(0, now - tsRaw);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const d = new Date(tsRaw);
  if (Number.isNaN(d.getTime())) return 'Recently';
  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();

  const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) {
    return `Today, ${timePart}`;
  }
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) {
    return `Yesterday, ${timePart}`;
  }
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${timePart}`;
}

function formatDurationLabel(seconds: number): string | undefined {
  if (!seconds || seconds <= 0) return undefined;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  }
  return `${secs}s`;
}

function wireDtoToStatusStory(
  dto: StatusStoryWireDto,
  myPhone: string,
  myDisplayName: string,
  myAvatar: string,
  currentContacts: Contact[]
): StatusStory {
  const isOwn = dto.authorPhone === myPhone;
  const matchedContact = isOwn
    ? null
    : currentContacts.find((c) => resolveContactPhoneNormalized(c) === dto.authorPhone);

  const otherViewersCount = dto.viewerPhones.filter((p) => p !== dto.authorPhone).length;

  return {
    id: dto.storyId,
    contactId: isOwn
      ? 'user'
      : matchedContact?.id || makePeerContactId(dto.authorPhone),
    authorPhone: dto.authorPhone,
    contactName: isOwn
      ? `${myDisplayName} (My Status)`
      : matchedContact?.name || dto.authorName || dto.authorPhone,
    contactAvatar: isOwn
      ? myAvatar || dto.authorAvatar || ''
      : matchedContact?.avatar || dto.authorAvatar || '',
    timestamp: formatRelativeOrCalendarTime(dto.timestampRaw),
    timestampRaw: dto.timestampRaw,
    type: dto.storyType,
    mediaUrl: dto.mediaUrl || undefined,
    text: dto.textContent || undefined,
    caption: dto.caption || undefined,
    bgColor: dto.bgColor || undefined,
    viewed: isOwn || dto.viewerPhones.includes(myPhone),
    viewerCount: otherViewersCount,
  };
}

function wireDtoToCallLog(
  dto: CallRecordWireDto,
  myPhone: string,
  currentContacts: Contact[]
): CallLog {
  const isOutgoing = dto.callerPhone === myPhone;
  const peerPhone = isOutgoing ? dto.calleePhone : dto.callerPhone;
  const matchedContact = currentContacts.find(
    (c) => resolveContactPhoneNormalized(c) === peerPhone
  );

  const direction: CallLog['direction'] = isOutgoing
    ? 'outgoing'
    : dto.outcome === 'answered'
    ? 'incoming'
    : 'missed';

  return {
    id: dto.callId,
    contactId: matchedContact?.id || makePeerContactId(peerPhone),
    peerPhone,
    contactName:
      matchedContact?.name ||
      (isOutgoing ? dto.calleeName : dto.callerName) ||
      peerPhone,
    contactAvatar:
      matchedContact?.avatar ||
      (isOutgoing ? dto.calleeAvatar : dto.callerAvatar) ||
      '',
    type: dto.callType,
    direction,
    outcome: dto.outcome,
    timestamp: formatRelativeOrCalendarTime(dto.timestampRaw),
    timestampRaw: dto.timestampRaw,
    duration: dto.outcome === 'answered' ? formatDurationLabel(dto.durationSeconds) : undefined,
    missedUnseen: !isOutgoing && direction === 'missed' && !dto.missedSeenByCallee,
  };
}

function wireDtoToMessage(
  dto: DirectMessageWireDto,
  myPhone: string,
  myDisplayName: string,
  chatContactId: string
): Message {
  const isOutgoing = dto.senderPhone === myPhone;
  const payload = dto.payload || {};

  // Map reactions so current user's own reaction shows 'You' locally
  const mappedReactions = payload.reactions?.map((r) => ({
    ...r,
    users: r.users.map((u) => (u === myPhone || u === myDisplayName ? 'You' : u)),
  }));

  // Map poll voterNames so current user's vote is highlighted
  let mappedPoll = payload.poll;
  if (mappedPoll) {
    let userVotedId: string | undefined = mappedPoll.userVotedId;
    const mappedOptions = mappedPoll.options.map((opt) => {
      const hasVoted = opt.voterNames.some(
        (v) => v === myPhone || v === myDisplayName || v === 'You'
      );
      if (hasVoted) {
        userVotedId = opt.id;
      }
      return {
        ...opt,
        voterNames: opt.voterNames.map((v) =>
          v === myPhone || v === myDisplayName ? 'You' : v
        ),
      };
    });
    mappedPoll = {
      ...mappedPoll,
      userVotedId,
      options: mappedOptions,
    };
  }

  return {
    id: dto.messageId,
    chatId: chatContactId,
    senderId: isOutgoing ? 'user' : chatContactId,
    senderName: isOutgoing ? myDisplayName : dto.senderName,
    text: dto.text,
    timestamp: formatMessageTime(dto.timestampRaw),
    timestampRaw: dto.timestampRaw,
    status: dto.status,
    mediaType: dto.mediaType,
    mediaUrl: payload.mediaUrl,
    mediaFileName: payload.mediaFileName,
    mediaFileSize: payload.mediaFileSize,
    audioDuration: payload.audioDuration,
    waveformSamples: payload.waveformSamples,
    location: payload.location,
    poll: mappedPoll,
    replyTo: payload.replyTo,
    reactions: mappedReactions,
  };
}

function buildSelfContact(user: {
  fullName: string;
  phoneNormalized: string;
  avatarUrl: string | null;
}): Contact {
  return {
    id: 'self',
    name: `${user.fullName} (You)`,
    phone: user.phoneNormalized,
    avatar: user.avatarUrl || '',
    about: 'Message yourself — notes, links & reminders',
    online: true,
    lastSeen: 'online',
    isPinned: false,
    isMuted: true,
    unreadCount: 0,
  };
}

function mergeSelfContact(
  baseContacts: Contact[],
  user: { fullName: string; phoneNormalized: string; avatarUrl: string | null }
): Contact[] {
  const selfEntry = buildSelfContact(user);
  const existingIdx = baseContacts.findIndex((c) => c.id === 'self');
  if (existingIdx >= 0) {
    return baseContacts.map((c) =>
      c.id === 'self'
        ? {
            ...c,
            name: selfEntry.name,
            phone: selfEntry.phone,
            avatar: selfEntry.avatar,
          }
        : c
    );
  }
  return [...baseContacts, selfEntry];
}

export default function App() {
  const [authChecking, setAuthChecking] = useState(true);
  const [authUser, setAuthUser] = useState<AuthenticatedUser | null>(null);

  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    let savedTheme: 'dark' | 'light' = 'dark';
    try {
      const t = localStorage.getItem(THEME_PREF_KEY);
      if (t === 'light' || t === 'dark') savedTheme = t;
    } catch {
      // Ignore storage restriction
    }
    return { ...INITIAL_USER, theme: savedTheme };
  });

  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [messages, setMessages] = useState<Record<string, Message[]>>(INITIAL_MESSAGES);
  const [statuses, setStatuses] = useState<StatusStory[]>(INITIAL_STATUSES);
  const [callLogs, setCallLogs] = useState<CallLog[]>(INITIAL_CALLS);

  // Active chat state (defaults to null so Zolo Home welcome screen shows first)
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [typingContactId, setTypingContactId] = useState<string | null>(null);

  // Modals & Panels state
  const [activeCall, setActiveCall] = useState<{
    callId: string;
    contact: Contact;
    peerPhoneNormalized: string | null;
    type: 'audio' | 'video';
    isIncoming?: boolean;
    incomingOffer?: RTCSessionDescriptionInit;
  } | null>(null);
  const [statusViewerIndex, setStatusViewerIndex] = useState<number | null>(null);
  const [isStatusCreatorOpen, setIsStatusCreatorOpen] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [isContactInfoOpen, setIsContactInfoOpen] = useState(false);
  const [previewImageModalUrl, setPreviewImageModalUrl] = useState<string | null>(null);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState(false);
  const [isRemindersModalOpen, setIsRemindersModalOpen] = useState(false);
  const [remindersInitialTab, setRemindersInitialTab] = useState<'reminders' | 'scheduled'>('reminders');
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isGlobalSearchModalOpen, setIsGlobalSearchModalOpen] = useState(false);
  const [isSharedFilesModalOpen, setIsSharedFilesModalOpen] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [notifications, setNotifications] = useState<AppNotificationItem[]>([]);

  const hydratedRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const contactsRef = useRef<Contact[]>(contacts);
  const activeContactIdRef = useRef<string | null>(activeContactId);
  const activeCallRef = useRef<typeof activeCall>(activeCall);
  const callSignalListenerRef = useRef<((ev: CallSignalEvent) => void) | null>(null);
  const userProfileRef = useRef<UserProfile>(userProfile);
  const authUserRef = useRef<AuthenticatedUser | null>(authUser);

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  useEffect(() => {
    activeContactIdRef.current = activeContactId;
  }, [activeContactId]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    userProfileRef.current = userProfile;
  }, [userProfile]);

  useEffect(() => {
    authUserRef.current = authUser;
  }, [authUser]);

  const sendWsPayload = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const triggerAppNotification = useCallback(
    (item: Omit<AppNotificationItem, 'id' | 'timestamp'>) => {
      const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const fullItem: AppNotificationItem = {
        ...item,
        id,
        timestamp: timeStr,
      };

      setNotifications((prev) => [fullItem, ...prev.slice(0, 2)]);

      // HTML5 Desktop Notification
      showBrowserNotification({
        title: item.title,
        body: item.subtitle,
        icon: item.avatarUrl,
        tag:
          item.type === 'message'
            ? `msg-${item.contactId || id}`
            : `status-${item.storyId || id}`,
        onClick: () => {
          if (item.type === 'message' && item.contactId) {
            setActiveContactId(item.contactId);
          } else if (item.type === 'status') {
            setStatusViewerIndex(item.statusIndex ?? 0);
          }
        },
      });
    },
    []
  );

  const registerCallSignalListener = useCallback(
    (listener: ((ev: CallSignalEvent) => void) | null) => {
      callSignalListenerRef.current = listener;
    },
    []
  );

  const upsertServerCallRecord = useCallback(
    (dto: CallRecordWireDto, currentUser: AuthenticatedUser) => {
      // Do not display transient in-flight 'ringing' records in history until settled
      if (dto.outcome === 'ringing') return;
      const mapped = wireDtoToCallLog(dto, currentUser.phoneNormalized, contactsRef.current);
      setCallLogs((prev) => {
        const filtered = prev.filter((item) => item.id !== mapped.id);
        return [mapped, ...filtered].sort(
          (a, b) => (b.timestampRaw || 0) - (a.timestampRaw || 0)
        );
      });
    },
    []
  );

  const hydrateStatusesAndCalls = useCallback(
    async (currentUser: AuthenticatedUser, latestContacts?: Contact[]) => {
      const contactList = latestContacts || contactsRef.current;
      const contactPhones = contactList
        .map((c) => resolveContactPhoneNormalized(c))
        .filter((p): p is string => Boolean(p) && p !== currentUser.phoneNormalized);

      try {
        const [statusRes, callsRes] = await Promise.all([
          authApi.fetchStatusFeed(contactPhones).catch(() => ({ stories: [] as StatusStoryWireDto[] })),
          authApi.fetchCallHistory().catch(() => ({ calls: [] as CallRecordWireDto[] })),
        ]);

        if (statusRes.stories.length > 0) {
          const newContactsToRegister: Contact[] = [];
          for (const dto of statusRes.stories) {
            if (dto.authorPhone && dto.authorPhone !== currentUser.phoneNormalized) {
              const hasContact = contactList.some(
                (c) => resolveContactPhoneNormalized(c) === dto.authorPhone
              );
              if (!hasContact) {
                newContactsToRegister.push({
                  id: makePeerContactId(dto.authorPhone),
                  name: dto.authorName || dto.authorPhone,
                  phone: dto.authorPhone,
                  phoneNormalized: dto.authorPhone,
                  isRealContact: true,
                  isRegisteredZoloUser: true,
                  avatar: dto.authorAvatar || '',
                  about: 'Hey there! I am using ZOLO.',
                  online: false,
                  lastSeen: 'recently on ZOLO',
                  unreadCount: 0,
                });
              }
            }
          }
          let effectiveContacts = contactList;
          if (newContactsToRegister.length > 0) {
            effectiveContacts = [...newContactsToRegister, ...contactList];
            contactsRef.current = effectiveContacts;
            setContacts(effectiveContacts);
          }

          const mappedStories = statusRes.stories.map((dto) =>
            wireDtoToStatusStory(
              dto,
              currentUser.phoneNormalized,
              userProfileRef.current.name || currentUser.fullName,
              userProfileRef.current.avatar || currentUser.avatarUrl || '',
              effectiveContacts
            )
          );
          setStatuses((prev) => {
            const demoOnly = prev.filter((s) => DEMO_CONTACT_IDS.has(s.contactId));
            const byId = new Map<string, StatusStory>();
            for (const st of mappedStories) {
              byId.set(st.id, st);
            }
            for (const d of demoOnly) {
              if (!byId.has(d.id)) byId.set(d.id, d);
            }
            return Array.from(byId.values()).sort(
              (a, b) => (b.timestampRaw || 0) - (a.timestampRaw || 0)
            );
          });
        }

        if (callsRes.calls.length > 0) {
          const settledCalls = callsRes.calls.filter((c) => c.outcome !== 'ringing');
          const mappedCalls = settledCalls.map((dto) =>
            wireDtoToCallLog(dto, currentUser.phoneNormalized, contactList)
          );
          setCallLogs((prev) => {
            const demoOnly = prev.filter((c) => DEMO_CONTACT_IDS.has(c.contactId));
            const byId = new Map<string, CallLog>();
            for (const cl of mappedCalls) {
              byId.set(cl.id, cl);
            }
            for (const d of demoOnly) {
              if (!byId.has(d.id)) byId.set(d.id, d);
            }
            return Array.from(byId.values()).sort(
              (a, b) => (b.timestampRaw || 0) - (a.timestampRaw || 0)
            );
          });
        }
      } catch {
        // Non-fatal background sync error
      }
    },
    []
  );

  const hydrateRealInbox = useCallback(async (currentUser: AuthenticatedUser) => {
    try {
      const inbox = await authApi.fetchInbox();
      const peerMap = new Map<string, ZoloPeerProfile>();
      for (const p of inbox.peers) {
        peerMap.set(p.phoneNormalized, p);
      }

      // Also check saved real contacts to refresh their ZOLO registration & presence
      const savedRealPhones = contactsRef.current
        .map((c) => resolveContactPhoneNormalized(c))
        .filter((p): p is string => Boolean(p) && p !== currentUser.phoneNormalized);

      if (savedRealPhones.length > 0) {
        try {
          const batch = await authApi.lookupContactsBatch(savedRealPhones);
          for (const item of batch.contacts) {
            if (item.user) {
              peerMap.set(item.phoneNormalized, {
                ...item.user,
                online: item.online,
                lastSeen: item.lastSeen,
              });
            }
          }
        } catch {
          // Non-fatal
        }
      }

      // Compute contact mapping (preserve saved nicknames, create entries for unsaved senders)
      const phoneToContactId = new Map<string, string>();
      let updatedContacts = contactsRef.current.map((c) => {
        const norm = resolveContactPhoneNormalized(c);
        if (!norm || norm === currentUser.phoneNormalized) return c;
        phoneToContactId.set(norm, c.id);
        const peer = peerMap.get(norm);
        if (peer) {
          return {
            ...c,
            phoneNormalized: norm,
            isRealContact: true,
            isRegisteredZoloUser: true,
            avatar: c.avatar || peer.avatarUrl || '',
            about: c.about || peer.about || 'Hey there! I am using ZOLO.',
            online: Boolean(peer.online),
            lastSeen: peer.lastSeen || c.lastSeen || 'recently on ZOLO',
          };
        }
        return {
          ...c,
          phoneNormalized: norm,
          isRealContact: true,
        };
      });

      const newContactsToAdd: Contact[] = [];

      for (const dto of inbox.messages) {
        const peerPhone =
          dto.senderPhone === currentUser.phoneNormalized
            ? dto.recipientPhone
            : dto.senderPhone;
        if (!peerPhone || peerPhone === currentUser.phoneNormalized) continue;

        if (!phoneToContactId.has(peerPhone)) {
          const cid = makePeerContactId(peerPhone);
          phoneToContactId.set(peerPhone, cid);
          const peer = peerMap.get(peerPhone);
          const fallbackName =
            dto.senderPhone === peerPhone && dto.senderName
              ? dto.senderName
              : peer?.fullName || peerPhone;
          const fallbackAvatar =
            peer?.avatarUrl ||
            (dto.senderPhone === peerPhone && dto.senderAvatar ? dto.senderAvatar : '');

          newContactsToAdd.push({
            id: cid,
            name: fallbackName,
            phone: peerPhone,
            phoneNormalized: peerPhone,
            isRealContact: true,
            isRegisteredZoloUser: Boolean(peer),
            avatar: fallbackAvatar || '',
            about: peer?.about || 'Hey there! I am using ZOLO.',
            online: Boolean(peer?.online),
            lastSeen: peer?.lastSeen || 'recently on ZOLO',
            unreadCount: 0,
          });
        }
      }

      if (newContactsToAdd.length > 0) {
        updatedContacts = [...newContactsToAdd, ...updatedContacts];
      }

      // Group real messages by contactId idempotently
      const groupedByContact = new Map<string, Message[]>();
      const unreadByContact = new Map<string, number>();

      for (const dto of inbox.messages) {
        const peerPhone =
          dto.senderPhone === currentUser.phoneNormalized
            ? dto.recipientPhone
            : dto.senderPhone;
        const cid = phoneToContactId.get(peerPhone);
        if (!cid) continue;

        const mapped = wireDtoToMessage(
          dto,
          currentUser.phoneNormalized,
          currentUser.fullName,
          cid
        );

        const list = groupedByContact.get(cid) || [];
        if (!list.some((m) => m.id === mapped.id)) {
          list.push(mapped);
        }
        groupedByContact.set(cid, list);

        if (
          dto.recipientPhone === currentUser.phoneNormalized &&
          dto.status !== 'read' &&
          activeContactIdRef.current !== cid
        ) {
          unreadByContact.set(cid, (unreadByContact.get(cid) || 0) + 1);
        }
      }

      // If currently viewing a peer with unread messages, mark them read on server
      const currentActiveContact = updatedContacts.find(
        (c) => c.id === activeContactIdRef.current
      );
      const activePeerPhone = currentActiveContact
        ? resolveContactPhoneNormalized(currentActiveContact)
        : null;
      if (
        activePeerPhone &&
        inbox.messages.some(
          (m) => m.senderPhone === activePeerPhone && m.status !== 'read'
        )
      ) {
        authApi.markPeerMessagesRead(activePeerPhone).catch(() => {});
      }

      updatedContacts = updatedContacts.map((c) => {
        if (!unreadByContact.has(c.id)) return c;
        return {
          ...c,
          unreadCount: unreadByContact.get(c.id) || 0,
        };
      });

      contactsRef.current = updatedContacts;
      setContacts(updatedContacts);

      if (groupedByContact.size > 0) {
        setMessages((prev) => {
          const next = { ...prev };
          for (const [cid, serverMsgs] of groupedByContact.entries()) {
            const existingLocal = next[cid] || [];
            // Keep any starred flags from local messages while server messages remain authoritative
            const starredIds = new Set(
              existingLocal.filter((m) => m.isStarred).map((m) => m.id)
            );
            const merged = serverMsgs
              .map((m) => (starredIds.has(m.id) ? { ...m, isStarred: true } : m))
              .sort((a, b) => a.timestampRaw - b.timestampRaw);
            next[cid] = merged;
          }
          return next;
        });
      }

      // Refresh shared status stories & internet call logs using updated chat contacts
      void hydrateStatusesAndCalls(currentUser, updatedContacts);
    } catch {
      // Ignore transient network errors during background sync
    }
  }, [hydrateStatusesAndCalls]);

  const applyAuthenticatedState = useCallback(
    (user: AuthenticatedUser, chatState: PersistedChatBundle | null) => {
      hydratedRef.current = false;
      setAuthUser(user);

      const prefs = chatState?.preferences;
      let localSavedTheme: 'dark' | 'light' = 'dark';
      try {
        const t = localStorage.getItem(THEME_PREF_KEY);
        if (t === 'light' || t === 'dark') localSavedTheme = t;
      } catch {
        // Ignore
      }
      const nextTheme = prefs?.theme || localSavedTheme || userProfile.theme || 'dark';

      setUserProfile({
        name: user.fullName,
        username: user.username,
        about: user.about || 'Hey there! I am using ZOLO.',
        phone: user.phoneNormalized,
        avatar: user.avatarUrl || '',
        theme: nextTheme,
        soundEnabled: prefs?.soundEnabled ?? true,
        enterIsSend: prefs?.enterIsSend ?? true,
        readReceipts: prefs?.readReceipts ?? true,
        chatWallpaper: prefs?.chatWallpaper ?? 'pattern',
      });

      const rawContacts =
        chatState?.contacts && chatState.contacts.length > 0
          ? chatState.contacts
          : INITIAL_CONTACTS;
      const baseContacts = rawContacts.filter((c) => {
        if (c.id === 'c3' || c.id === 'c4' || c.id === 'c5' || c.id === 'c6') return false;
        const lower = (c.name || '').toLowerCase();
        return (
          !lower.includes('alex chen') &&
          !lower.includes('alex clenn') &&
          !lower.includes('elena rostova') &&
          !lower.includes('zolo ai bot') &&
          !lower.includes('david kim')
        );
      });
      const mergedContacts = mergeSelfContact(baseContacts, user);
      contactsRef.current = mergedContacts;
      setContacts(mergedContacts);

      const baseMessages =
        chatState?.messages && Object.keys(chatState.messages).length > 0
          ? chatState.messages
          : INITIAL_MESSAGES;
      const filteredMessages: Record<string, Message[]> = {};
      for (const [k, v] of Object.entries(baseMessages)) {
        if (!['c3', 'c4', 'c5', 'c6'].includes(k)) {
          filteredMessages[k] = v;
        }
      }
      setMessages(filteredMessages);

      const rawStatuses =
        chatState?.statuses && chatState.statuses.length > 0
          ? chatState.statuses
          : INITIAL_STATUSES;
      setStatuses(rawStatuses.filter((s) => !['c3', 'c4', 'c5', 'c6'].includes(s.contactId)));

      const rawCalls =
        chatState?.callLogs && chatState.callLogs.length > 0
          ? chatState.callLogs
          : INITIAL_CALLS;
      setCallLogs(rawCalls.filter((cl) => !['c3', 'c4', 'c5', 'c6'].includes(cl.contactId)));

      // Default to Zolo Home (welcome screen) upon login instead of auto-selecting Sarah Miller
      setActiveContactId(null);
      setTimeout(() => {
        hydratedRef.current = true;
        void hydrateRealInbox(user);
      }, 120);
    },
    [userProfile.theme, hydrateRealInbox]
  );

  // Restore active session on mount
  useEffect(() => {
    let active = true;
    authApi
      .getMe()
      .then((res) => {
        if (!active) return;
        applyAuthenticatedState(res.user, res.chatState);
      })
      .catch(() => {
        if (!active) return;
        setAuthUser(null);
      })
      .finally(() => {
        if (active) setAuthChecking(false);
      });

    return () => {
      active = false;
    };
  }, [applyAuthenticatedState]);

  // Real-time WebSocket connection + auto-reconnect + state sync on reconnect
  useEffect(() => {
    if (!authUser) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    let disposed = false;
    let reconnectTimer: number | null = null;
    let pingInterval: number | null = null;

    const handleRealtimeEvent = (event: RealtimeWsEvent) => {
      const currentAuth = authUserRef.current;
      if (!currentAuth) return;

      if (event.type === 'connected') {
        const onlineSet = new Set(event.onlinePhones);
        setContacts((prev) =>
          prev.map((c) => {
            const norm = resolveContactPhoneNormalized(c);
            if (!norm) return c;
            const isOnline = onlineSet.has(norm);
            return {
              ...c,
              online: isOnline,
              lastSeen: isOnline ? 'online' : c.lastSeen || 'recently on ZOLO',
            };
          })
        );
        return;
      }

      if (event.type === 'presence:update') {
        setContacts((prev) =>
          prev.map((c) => {
            const norm = resolveContactPhoneNormalized(c);
            if (norm !== event.phoneNormalized) return c;
            return {
              ...c,
              online: event.online,
              lastSeen: event.online ? 'online' : event.lastSeen,
            };
          })
        );
        return;
      }

      if (event.type === 'typing:update') {
        const target = contactsRef.current.find(
          (c) => resolveContactPhoneNormalized(c) === event.fromPhone
        );
        if (!target) return;
        setContacts((prev) =>
          prev.map((c) => (c.id === target.id ? { ...c, isTyping: event.isTyping } : c))
        );
        setTypingContactId((prev) => {
          if (event.isTyping) return target.id;
          return prev === target.id ? null : prev;
        });
        return;
      }

      if (event.type === 'message:new') {
        const dto = event.message;
        const peerPhone =
          dto.senderPhone === currentAuth.phoneNormalized
            ? dto.recipientPhone
            : dto.senderPhone;
        if (!peerPhone) return;

        let targetContact = contactsRef.current.find(
          (c) => resolveContactPhoneNormalized(c) === peerPhone
        );
        let contactId: string;

        if (targetContact) {
          contactId = targetContact.id;
          // Refresh avatar/presence if peer profile available
          if (dto.senderPhone === peerPhone) {
            setContacts((prev) =>
              prev.map((c) =>
                c.id === contactId
                  ? {
                      ...c,
                      phoneNormalized: peerPhone,
                      isRealContact: true,
                      isRegisteredZoloUser: true,
                      avatar: c.avatar || event.senderProfile.avatarUrl || '',
                      online: true,
                      lastSeen: 'online',
                      isTyping: false,
                      unreadCount:
                        activeContactIdRef.current === contactId
                          ? 0
                          : (c.unreadCount || 0) + 1,
                    }
                  : c
              )
            );
          }
        } else {
          contactId = makePeerContactId(peerPhone);
          const createdContact: Contact = {
            id: contactId,
            name: event.senderProfile?.fullName || dto.senderName || peerPhone,
            phone: peerPhone,
            phoneNormalized: peerPhone,
            isRealContact: true,
            isRegisteredZoloUser: true,
            avatar: event.senderProfile?.avatarUrl || dto.senderAvatar || '',
            about: event.senderProfile?.about || 'Hey there! I am using ZOLO.',
            online: true,
            lastSeen: 'online',
            unreadCount:
              dto.senderPhone !== currentAuth.phoneNormalized &&
              activeContactIdRef.current !== contactId
                ? 1
                : 0,
          };
          contactsRef.current = [createdContact, ...contactsRef.current];
          setContacts((prev) => {
            if (prev.some((c) => c.id === contactId)) return prev;
            return [createdContact, ...prev];
          });
        }

        const mappedMsg = wireDtoToMessage(
          dto,
          currentAuth.phoneNormalized,
          userProfileRef.current.name,
          contactId
        );

        setTypingContactId((prev) => (prev === contactId ? null : prev));

        // Idempotent message append / reconcile
        setMessages((prev) => {
          const existing = prev[contactId] || [];
          const idx = existing.findIndex((m) => m.id === mappedMsg.id);
          if (idx >= 0) {
            const updated = [...existing];
            updated[idx] = { ...updated[idx], ...mappedMsg };
            return { ...prev, [contactId]: updated };
          }
          const nextList = [...existing, mappedMsg].sort(
            (a, b) => a.timestampRaw - b.timestampRaw
          );
          return { ...prev, [contactId]: nextList };
        });

        // Play chime, send read receipt, and trigger real-time notification
        if (dto.senderPhone !== currentAuth.phoneNormalized) {
          if (userProfileRef.current.soundEnabled) {
            sound.playReceiveSound();
          }
          const isViewingCurrent =
            activeContactIdRef.current === contactId &&
            typeof document !== 'undefined' &&
            !document.hidden;

          if (isViewingCurrent) {
            authApi.markPeerMessagesRead(peerPhone).catch(() => {});
          } else {
            const senderName = event.senderProfile?.fullName || dto.senderName || peerPhone;
            let snippet = dto.text;
            if (dto.mediaType === 'audio') snippet = '🎤 Voice note';
            else if (dto.mediaType === 'image') snippet = '📷 Photo';
            else if (dto.mediaType === 'poll') snippet = '📊 Poll';
            else if (dto.mediaType === 'location') snippet = '📍 Location';
            else if (dto.mediaType === 'document') snippet = '📄 Document';

            triggerAppNotification({
              type: 'message',
              title: senderName,
              subtitle: snippet || 'New message received',
              avatarUrl: event.senderProfile?.avatarUrl || dto.senderAvatar || '',
              contactId,
            });
          }
        }
        return;
      }

      if (event.type === 'message:status') {
        const target = contactsRef.current.find(
          (c) => resolveContactPhoneNormalized(c) === event.peerPhone
        );
        if (!target) return;
        const idSet = new Set(event.messageIds);
        setMessages((prev) => {
          const chatMsgs = prev[target.id];
          if (!chatMsgs) return prev;
          return {
            ...prev,
            [target.id]: chatMsgs.map((m) =>
              idSet.has(m.id) ? { ...m, status: event.status } : m
            ),
          };
        });
        return;
      }

      if (event.type === 'message:updated') {
        const dto = event.message;
        const peerPhone =
          dto.senderPhone === currentAuth.phoneNormalized
            ? dto.recipientPhone
            : dto.senderPhone;
        const target = contactsRef.current.find(
          (c) => resolveContactPhoneNormalized(c) === peerPhone
        );
        if (!target) return;

        const updatedMsg = wireDtoToMessage(
          dto,
          currentAuth.phoneNormalized,
          userProfileRef.current.name,
          target.id
        );

        setMessages((prev) => {
          const chatMsgs = prev[target.id] || [];
          return {
            ...prev,
            [target.id]: chatMsgs.map((m) =>
              m.id === updatedMsg.id
                ? { ...updatedMsg, isStarred: m.isStarred }
                : m
            ),
          };
        });
        return;
      }

      if (event.type === 'message:deleted') {
        const peerPhone =
          event.senderPhone === currentAuth.phoneNormalized
            ? event.recipientPhone
            : event.senderPhone;
        const target = contactsRef.current.find(
          (c) => resolveContactPhoneNormalized(c) === peerPhone
        );
        if (!target) return;

        setMessages((prev) => {
          const chatMsgs = prev[target.id];
          if (!chatMsgs) return prev;
          return {
            ...prev,
            [target.id]: chatMsgs.filter((m) => m.id !== event.messageId),
          };
        });
        return;
      }

      if (event.type === 'status:new') {
        const dto = event.story;
        const isOwn = dto.authorPhone === currentAuth.phoneNormalized;

        let targetContact = contactsRef.current.find(
          (c) => resolveContactPhoneNormalized(c) === dto.authorPhone
        );

        // Ensure peer contact entry is registered so status is rendered with their profile
        if (!targetContact && !isOwn) {
          const createdContact: Contact = {
            id: makePeerContactId(dto.authorPhone),
            name: dto.authorName || dto.authorPhone,
            phone: dto.authorPhone,
            phoneNormalized: dto.authorPhone,
            isRealContact: true,
            isRegisteredZoloUser: true,
            avatar: dto.authorAvatar || '',
            about: 'Hey there! I am using ZOLO.',
            online: true,
            lastSeen: 'online',
            unreadCount: 0,
          };
          contactsRef.current = [createdContact, ...contactsRef.current];
          setContacts((prev) => {
            if (prev.some((c) => c.id === createdContact.id)) return prev;
            return [createdContact, ...prev];
          });
          targetContact = createdContact;
        }

        const mappedStory = wireDtoToStatusStory(
          dto,
          currentAuth.phoneNormalized,
          userProfileRef.current.name || currentAuth.fullName,
          userProfileRef.current.avatar || currentAuth.avatarUrl || '',
          contactsRef.current
        );

        setStatuses((prev) => {
          const filtered = prev.filter((s) => s.id !== mappedStory.id);
          return [mappedStory, ...filtered].sort(
            (a, b) => (b.timestampRaw || 0) - (a.timestampRaw || 0)
          );
        });

        // Real-time Notification for Status Update!
        if (!isOwn) {
          if (userProfileRef.current.soundEnabled) {
            sound.playStatusSound();
          }
          const authorLabel = targetContact?.name || dto.authorName || dto.authorPhone;
          const previewText =
            dto.caption ||
            dto.textContent ||
            (dto.storyType === 'image' ? 'Shared a new photo status' : 'Updated status story');

          triggerAppNotification({
            type: 'status',
            title: `${authorLabel} updated status`,
            subtitle: previewText,
            avatarUrl: targetContact?.avatar || dto.authorAvatar || '',
            statusIndex: 0,
            storyId: dto.storyId,
          });
        }
        return;
      }

      if (event.type === 'status:viewed') {
        const dto = event.story;
        const otherViewersCount = dto.viewerPhones.filter(
          (p) => p !== dto.authorPhone
        ).length;
        setStatuses((prev) =>
          prev.map((s) =>
            s.id === dto.storyId
              ? {
                  ...s,
                  viewerCount: otherViewersCount,
                  viewed:
                    dto.authorPhone === currentAuth.phoneNormalized ||
                    dto.viewerPhones.includes(currentAuth.phoneNormalized),
                }
              : s
          )
        );
        return;
      }

      if (event.type === 'call:incoming') {
        // If already on another active call, automatically signal busy
        if (activeCallRef.current && activeCallRef.current.callId !== event.callId) {
          sendWsPayload({
            type: 'call:reject',
            callId: event.callId,
            toPhone: event.callerPhone,
            reason: 'busy',
          });
          return;
        }

        let callerContact = contactsRef.current.find(
          (c) => resolveContactPhoneNormalized(c) === event.callerPhone
        );
        if (!callerContact) {
          const createdCaller: Contact = {
            id: makePeerContactId(event.callerPhone),
            name: event.callerName || event.callerPhone,
            phone: event.callerPhone,
            phoneNormalized: event.callerPhone,
            isRealContact: true,
            isRegisteredZoloUser: true,
            avatar: event.callerAvatar || '',
            about: 'Hey there! I am using ZOLO.',
            online: true,
            lastSeen: 'online',
            unreadCount: 0,
          };
          contactsRef.current = [createdCaller, ...contactsRef.current];
          setContacts((prev) =>
            prev.some((c) => c.id === createdCaller.id) ? prev : [createdCaller, ...prev]
          );
          callerContact = createdCaller;
        }

        setActiveCall({
          callId: event.callId,
          contact: callerContact,
          peerPhoneNormalized: event.callerPhone,
          type: event.callType,
          isIncoming: true,
          incomingOffer: event.sdpOffer,
        });
        return;
      }

      if (event.type === 'call:ringing') {
        callSignalListenerRef.current?.(event);
        return;
      }

      if (event.type === 'call:accepted') {
        callSignalListenerRef.current?.(event);
        return;
      }

      if (event.type === 'call:ice') {
        callSignalListenerRef.current?.(event);
        return;
      }

      if (event.type === 'call:rejected') {
        if (event.callLog) {
          upsertServerCallRecord(event.callLog, currentAuth);
        }
        callSignalListenerRef.current?.({
          type: 'call:rejected',
          callId: event.callId,
          byPhone: event.byPhone,
          reason: event.reason,
        });
        return;
      }

      if (event.type === 'call:ended') {
        if (event.callLog) {
          upsertServerCallRecord(event.callLog, currentAuth);
        }
        callSignalListenerRef.current?.({
          type: 'call:ended',
          callId: event.callId,
          byPhone: event.byPhone,
          outcome: event.outcome,
          durationSeconds: event.durationSeconds,
        });
        return;
      }

      if (event.type === 'call:log-updated') {
        upsertServerCallRecord(event.callLog, currentAuth);
      }
    };

    const connectSocket = () => {
      if (disposed) return;
      try {
        const ws = new WebSocket(buildRealtimeWebSocketUrl());
        wsRef.current = ws;

        ws.onopen = () => {
          if (disposed) {
            ws.close();
            return;
          }
          // Reconcile state with server on every connect/reconnect
          if (authUserRef.current) {
            void hydrateRealInbox(authUserRef.current);
          }
        };

        ws.onmessage = (ev) => {
          if (typeof ev.data !== 'string') return;
          try {
            const parsed = JSON.parse(ev.data) as RealtimeWsEvent;
            handleRealtimeEvent(parsed);
          } catch {
            // Ignore malformed frame
          }
        };

        ws.onclose = () => {
          if (wsRef.current === ws) {
            wsRef.current = null;
          }
          if (!disposed) {
            reconnectTimer = window.setTimeout(connectSocket, 2500);
          }
        };

        ws.onerror = () => {
          // onclose handles reconnect
        };
      } catch {
        if (!disposed) {
          reconnectTimer = window.setTimeout(connectSocket, 3000);
        }
      }
    };

    connectSocket();

    pingInterval = window.setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 25000);

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingInterval) window.clearInterval(pingInterval);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [authUser, hydrateRealInbox, sendWsPayload, upsertServerCallRecord]);

  // Keep self contact synchronized when user updates profile name/phone/avatar
  useEffect(() => {
    if (!authUser) return;
    setContacts((prev) =>
      mergeSelfContact(prev, {
        fullName: userProfile.name,
        phoneNormalized: userProfile.phone,
        avatarUrl: userProfile.avatar || null,
      })
    );
  }, [authUser, userProfile.name, userProfile.phone, userProfile.avatar]);

  // Persist conversations & preferences to database (debounced)
  useEffect(() => {
    if (!authUser || !hydratedRef.current) return;
    if (syncTimerRef.current) {
      window.clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      const bundle: PersistedChatBundle = {
        contacts,
        messages,
        statuses,
        callLogs,
        preferences: {
          theme: userProfile.theme,
          soundEnabled: userProfile.soundEnabled,
          enterIsSend: userProfile.enterIsSend,
          readReceipts: userProfile.readReceipts,
          chatWallpaper: userProfile.chatWallpaper,
        },
      };
      authApi.saveChatState(bundle).catch(() => {});
    }, 900);

    return () => {
      if (syncTimerRef.current) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, [
    authUser,
    contacts,
    messages,
    statuses,
    callLogs,
    userProfile.theme,
    userProfile.soundEnabled,
    userProfile.enterIsSend,
    userProfile.readReceipts,
    userProfile.chatWallpaper,
  ]);

  // Apply dark / light class to root
  useEffect(() => {
    const isDark = userProfile.theme === 'dark';
    try {
      localStorage.setItem(THEME_PREF_KEY, userProfile.theme);
    } catch {
      // Ignore storage restriction
    }
    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.body.style.backgroundColor = '#111b21';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      document.body.style.backgroundColor = '#f0f2f5';
    }
  }, [userProfile.theme]);

  // Request browser notification permission check
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default' && authUser) {
        setShowNotificationPrompt(true);
      }
    }
  }, [authUser]);

  const handleRequestNotificationPermission = async () => {
    try {
      const perm = await requestBrowserNotificationPermission();
      setShowNotificationPrompt(false);
      if (perm === 'granted') {
        setNotifications((prev) => [
          {
            id: `ntf_${Date.now()}`,
            type: 'message',
            title: 'ZOLO Notifications Active',
            subtitle: 'You will now receive desktop alerts for incoming audio/video calls and messages.',
            timestamp: 'Just now',
          },
          ...prev,
        ]);
      }
    } catch {
      setShowNotificationPrompt(false);
    }
  };

  const handleToggleInboxType = useCallback((contactId: string, type: 'personal' | 'work') => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, inboxType: type } : c))
    );
  }, []);

  // Cmd/Ctrl + K shortcut for global search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsGlobalSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleToggleTheme = () => {
    setUserProfile((prev) => {
      const nextTheme = prev.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_PREF_KEY, nextTheme);
      } catch {
        // Ignore
      }
      return {
        ...prev,
        theme: nextTheme,
      };
    });
  };

  const handleLoggedOut = () => {
    hydratedRef.current = false;
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setAuthUser(null);
    setActiveCall(null);
    setIsContactInfoOpen(false);
  };

  const activeContact = contacts.find((c) => c.id === activeContactId) || null;
  const activeMessages = activeContactId ? messages[activeContactId] || [] : [];

  // Reset starter conversations while keeping authenticated account & real inbox intact
  const handleResetData = () => {
    if (!authUser) return;
    const resetContacts = mergeSelfContact(INITIAL_CONTACTS, authUser);
    contactsRef.current = resetContacts;
    setContacts(resetContacts);
    setMessages(INITIAL_MESSAGES);
    setStatuses(INITIAL_STATUSES);
    setCallLogs(INITIAL_CALLS);
    setActiveContactId('c1');
    void hydrateRealInbox(authUser);
  };

  // Select contact & clear unread badge (+ mark real messages read on server)
  const handleSelectContact = (id: string) => {
    activeContactIdRef.current = id;
    setActiveContactId(id);
    setContacts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );

    const target = contactsRef.current.find((c) => c.id === id);
    const peerPhone = target ? resolveContactPhoneNormalized(target) : null;
    if (peerPhone && authUser && peerPhone !== authUser.phoneNormalized) {
      authApi.markPeerMessagesRead(peerPhone).catch(() => {});
    }
  };

  // Forward typing status over WebSocket when chatting with a real ZOLO contact
  const handleTypingChange = useCallback((isTypingNow: boolean) => {
    const activeId = activeContactIdRef.current;
    if (!activeId) return;
    const target = contactsRef.current.find((c) => c.id === activeId);
    if (!target) return;
    const peerPhone = resolveContactPhoneNormalized(target);
    if (!peerPhone) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'typing',
          toPhone: peerPhone,
          isTyping: isTypingNow,
        })
      );
    }
  }, []);

  // Send message handler
  const handleSendMessage = (
    text: string,
    mediaType: Message['mediaType'] = 'text',
    extraData: Partial<Message> = {}
  ) => {
    if (!activeContactId || !activeContact) return;

    if (userProfile.soundEnabled) {
      sound.playSendSound();
    }

    const nowTs = Date.now();
    const timeStr = formatMessageTime(nowTs);
    const messageId = `msg_${nowTs}_${Math.random().toString(36).slice(2, 8)}`;

    const peerPhone = resolveContactPhoneNormalized(activeContact);
    const isSelfChat =
      activeContact.id === 'self' ||
      (Boolean(peerPhone) && peerPhone === authUser?.phoneNormalized);

    const newMessage: Message = {
      id: messageId,
      chatId: activeContactId,
      senderId: 'user',
      senderName: userProfile.name,
      text,
      timestamp: timeStr,
      timestampRaw: nowTs,
      status: isSelfChat ? 'read' : 'sent',
      mediaType,
      ...extraData,
    };

    // Optimistic append (idempotent on id)
    setMessages((prev) => {
      const existing = prev[activeContactId] || [];
      if (existing.some((m) => m.id === newMessage.id)) return prev;
      return {
        ...prev,
        [activeContactId]: [...existing, newMessage],
      };
    });

    if (isSelfChat) {
      return;
    }

    // REAL ZOLO DIRECT MESSAGE DELIVERY (for any contact with a mobile number)
    if (peerPhone && authUser) {
      const targetChatId = activeContactId;
      authApi
        .sendDirectMessage({
          messageId,
          recipientPhone: peerPhone,
          text,
          mediaType: mediaType || 'text',
          payload: {
            mediaUrl: extraData.mediaUrl,
            mediaFileName: extraData.mediaFileName,
            mediaFileSize: extraData.mediaFileSize,
            audioDuration: extraData.audioDuration,
            waveformSamples: extraData.waveformSamples,
            location: extraData.location,
            poll: extraData.poll,
            replyTo: extraData.replyTo,
          },
        })
        .then((res) => {
          // Reconcile server status ('sent' or 'delivered' if recipient is online)
          setMessages((prev) => ({
            ...prev,
            [targetChatId]: (prev[targetChatId] || []).map((m) =>
              m.id === messageId ? { ...m, status: res.message.status } : m
            ),
          }));

          if (res.recipientProfile) {
            setContacts((prev) =>
              prev.map((c) =>
                c.id === targetChatId
                  ? {
                      ...c,
                      phoneNormalized: peerPhone,
                      isRealContact: true,
                      isRegisteredZoloUser: res.recipientRegistered,
                      avatar: c.avatar || res.recipientProfile?.avatarUrl || '',
                      online: Boolean(res.recipientProfile?.online),
                      lastSeen:
                        res.recipientProfile?.lastSeen ||
                        c.lastSeen ||
                        'recently on ZOLO',
                    }
                  : c
              )
            );
          }
        })
        .catch(() => {
          // Rollback optimistic message if server rejected delivery
          setMessages((prev) => ({
            ...prev,
            [targetChatId]: (prev[targetChatId] || []).filter(
              (m) => m.id !== messageId
            ),
          }));
        });
      return;
    }

    // Starter demo showcase contacts ('c1'..'c6') keep interactive preview behavior
    setTimeout(() => {
      setMessages((prev) => ({
        ...prev,
        [activeContactId]: (prev[activeContactId] || []).map((m) =>
          m.id === newMessage.id ? { ...m, status: 'delivered' } : m
        ),
      }));
    }, 800);

    if (!activeContact.isGroup) {
      setTimeout(() => {
        setTypingContactId(activeContactId);
      }, 1400);

      setTimeout(() => {
        setTypingContactId(null);

        setMessages((prev) => ({
          ...prev,
          [activeContactId]: (prev[activeContactId] || []).map((m) =>
            m.id === newMessage.id ? { ...m, status: 'read' } : m
          ),
        }));

        const replyText = getSimulatedReply(activeContact, text);
        const replyNow = Date.now();

        const incomingMsg: Message = {
          id: `msg_bot_${replyNow}`,
          chatId: activeContactId,
          senderId: activeContact.id,
          senderName: activeContact.name,
          text: replyText,
          timestamp: formatMessageTime(replyNow),
          timestampRaw: replyNow,
          status: 'read',
          mediaType: 'text',
        };

        setMessages((prev) => ({
          ...prev,
          [activeContactId]: [...(prev[activeContactId] || []), incomingMsg],
        }));

        if (userProfile.soundEnabled) {
          sound.playReceiveSound();
        }

        if (
          activeContactIdRef.current !== activeContactId ||
          (typeof document !== 'undefined' && document.hidden)
        ) {
          triggerAppNotification({
            type: 'message',
            title: activeContact.name,
            subtitle: replyText,
            avatarUrl: activeContact.avatar,
            contactId: activeContact.id,
          });
        }
      }, 3200);
    }
  };

  // Reactions
  const handleReactMessage = (messageId: string, emoji: string) => {
    if (!activeContactId || !activeContact) return;
    const targetChatId = activeContactId;
    const peerPhone = resolveContactPhoneNormalized(activeContact);

    setMessages((prev) => {
      const chatMsgs = prev[targetChatId] || [];
      const updated = chatMsgs.map((m) => {
        if (m.id !== messageId) return m;
        const currentReactions = m.reactions || [];
        const existing = currentReactions.find(
          (r) => r.emoji === emoji && r.users.includes('You')
        );

        let newReactions;
        if (existing) {
          const remainingUsers = existing.users.filter((u) => u !== 'You');
          if (remainingUsers.length === 0) {
            newReactions = currentReactions.filter((r) => r.emoji !== emoji);
          } else {
            newReactions = currentReactions.map((r) =>
              r.emoji === emoji
                ? { ...r, count: remainingUsers.length, users: remainingUsers }
                : r
            );
          }
        } else {
          const otherReaction = currentReactions.find((r) => r.emoji === emoji);
          if (otherReaction) {
            const nextUsers = [...otherReaction.users, 'You'];
            newReactions = currentReactions.map((r) =>
              r.emoji === emoji
                ? { ...r, count: nextUsers.length, users: nextUsers }
                : r
            );
          } else {
            newReactions = [...currentReactions, { emoji, count: 1, users: ['You'] }];
          }
        }
        return { ...m, reactions: newReactions };
      });
      return { ...prev, [targetChatId]: updated };
    });

    if (peerPhone && authUser && peerPhone !== authUser.phoneNormalized) {
      authApi.reactDirectMessage(messageId, emoji).catch(() => {});
    }
  };

  // Star message
  const handleStarMessage = (messageId: string) => {
    if (!activeContactId) return;
    setMessages((prev) => {
      const chatMsgs = prev[activeContactId] || [];
      const updated = chatMsgs.map((m) =>
        m.id === messageId ? { ...m, isStarred: !m.isStarred } : m
      );
      return { ...prev, [activeContactId]: updated };
    });
  };

  // Delete message
  const handleDeleteMessage = (messageId: string) => {
    if (!activeContactId || !activeContact) return;
    const targetChatId = activeContactId;
    const peerPhone = resolveContactPhoneNormalized(activeContact);

    setMessages((prev) => {
      const chatMsgs = prev[targetChatId] || [];
      const updated = chatMsgs.filter((m) => m.id !== messageId);
      return { ...prev, [targetChatId]: updated };
    });

    if (peerPhone && authUser && peerPhone !== authUser.phoneNormalized) {
      authApi.deleteDirectMessage(messageId).catch(() => {});
    }
  };

  // Vote on Poll
  const handleVotePoll = (messageId: string, optionId: string) => {
    if (!activeContactId || !activeContact) return;
    const targetChatId = activeContactId;
    const peerPhone = resolveContactPhoneNormalized(activeContact);

    setMessages((prev) => {
      const chatMsgs = prev[targetChatId] || [];
      const updated = chatMsgs.map((m) => {
        if (m.id !== messageId || !m.poll) return m;
        const currentPoll = m.poll;
        const prevVoteId = currentPoll.userVotedId;

        const updatedOptions = currentPoll.options.map((opt) => {
          if (opt.id === optionId) {
            if (prevVoteId === optionId) {
              return {
                ...opt,
                votes: Math.max(0, opt.votes - 1),
                voterNames: opt.voterNames.filter((n) => n !== 'You'),
              };
            }
            return {
              ...opt,
              votes: opt.votes + 1,
              voterNames: [...opt.voterNames, 'You'],
            };
          }
          if (opt.id === prevVoteId && !currentPoll.allowMultipleAnswers) {
            return {
              ...opt,
              votes: Math.max(0, opt.votes - 1),
              voterNames: opt.voterNames.filter((n) => n !== 'You'),
            };
          }
          return opt;
        });

        return {
          ...m,
          poll: {
            ...currentPoll,
            userVotedId: prevVoteId === optionId ? undefined : optionId,
            options: updatedOptions,
          },
        };
      });
      return { ...prev, [targetChatId]: updated };
    });

    if (peerPhone && authUser && peerPhone !== authUser.phoneNormalized) {
      authApi.voteDirectPoll(messageId, optionId).catch(() => {});
    }
  };

  // Status Story Reply
  const handleReplyStatus = (contactId: string, replyText: string, statusInfo: StatusStory) => {
    if (contactId === 'user') return;
    handleSelectContact(contactId);
    handleSendMessage(
      `Replying to status "${statusInfo.caption || statusInfo.text || 'Photo'}": ${replyText}`
    );
  };

  // Mark Status Story Viewed
  const handleStoryViewed = useCallback(
    (storyId: string) => {
      setStatuses((prev) =>
        prev.map((s) => (s.id === storyId ? { ...s, viewed: true } : s))
      );
      if (authUser && !storyId.startsWith('st_1') && !storyId.startsWith('st_2') && !storyId.startsWith('st_3')) {
        authApi.markStatusStoryViewed(storyId).catch(() => {});
      }
    },
    [authUser]
  );

  // Start Internet Audio or Video Call
  const handleStartCall = (
    contactId: string,
    type: 'audio' | 'video',
    rawPeerPhone?: string
  ) => {
    let contact = contacts.find((c) => c.id === contactId);
    if (!contact && rawPeerPhone) {
      contact = contacts.find(
        (c) => resolveContactPhoneNormalized(c) === rawPeerPhone
      );
      if (!contact) {
        const tempContact: Contact = {
          id: makePeerContactId(rawPeerPhone),
          name: rawPeerPhone,
          phone: rawPeerPhone,
          phoneNormalized: rawPeerPhone,
          isRealContact: true,
          isRegisteredZoloUser: true,
          avatar: '',
          about: 'Hey there! I am using ZOLO.',
          online: false,
          lastSeen: 'recently on ZOLO',
          unreadCount: 0,
        };
        contactsRef.current = [tempContact, ...contactsRef.current];
        setContacts((prev) => [tempContact, ...prev]);
        contact = tempContact;
      }
    }
    if (!contact || contact.isGroup || contact.id === 'self') return;

    const peerPhoneNormalized = resolveContactPhoneNormalized(contact);
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    setActiveCall({
      callId,
      contact,
      peerPhoneNormalized:
        peerPhoneNormalized && peerPhoneNormalized !== authUser?.phoneNormalized
          ? peerPhoneNormalized
          : null,
      type,
      isIncoming: false,
    });
  };

  // Clear unseen missed call badges when opening Calls tab
  const handleClearMissedCalls = useCallback(() => {
    setCallLogs((prev) =>
      prev.map((c) => (c.missedUnseen ? { ...c, missedUnseen: false } : c))
    );
    if (authUser) {
      authApi.markMissedCallsSeen().catch(() => {});
    }
  }, [authUser]);

  // Close Call and reconcile call history
  const handleCloseCall = (result: {
    durationStr?: string;
    durationSeconds: number;
    outcome: 'answered' | 'missed' | 'rejected' | 'busy';
  }) => {
    if (activeCall) {
      const isOutgoing = !activeCall.isIncoming;
      const direction: CallLog['direction'] = isOutgoing
        ? 'outgoing'
        : result.outcome === 'answered'
        ? 'incoming'
        : 'missed';

      const fallbackLog: CallLog = {
        id: activeCall.callId,
        contactId: activeCall.contact.id,
        peerPhone: activeCall.peerPhoneNormalized || undefined,
        contactName: activeCall.contact.name,
        contactAvatar: activeCall.contact.avatar,
        type: activeCall.type,
        direction,
        outcome: result.outcome,
        timestamp: 'Just now',
        timestampRaw: Date.now(),
        duration:
          result.outcome === 'answered'
            ? result.durationStr || formatDurationLabel(result.durationSeconds)
            : undefined,
        missedUnseen: !isOutgoing && direction === 'missed',
      };

      setCallLogs((prev) => {
        if (prev.some((item) => item.id === fallbackLog.id)) {
          return prev;
        }
        return [fallbackLog, ...prev];
      });

      if (activeCall.peerPhoneNormalized && authUser) {
        // Refresh authoritative call log from server after hangup/missed settlement
        setTimeout(() => {
          if (authUserRef.current) {
            void hydrateStatusesAndCalls(authUserRef.current);
          }
        }, 350);
      }
    }
    setActiveCall(null);
  };

  // Pin, Mute, Archive toggles
  const handleTogglePin = (contactId: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, isPinned: !c.isPinned } : c))
    );
  };

  const handleToggleMute = (contactId: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, isMuted: !c.isMuted } : c))
    );
  };

  const handleToggleArchive = (contactId: string) => {
    setContacts((prev) =>
      prev.map((c) => (c.id === contactId ? { ...c, isArchived: !c.isArchived } : c))
    );
  };

  const isDark = userProfile.theme === 'dark';

  if (authChecking) {
    return (
      <div
        className={`h-screen w-screen flex flex-col items-center justify-center gap-4 ${
          isDark ? 'bg-[#0c1317] text-white' : 'bg-[#f0f2f5] text-slate-900'
        }`}
      >
        <ZoloLogo variant="full" theme={userProfile.theme} className="h-12 w-auto" />
        <Loader2 className="w-6 h-6 animate-spin text-[#00a884]" />
      </div>
    );
  }

  if (!authUser) {
    return (
      <AuthScreen
        theme={userProfile.theme}
        onToggleTheme={handleToggleTheme}
        onAuthenticated={({ user, chatState }) => {
          applyAuthenticatedState(user, chatState);
        }}
      />
    );
  }

  return (
    <div
      className={`h-screen w-screen overflow-hidden flex flex-col font-sans select-none ${
        isDark ? 'dark bg-[#0c1317] text-white' : 'bg-[#e2e5e9] text-slate-900'
      }`}
    >
      {/* Desktop Top Accent Bar */}
      <div className="hidden lg:block w-full h-8 bg-[#00a884] shrink-0" />

      {/* Browser Notification Permission Request Banner */}
      {showNotificationPrompt && (
        <div className="w-full bg-gradient-to-r from-emerald-600 via-[#00a884] to-teal-700 text-white px-4 py-2 text-xs flex items-center justify-between shadow-md z-40 shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-100 shrink-0 animate-bounce" />
            <span className="font-medium">
              Enable notifications to get real-time incoming call rings and instant message alerts.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRequestNotificationPermission}
              className="px-3 py-1 bg-white text-emerald-800 font-bold rounded-lg shadow-sm hover:bg-emerald-50 transition-colors"
            >
              Allow Notifications
            </button>
            <button
              onClick={() => setShowNotificationPrompt(false)}
              className="p-1 text-white/80 hover:text-white"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Container Wrapper */}
      <div className="flex-1 flex justify-center items-center overflow-hidden lg:p-4 lg:pt-0">
        <div
          className={`w-full h-full lg:max-w-[1600px] lg:h-[calc(100vh-2rem)] flex overflow-hidden shadow-2xl transition-all duration-200 lg:rounded-2xl border ${
            isDark ? 'bg-[#111b21] border-slate-800' : 'bg-white border-slate-300'
          }`}
        >
          {/* Sidebar Area */}
          <div className={`h-full ${activeContactId ? 'hidden md:flex' : 'flex w-full'}`}>
            <Sidebar
              contacts={contacts}
              activeContactId={activeContactId}
              statuses={statuses}
              callLogs={callLogs}
              allMessages={messages}
              currentUser={userProfile}
              authUser={authUser}
              theme={userProfile.theme}
              typingContactId={typingContactId}
              onSelectContact={handleSelectContact}
              onOpenNewChat={() => setIsNewChatOpen(true)}
              onOpenNewGroup={() => setIsNewGroupOpen(true)}
              onOpenStatusViewer={(index) => setStatusViewerIndex(index)}
              onOpenStatusCreator={() => setIsStatusCreatorOpen(true)}
              onStartCall={handleStartCall}
              onClearMissedCalls={handleClearMissedCalls}
              onTogglePin={handleTogglePin}
              onToggleMute={handleToggleMute}
              onToggleArchive={handleToggleArchive}
              onToggleTheme={handleToggleTheme}
              onUpdateProfile={(updated) => setUserProfile((p) => ({ ...p, ...updated }))}
              onResetData={handleResetData}
              onAuthUserUpdated={(updatedUser) => {
                setAuthUser(updatedUser);
                setUserProfile((prev) => ({
                  ...prev,
                  name: updatedUser.fullName,
                  username: updatedUser.username,
                  phone: updatedUser.phoneNormalized,
                  about: updatedUser.about,
                  avatar: updatedUser.avatarUrl || '',
                }));
              }}
              onLoggedOut={handleLoggedOut}
              onOpenQR={() => setIsQRModalOpen(true)}
              onOpenVault={() => setIsVaultModalOpen(true)}
              onOpenReminders={() => {
                setRemindersInitialTab('reminders');
                setIsRemindersModalOpen(true);
              }}
              onOpenScheduled={() => {
                setRemindersInitialTab('scheduled');
                setIsRemindersModalOpen(true);
              }}
              onOpenSecurity={() => setIsSecurityModalOpen(true)}
              onOpenGlobalSearch={() => setIsGlobalSearchModalOpen(true)}
              onOpenSharedFiles={() => setIsSharedFilesModalOpen(true)}
              onToggleInboxType={handleToggleInboxType}
            />
          </div>

          {/* Active Chat Conversation Area */}
          {activeContact ? (
            <div className={`flex-1 h-full flex overflow-hidden ${!activeContactId ? 'hidden md:flex' : 'flex'}`}>
              <ChatArea
                contact={activeContact}
                allContacts={contacts}
                messages={activeMessages}
                currentUser={userProfile}
                theme={userProfile.theme}
                isTyping={Boolean(activeContact.isTyping) || typingContactId === activeContact.id}
                onSendMessage={handleSendMessage}
                onAudioCall={() => handleStartCall(activeContact.id, 'audio')}
                onVideoCall={() => handleStartCall(activeContact.id, 'video')}
                onToggleContactInfo={() => setIsContactInfoOpen(!isContactInfoOpen)}
                onReactMessage={handleReactMessage}
                onStarMessage={handleStarMessage}
                onDeleteMessage={handleDeleteMessage}
                onVotePoll={handleVotePoll}
                onOpenImageModal={(url) => setPreviewImageModalUrl(url)}
                onOpenPollModal={() => setIsPollModalOpen(true)}
                onOpenLocationModal={() => setIsLocationModalOpen(true)}
                onTypingChange={handleTypingChange}
                onBackMobile={() => setActiveContactId(null)}
              />

              {/* Right Side Contact Info Drawer */}
              {isContactInfoOpen && (
                <ContactInfoDrawer
                  contact={activeContact}
                  allContacts={contacts}
                  currentUser={userProfile}
                  messages={activeMessages}
                  theme={userProfile.theme}
                  onClose={() => setIsContactInfoOpen(false)}
                  onAudioCall={() => handleStartCall(activeContact.id, 'audio')}
                  onVideoCall={() => handleStartCall(activeContact.id, 'video')}
                  onToggleMute={() => handleToggleMute(activeContact.id)}
                  onUpdateAvatar={(contactId, newAvatar) => {
                    setContacts((prev) =>
                      prev.map((c) => (c.id === contactId ? { ...c, avatar: newAvatar } : c))
                    );
                    const target = contacts.find((c) => c.id === contactId);
                    if (target?.isGroup) {
                      const now = new Date();
                      const timeStr = now.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });
                      setMessages((prev) => ({
                        ...prev,
                        [contactId]: [
                          ...(prev[contactId] || []),
                          {
                            id: `msg_sys_${Date.now()}`,
                            chatId: contactId,
                            senderId: 'system',
                            senderName: 'ZOLO',
                            text: newAvatar
                              ? 'You changed the group icon'
                              : 'You removed the group icon',
                            timestamp: timeStr,
                            timestampRaw: Date.now(),
                            status: 'read',
                            mediaType: 'text',
                          },
                        ],
                      }));
                    }
                  }}
                  onUpdateDisappearing={(setting) => {
                    setContacts((prev) =>
                      prev.map((c) =>
                        c.id === activeContact.id ? { ...c, disappearingMessages: setting } : c
                      )
                    );
                  }}
                />
              )}
            </div>
          ) : (
            /* ZOLO Home Welcome Dashboard */
            <div
              className={`hidden md:flex flex-1 overflow-hidden border-l ${
                isDark
                  ? 'bg-[#111b21] border-slate-800'
                  : 'bg-[#f0f2f5] border-slate-200'
              }`}
            >
              <ZoloHome
                userProfile={userProfile}
                theme={userProfile.theme}
                onNewChat={() => setIsNewChatOpen(true)}
                onOpenQR={() => setIsQRModalOpen(true)}
                onOpenVault={() => setIsVaultModalOpen(true)}
                onOpenReminders={() => {
                  setRemindersInitialTab('reminders');
                  setIsRemindersModalOpen(true);
                }}
                onOpenScheduled={() => {
                  setRemindersInitialTab('scheduled');
                  setIsRemindersModalOpen(true);
                }}
                onOpenSecurity={() => setIsSecurityModalOpen(true)}
                onOpenSharedFiles={() => setIsSharedFilesModalOpen(true)}
              />
            </div>
          )}
        </div>
      </div>

      {/* 3. MODALS */}

      {activeCall && (
        <CallModal
          callId={activeCall.callId}
          contact={activeCall.contact}
          peerPhoneNormalized={activeCall.peerPhoneNormalized}
          type={activeCall.type}
          isIncoming={activeCall.isIncoming}
          incomingOffer={activeCall.incomingOffer}
          onSendSignal={sendWsPayload}
          registerSignalListener={registerCallSignalListener}
          onClose={handleCloseCall}
        />
      )}

      {statusViewerIndex !== null && (
        <StatusViewerModal
          statuses={statuses}
          initialIndex={statusViewerIndex}
          onClose={() => setStatusViewerIndex(null)}
          onReply={handleReplyStatus}
          onStoryViewed={handleStoryViewed}
        />
      )}

      {isStatusCreatorOpen && (
        <StatusCreatorModal
          currentUser={userProfile}
          onClose={() => setIsStatusCreatorOpen(false)}
          onAddStatus={(newStatus) => {
            const enriched: StatusStory = {
              ...newStatus,
              authorPhone: authUser?.phoneNormalized,
              viewerCount: 0,
            };
            setStatuses((prev) => [enriched, ...prev.filter((s) => s.id !== enriched.id)]);

            if (authUser) {
              authApi
                .publishStatusStory({
                  storyId: enriched.id,
                  storyType: enriched.type,
                  textContent: enriched.text,
                  mediaUrl: enriched.mediaUrl,
                  caption: enriched.caption,
                  bgColor: enriched.bgColor,
                })
                .then((res) => {
                  const mapped = wireDtoToStatusStory(
                    res.story,
                    authUser.phoneNormalized,
                    userProfile.name || authUser.fullName,
                    userProfile.avatar || authUser.avatarUrl || '',
                    contactsRef.current
                  );
                  setStatuses((prev) => [
                    mapped,
                    ...prev.filter((s) => s.id !== mapped.id),
                  ]);
                })
                .catch(() => {});
            }
          }}
        />
      )}

      {isNewChatOpen && (
        <NewChatModal
          contacts={contacts}
          theme={userProfile.theme}
          onClose={() => setIsNewChatOpen(false)}
          onSelectContact={handleSelectContact}
          onOpenNewGroup={() => setIsNewGroupOpen(true)}
          onAddNewContact={(
            name,
            phoneNormalized,
            about,
            avatar,
            isRegisteredZoloUser,
            online,
            lastSeen
          ) => {
            if (authUser && phoneNormalized === authUser.phoneNormalized) {
              handleSelectContact('self');
              return;
            }

            const existing = contactsRef.current.find(
              (c) => resolveContactPhoneNormalized(c) === phoneNormalized
            );
            if (existing) {
              const updatedList = contactsRef.current.map((c) =>
                c.id === existing.id
                  ? {
                      ...c,
                      name: name || c.name,
                      phone: phoneNormalized,
                      phoneNormalized,
                      isRealContact: true,
                      isRegisteredZoloUser,
                      avatar: c.avatar || avatar,
                      about: about || c.about,
                      online,
                      lastSeen,
                    }
                  : c
              );
              contactsRef.current = updatedList;
              setContacts(updatedList);
              handleSelectContact(existing.id);
              if (authUser) {
                void hydrateStatusesAndCalls(authUser, updatedList);
              }
              return;
            }

            const newContact: Contact = {
              id: makePeerContactId(phoneNormalized),
              name,
              phone: phoneNormalized,
              phoneNormalized,
              isRealContact: true,
              isRegisteredZoloUser,
              avatar: avatar || '',
              about,
              online,
              lastSeen: online ? 'online' : lastSeen || 'recently on ZOLO',
              unreadCount: 0,
            };
            const nextContacts = [newContact, ...contactsRef.current];
            contactsRef.current = nextContacts;
            setContacts(nextContacts);
            handleSelectContact(newContact.id);
            if (authUser) {
              void hydrateStatusesAndCalls(authUser, nextContacts);
            }
          }}
        />
      )}

      {isNewGroupOpen && (
        <NewGroupModal
          contacts={contacts}
          theme={userProfile.theme}
          onClose={() => setIsNewGroupOpen(false)}
          onCreateGroup={(groupName, selectedContactIds, groupAvatar) => {
            const newGroup: Contact = {
              id: `group_${Date.now()}`,
              name: groupName,
              phone: `Group (${selectedContactIds.length + 1} members)`,
              avatar: groupAvatar || '',
              about: 'Group chat created on ZOLO',
              online: false,
              lastSeen: 'Group Members',
              isGroup: true,
              groupMembers: selectedContactIds,
              unreadCount: 0,
            };
            setContacts((prev) => [newGroup, ...prev]);
            setMessages((prev) => ({
              ...prev,
              [newGroup.id]: [
                {
                  id: `msg_sys_${Date.now()}`,
                  chatId: newGroup.id,
                  senderId: 'system',
                  senderName: 'ZOLO',
                  text: `You created group "${groupName}"`,
                  timestamp: 'Just now',
                  timestampRaw: Date.now(),
                  status: 'read',
                  mediaType: 'text',
                },
              ],
            }));
            handleSelectContact(newGroup.id);
          }}
        />
      )}

      {/* Full-Screen Image Preview Modal with Download & Close buttons */}
      {previewImageModalUrl && (
        <ImagePreviewModal
          imageUrl={previewImageModalUrl}
          theme={userProfile.theme}
          onClose={() => setPreviewImageModalUrl(null)}
        />
      )}

      {/* QR Code Profile & Scanner Modal */}
      {isQRModalOpen && (
        <QRCodeModal
          userProfile={userProfile}
          theme={userProfile.theme}
          onClose={() => setIsQRModalOpen(false)}
          onAddScannedContact={(scannedContact) => {
            if (scannedContact.name) {
              const newC: Contact = {
                id: `c_${Date.now()}`,
                name: scannedContact.name,
                phone: scannedContact.phone || '+1 (555) 000-0000',
                avatar: scannedContact.avatar || '',
                about: scannedContact.about || 'Hey there! I am using ZOLO.',
                online: true,
                lastSeen: 'online',
                isPinned: false,
                isMuted: false,
                unreadCount: 0,
                inboxType: 'personal',
              };
              setContacts((prev) => [newC, ...prev]);
              setActiveContactId(newC.id);
            }
            setIsQRModalOpen(false);
          }}
        />
      )}

      {/* ZOLO Vault Encrypted Personal Files Modal */}
      {isVaultModalOpen && (
        <ZoloVaultModal
          theme={userProfile.theme}
          onClose={() => setIsVaultModalOpen(false)}
        />
      )}

      {/* Message Reminders & Scheduled Messages Modal */}
      {isRemindersModalOpen && (
        <RemindersAndScheduledModal
          contacts={contacts}
          theme={userProfile.theme}
          initialTab={remindersInitialTab}
          onClose={() => setIsRemindersModalOpen(false)}
          onOpenChat={(cId) => {
            setIsRemindersModalOpen(false);
            setActiveContactId(cId);
          }}
          onSendScheduledNow={(cId, text) => {
            handleSendMessage(text, 'text');
          }}
        />
      )}

      {/* Security & Privacy Dashboard Modal */}
      {isSecurityModalOpen && (
        <SecurityAndPrivacyModal
          userProfile={userProfile}
          contacts={contacts}
          allMessages={messages}
          theme={userProfile.theme}
          onClose={() => setIsSecurityModalOpen(false)}
          onUpdateUserProfile={(updates) => setUserProfile((p) => ({ ...p, ...updates }))}
          onLoggedOut={handleLoggedOut}
        />
      )}

      {/* Global Search Modal */}
      {isGlobalSearchModalOpen && (
        <GlobalSearchModal
          contacts={contacts}
          messages={messages}
          theme={userProfile.theme}
          onClose={() => setIsGlobalSearchModalOpen(false)}
          onSelectChat={(cId) => {
            setIsGlobalSearchModalOpen(false);
            setActiveContactId(cId);
          }}
        />
      )}

      {/* Shared Media, Docs & Links Modal */}
      {isSharedFilesModalOpen && (
        <SharedMediaModal
          contacts={contacts}
          messages={messages}
          theme={userProfile.theme}
          onClose={() => setIsSharedFilesModalOpen(false)}
          onOpenChat={(cId) => {
            setIsSharedFilesModalOpen(false);
            setActiveContactId(cId);
          }}
          onOpenImageModal={(url) => setPreviewImageModalUrl(url)}
        />
      )}

      {isPollModalOpen && (
        <CreatePollModal
          theme={userProfile.theme}
          onClose={() => setIsPollModalOpen(false)}
          onSendPoll={(poll) => {
            handleSendMessage(poll.question, 'poll', { poll });
          }}
        />
      )}

      {isLocationModalOpen && (
        <LocationPickerModal
          theme={userProfile.theme}
          onClose={() => setIsLocationModalOpen(false)}
          onSendLocation={(loc) => {
            handleSendMessage(`Location: ${loc.name}`, 'location', { location: loc });
          }}
        />
      )}

      {/* Real-time Interactive Notification Toasts for Status Updates and New Messages */}
      <NotificationToastContainer
        notifications={notifications}
        theme={userProfile.theme}
        onDismiss={dismissNotification}
        onOpenChat={handleSelectContact}
        onOpenStatus={(statusIndex) => {
          setStatusViewerIndex(statusIndex);
        }}
      />
    </div>
  );
}
