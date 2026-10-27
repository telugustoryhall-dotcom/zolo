import type {
  ActiveSessionInfo,
  ApiErrorShape,
  AuthenticatedUser,
  CallRecordWireDto,
  ContactLookupResponse,
  DirectMessageRichPayload,
  DirectMessageWireDto,
  PersistedChatBundle,
  StatusStoryWireDto,
  ZoloPeerProfile,
} from '../types/auth';

const SESSION_FALLBACK_KEY = 'zolo_active_session_token';

let inMemorySessionToken: string | null = null;

export function getClientSessionToken(): string | null {
  if (inMemorySessionToken) return inMemorySessionToken;
  try {
    return sessionStorage.getItem(SESSION_FALLBACK_KEY);
  } catch {
    return null;
  }
}

export function setClientSessionToken(token: string | null): void {
  inMemorySessionToken = token;
  try {
    if (token) {
      sessionStorage.setItem(SESSION_FALLBACK_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_FALLBACK_KEY);
    }
  } catch {
    // Ignore storage restriction errors
  }
}

export function buildRealtimeWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getClientSessionToken();
  const base = `${protocol}//${window.location.host}/ws`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

export class AuthApiClientError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly phoneNormalized?: string;

  constructor(info: ApiErrorShape) {
    super(info.error);
    this.name = 'AuthApiClientError';
    this.status = info.status;
    this.code = info.code;
    this.phoneNormalized = info.phoneNormalized;
  }
}

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const fallbackToken = getClientSessionToken();
  if (fallbackToken && !headers.has('x-session-token')) {
    headers.set('x-session-token', fallbackToken);
  }
  if (!(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
    });
  } catch {
    throw new AuthApiClientError({
      status: 0,
      code: 'NETWORK_ERROR',
      error: 'Network connection error. Please check your internet connection and try again.',
    });
  }

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    throw new AuthApiClientError({
      status: response.status,
      code: typeof data.code === 'string' ? data.code : undefined,
      error:
        typeof data.error === 'string'
          ? data.error
          : response.status === 404
          ? 'Account not found. Please create an account to get started.'
          : response.status === 401
          ? 'Incorrect credentials or session expired. Please check your mobile number and password.'
          : `Request failed (HTTP ${response.status}). Please try again.`,
      phoneNormalized:
        typeof data.phoneNormalized === 'string' ? data.phoneNormalized : undefined,
    });
  }

  return data as T;
}

export const authApi = {
  async uploadAvatar(file: Blob, fileName = 'avatar.webp'): Promise<{ url: string }> {
    const formData = new FormData();
    formData.append('avatar', file, fileName);
    return apiFetch<{ url: string }>('/api/upload/avatar', {
      method: 'POST',
      body: formData,
    });
  },

  async signupWithMobile(params: {
    fullName: string;
    phone: string;
    countryIso: string;
    dialCode: string;
    password: string;
    avatarUrl?: string | null;
  }): Promise<{
    user: AuthenticatedUser;
    sessionToken: string;
    recoveryKey: string;
    chatState: PersistedChatBundle | null;
  }> {
    const res = await apiFetch<{
      user: AuthenticatedUser;
      sessionToken: string;
      recoveryKey: string;
      chatState: PersistedChatBundle | null;
    }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    setClientSessionToken(res.sessionToken);
    return res;
  },

  async loginWithMobile(params: {
    phone: string;
    countryIso: string;
    dialCode: string;
    password: string;
  }): Promise<{
    user: AuthenticatedUser;
    sessionToken: string;
    chatState: PersistedChatBundle | null;
  }> {
    const res = await apiFetch<{
      user: AuthenticatedUser;
      sessionToken: string;
      chatState: PersistedChatBundle | null;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    setClientSessionToken(res.sessionToken);
    return res;
  },

  async recoverAccount(params: {
    oldPhone: string;
    oldCountryIso: string;
    oldDialCode: string;
    recoveryKey?: string;
    firebaseIdToken?: string;
    newPhone: string;
    newCountryIso: string;
    newDialCode: string;
    newPassword?: string;
  }): Promise<{
    user: AuthenticatedUser;
    sessionToken: string;
    recoveryKey: string;
    chatState: PersistedChatBundle | null;
  }> {
    const res = await apiFetch<{
      user: AuthenticatedUser;
      sessionToken: string;
      recoveryKey: string;
      chatState: PersistedChatBundle | null;
    }>('/api/auth/recover', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    setClientSessionToken(res.sessionToken);
    return res;
  },

  async changePassword(params: {
    currentPassword?: string;
    newPassword: string;
  }): Promise<{ user: AuthenticatedUser }> {
    return apiFetch('/api/account/password', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async getMe(): Promise<{
    user: AuthenticatedUser;
    currentSessionId: string;
    chatState: PersistedChatBundle | null;
  }> {
    return apiFetch('/api/account/me');
  },

  async updateProfile(updates: {
    fullName?: string;
    about?: string;
    avatarUrl?: string | null;
  }): Promise<{ user: AuthenticatedUser }> {
    return apiFetch('/api/account/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async changePhoneNumber(params: {
    newPhone: string;
    countryIso: string;
    dialCode: string;
  }): Promise<{ user: AuthenticatedUser }> {
    return apiFetch('/api/account/phone/change', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async linkGoogleRecovery(firebaseIdToken: string): Promise<{ user: AuthenticatedUser }> {
    return apiFetch('/api/account/link-google', {
      method: 'POST',
      body: JSON.stringify({ firebaseIdToken }),
    });
  },

  async saveChatState(chatState: PersistedChatBundle): Promise<{ saved: boolean }> {
    return apiFetch('/api/account/chat-state', {
      method: 'PUT',
      body: JSON.stringify({ chatState }),
    });
  },

  // Real Contact Lookup & Messaging APIs
  async lookupContactByPhone(params: {
    phone: string;
    countryIso: string;
    dialCode: string;
  }): Promise<ContactLookupResponse> {
    return apiFetch('/api/contacts/lookup', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async lookupContactsBatch(phones: string[]): Promise<{ contacts: ContactLookupResponse[] }> {
    return apiFetch('/api/contacts/lookup', {
      method: 'POST',
      body: JSON.stringify({ phones }),
    });
  },

  async searchZoloDirectory(query: string): Promise<{ users: ZoloPeerProfile[] }> {
    return apiFetch(`/api/contacts/search?q=${encodeURIComponent(query)}`);
  },

  async fetchInbox(): Promise<{
    messages: DirectMessageWireDto[];
    peers: ZoloPeerProfile[];
  }> {
    return apiFetch('/api/messages/inbox');
  },

  async sendDirectMessage(params: {
    messageId: string;
    recipientPhone: string;
    countryIso?: string;
    dialCode?: string;
    text: string;
    mediaType: DirectMessageWireDto['mediaType'];
    payload?: DirectMessageRichPayload;
  }): Promise<{
    message: DirectMessageWireDto;
    recipientRegistered: boolean;
    recipientProfile: ZoloPeerProfile | null;
  }> {
    return apiFetch('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async markPeerMessagesRead(peerPhone: string): Promise<{
    updatedCount: number;
    messageIds: string[];
  }> {
    return apiFetch('/api/messages/read', {
      method: 'POST',
      body: JSON.stringify({ peerPhone }),
    });
  },

  async reactDirectMessage(
    messageId: string,
    emoji: string
  ): Promise<{ message: DirectMessageWireDto }> {
    return apiFetch(`/api/messages/${encodeURIComponent(messageId)}/react`, {
      method: 'PATCH',
      body: JSON.stringify({ emoji }),
    });
  },

  async voteDirectPoll(
    messageId: string,
    optionId: string
  ): Promise<{ message: DirectMessageWireDto }> {
    return apiFetch(`/api/messages/${encodeURIComponent(messageId)}/poll-vote`, {
      method: 'PATCH',
      body: JSON.stringify({ optionId }),
    });
  },

  async deleteDirectMessage(messageId: string): Promise<{ deleted: boolean }> {
    return apiFetch(`/api/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
  },

  // Shared 24h Status Stories APIs
  async fetchStatusFeed(contactPhones: string[]): Promise<{ stories: StatusStoryWireDto[] }> {
    return apiFetch('/api/statuses/feed', {
      method: 'POST',
      body: JSON.stringify({ contactPhones }),
    });
  },

  async publishStatusStory(params: {
    storyId: string;
    storyType: 'text' | 'image';
    textContent?: string;
    mediaUrl?: string;
    caption?: string;
    bgColor?: string;
  }): Promise<{ story: StatusStoryWireDto }> {
    return apiFetch('/api/statuses', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async markStatusStoryViewed(storyId: string): Promise<{ story: StatusStoryWireDto | null }> {
    return apiFetch(`/api/statuses/${encodeURIComponent(storyId)}/view`, {
      method: 'POST',
    });
  },

  // Real Internet Audio/Video Call History & Missed Calls APIs
  async fetchCallHistory(): Promise<{ calls: CallRecordWireDto[] }> {
    return apiFetch('/api/calls/history');
  },

  async markMissedCallsSeen(): Promise<{ updatedCount: number }> {
    return apiFetch('/api/calls/mark-missed-seen', {
      method: 'POST',
    });
  },

  async listSessions(): Promise<{ sessions: ActiveSessionInfo[] }> {
    return apiFetch('/api/account/sessions');
  },

  async logoutCurrentDevice(): Promise<void> {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setClientSessionToken(null);
    }
  },

  async logoutAllDevices(): Promise<{ revokedCount: number }> {
    try {
      return await apiFetch('/api/auth/logout-all', { method: 'POST' });
    } finally {
      setClientSessionToken(null);
    }
  },

  async deleteAccountPermanently(): Promise<void> {
    await apiFetch('/api/account', {
      method: 'DELETE',
      body: JSON.stringify({ confirmPhrase: 'DELETE' }),
    });
    setClientSessionToken(null);
  },
};
