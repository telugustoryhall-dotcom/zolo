import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/server/app.ts';
import {
  normalizeAndValidatePhone,
  normalizeAndValidateUsername,
} from '../src/server/phoneUtils.ts';
import {
  hashPassword,
  verifyPassword,
  generateRecoveryKey,
  normalizeRecoveryKey,
  hashOpaqueToken,
  verifyOpaqueTokenConstantTime,
} from '../src/server/cryptoUtils.ts';
import {
  makeConversationKey,
  saveDirectMessage,
  fetchUserDirectMessagesAndPeers,
  markUndeliveredMessagesDelivered,
  markConversationReadInDb,
  toggleMessageReactionInDb,
  voteMessagePollInDb,
  deleteDirectMessageInDb,
} from '../src/db/messagingRepository.ts';
import {
  createCallRecordInDb,
  finalizeCallRecordInDb,
  markCallAnsweredInDb,
  fetchUserCallHistory,
  createStatusStoryInDb,
  fetchVisibleStatusStories,
} from '../src/db/statusAndCallsRepository.ts';
import {
  registerUserDirect,
  loginUserByMobile,
  getSessionWithUser,
  revokeSingleSession,
  revokeAllSessionsForUser,
  AppDomainError,
} from '../src/db/repository.ts';
import {
  extractPasswordHash,
  extractRecoveryHash,
  packCompoundRecoveryHash,
} from '../src/lib/supabaseServer.ts';
import { parseMessageLinks } from '../src/utils/messageLinks.ts';
import { extractLinkMetadata, fetchSafeLinkPreview } from '../src/server/linkPreview.ts';
import { createStatusViewingSequence } from '../src/utils/statusAds.ts';
import { authApi, AuthApiClientError } from '../src/utils/authApi.ts';
import type { StatusStory } from '../src/types/chat.ts';
import type { AdvertisementCampaign } from '../src/types/ads.ts';
import {
  getAdVisitVerificationStatus,
  isAdsCampaignTableMissingError,
} from '../src/db/adsRepository.ts';

describe('Message links and preview safety', () => {
  it('enforces the full server-side timed visit and single-use expiry rules', () => {
    const startedAt = Date.parse('2026-11-13T10:00:00.000Z');
    const row = {
      started_at: new Date(startedAt).toISOString(),
      expires_at: new Date(startedAt + 30 * 60_000).toISOString(),
      completed_at: null,
      consumed_at: null,
    };

    expect(getAdVisitVerificationStatus(row, startedAt + 9_999)).toBe('too_early');
    expect(getAdVisitVerificationStatus(row, startedAt + 10_000)).toBe('eligible');
    expect(getAdVisitVerificationStatus(
      { ...row, completed_at: new Date(startedAt + 10_000).toISOString() },
      startedAt + 11_000
    )).toBe('completed');
    expect(getAdVisitVerificationStatus(
      { ...row, consumed_at: new Date(startedAt + 16_000).toISOString() },
      startedAt + 16_000
    )).toBe('consumed');
    expect(getAdVisitVerificationStatus(row, startedAt + 30 * 60_000)).toBe('expired');
  });

  describe('API connectivity and Communities access', () => {
    it('retries transient network failures for safe Ads reads', async () => {
      const fetchMock = vi.fn()
        .mockRejectedValueOnce(new TypeError('temporary network failure'))
        .mockResolvedValueOnce(new Response(JSON.stringify({ campaigns: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        await expect(authApi.listAdCampaigns()).resolves.toEqual({ campaigns: [] });
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('retries temporary gateway errors for safe Ads reads', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ campaigns: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      vi.stubGlobal('fetch', fetchMock);
      try {
        const requestPromise = authApi.listAdCampaigns();
        await vi.runAllTimersAsync();
        await expect(requestPromise).resolves.toEqual({ campaigns: [] });
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    });

    it('returns an actionable API-origin error after network retries fail', async () => {
      vi.useFakeTimers();
      const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
      vi.stubGlobal('fetch', fetchMock);
      try {
        const requestPromise = authApi.listAdCampaigns();
        const requestExpectation = expect(requestPromise).rejects.toMatchObject({
          code: 'NETWORK_ERROR',
          status: 0,
        } satisfies Partial<AuthApiClientError>);
        await vi.runAllTimersAsync();
        await requestExpectation;
        expect(fetchMock).toHaveBeenCalledTimes(6);
      } finally {
        vi.useRealTimers();
        vi.unstubAllGlobals();
      }
    });

    it('requires an authenticated session for all Community endpoints', async () => {
      const app = createApp();
      const results = await Promise.all([
        request(app).get('/api/communities'),
        request(app).post('/api/communities').send({ name: 'Test community' }),
        request(app).get('/api/communities/00000000-0000-4000-8000-000000000001'),
        request(app).post('/api/communities/00000000-0000-4000-8000-000000000001/join'),
        request(app).post(`/api/community-invites/${'a'.repeat(64)}/request`),
      ]);
      expect(results.map((result) => result.status)).toEqual([401, 401, 401, 401, 401]);
    });
  });

  it('prefers Open Graph and Twitter metadata with safe title fallbacks', () => {
    const metadata = extractLinkMetadata(
      '<html><head><title>Document title</title><meta property="og:title" content="Open Graph title"><meta name="twitter:description" content="Card description"><meta property="og:image" content="/preview.webp"></head></html>',
      new URL('https://example.com/articles/one')
    );
    expect(metadata).toEqual({
      title: 'Open Graph title',
      description: 'Card description',
      imageUrl: 'https://example.com/preview.webp',
    });

    expect(extractLinkMetadata('<title>Fallback</title>', new URL('https://example.com/')).title)
      .toBe('Fallback');
  });

  it('only enables local Ads fallback when the campaign table is missing', () => {
    expect(isAdsCampaignTableMissingError({
      code: 'PGRST205',
      message: "Could not find the table 'public.ad_campaigns' in the schema cache",
    })).toBe(true);
    expect(isAdsCampaignTableMissingError({
      code: 'PGRST205',
      message: "Could not find the table 'public.ad_events' in the schema cache",
    })).toBe(false);
    expect(isAdsCampaignTableMissingError({
      code: '42501',
      message: 'permission denied',
    })).toBe(false);
  });

  it('links multiple HTTP, HTTPS, and www URLs without consuming punctuation', () => {
    const text = 'Try https://example.com/a?x=1, www.example.org and http://example.net!';
    const links = parseMessageLinks(text);
    expect(links.map((link) => link.href)).toEqual([
      'https://example.com/a?x=1',
      'https://www.example.org/',
      'http://example.net/',
    ]);
    expect(text.slice(links[0].end, links[1].start)).toBe(', ');
    expect(text.slice(links[2].end)).toBe('!');
  });

  it('does not convert unsafe schemes or credential-bearing URLs into links', () => {
    expect(parseMessageLinks('javascript:alert(1) data:text/html,hi https://user:pass@example.com')).toEqual([]);
  });

  it('rejects link previews targeting loopback/private addresses', async () => {
    await expect(fetchSafeLinkPreview('http://127.0.0.1/admin')).rejects.toThrow(/non-public/i);
    await expect(fetchSafeLinkPreview('https://[::1]/')).rejects.toThrow(/non-public/i);
  });

  it('inserts one sponsored story after each five organic stories without counting ads', () => {
    const stories = Array.from({ length: 11 }, (_, index) => ({
      id: `story-${index}`,
      contactId: 'contact',
      contactName: 'Contact',
      contactAvatar: '',
      timestamp: 'now',
      timestampRaw: index,
      type: 'text' as const,
      text: `Story ${index}`,
      viewed: false,
    })) satisfies StatusStory[];
    const campaigns = ['one', 'two'].map((id) => ({
      id,
      advertiserPhone: '+919876500001',
      title: id,
      advertiserName: 'Business',
      imageUrl: '/ad.jpg',
      body: 'Ad body',
      subtitle: '',
      destinationUrl: 'https://example.com/',
      ctaText: 'Visit',
      logoUrl: null,
      status: 'approved' as const,
      moderationNote: null,
      createdAt: '',
      updatedAt: '',
    })) satisfies AdvertisementCampaign[];

    const sequence = createStatusViewingSequence(stories, 0, campaigns);
    expect(sequence.map((story) => story.id)).toEqual([
      'story-0', 'story-1', 'story-2', 'story-3', 'story-4',
      'sponsored_one',
      'story-5', 'story-6', 'story-7', 'story-8', 'story-9',
      'sponsored_two',
      'story-10',
    ]);
    expect(createStatusViewingSequence(stories, 7, []).map((story) => story.id)).toEqual([
      'story-7', 'story-8', 'story-9', 'story-10',
    ]);
  });
});

describe('ZOLO Mobile Number & Authentication Engine', () => {
  it('normalizes valid Indian mobile numbers to E.164 canonical format', () => {
    const res1 = normalizeAndValidatePhone('9876543210', 'IN', '+91');
    expect(res1.valid).toBe(true);
    expect(res1.e164).toBe('+919876543210');

    const res2 = normalizeAndValidatePhone('+91 7032589898');
    expect(res2.valid).toBe(true);
    expect(res2.e164).toBe('+917032589898');
  });

  it('rejects invalid, malformed, or letters in mobile numbers', () => {
    const res1 = normalizeAndValidatePhone('12345', 'IN', '+91');
    expect(res1.valid).toBe(false);

    const res2 = normalizeAndValidatePhone('9876abcde', 'IN', '+91');
    expect(res2.valid).toBe(false);

    const res3 = normalizeAndValidatePhone('1876543210', 'IN', '+91'); // invalid Indian prefix
    expect(res3.valid).toBe(false);
  });

  it('normalizes international mobile numbers correctly', () => {
    const usRes = normalizeAndValidatePhone('4155552671', 'US', '+1');
    expect(usRes.valid).toBe(true);
    expect(usRes.e164).toBe('+14155552671');

    const ukRes = normalizeAndValidatePhone('+447911123456');
    expect(ukRes.valid).toBe(true);
    expect(ukRes.e164).toBe('+447911123456');
  });

  it('hashes passwords using scrypt and verifies in constant time', () => {
    const pass = 'superSecretPass123';
    const hash = hashPassword(pass);
    expect(hash.startsWith('scrypt:')).toBe(true);

    const valid = verifyPassword(pass, hash);
    expect(valid).toBe(true);

    const invalid = verifyPassword('wrongPass', hash);
    expect(invalid).toBe(false);
  });

  it('generates ZOLO-XXXX-XXXX-XXXX recovery keys and normalizes cleanly', () => {
    const key = generateRecoveryKey();
    expect(key).toMatch(/^ZOLO-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const normalized = normalizeRecoveryKey('  zolo-abcd-efgh-1234  ');
    expect(normalized).toBe('ZOLO-ABCD-EFGH-1234');
  });

  it('packs and extracts compound recovery key and password hashes safely', () => {
    const rawRecHash = hashOpaqueToken('ZOLO-TEST-1234-5678');
    const pwdHash = hashPassword('myPassword123');
    const packed = packCompoundRecoveryHash(rawRecHash, pwdHash);

    const extractedPwd = extractPasswordHash({ recovery_key_hash: packed });
    expect(extractedPwd).toBe(pwdHash);

    const extractedRec = extractRecoveryHash(packed);
    expect(extractedRec).toBe(rawRecHash);
  });
});

describe('ZOLO Real-Time Direct Messaging Repository', () => {
  const userA = '+919876500001';
  const userB = '+919876500002';
  const testMsgId = `test_msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  it('creates symmetric, canonical conversation keys regardless of sender/recipient order', () => {
    const key1 = makeConversationKey(userA, userB);
    const key2 = makeConversationKey(userB, userA);
    expect(key1).toBe(key2);
    expect(key1).toBe('+919876500001::+919876500002');
  });

  it('saves direct messages with full payload and idempotent persistence', async () => {
    const saved = await saveDirectMessage({
      messageId: testMsgId,
      senderPhone: userA,
      senderName: 'Sender User',
      senderAvatar: null,
      recipientPhone: userB,
      text: 'Hello from automated test!',
      mediaType: 'text',
      payload: {},
      initialStatus: 'sent',
    });

    expect(saved.messageId).toBe(testMsgId);
    expect(saved.senderPhone).toBe(userA);
    expect(saved.recipientPhone).toBe(userB);
    expect(saved.status).toBe('sent');

    // Duplicate insert does not crash or corrupt
    const duplicate = await saveDirectMessage({
      messageId: testMsgId,
      senderPhone: userA,
      senderName: 'Sender User',
      senderAvatar: null,
      recipientPhone: userB,
      text: 'Hello again',
      mediaType: 'text',
      payload: {},
      initialStatus: 'sent',
    });
    expect(duplicate.messageId).toBe(testMsgId);
  });

  it('fetches inbox messages accurately for both conversation participants', async () => {
    const inboxA = await fetchUserDirectMessagesAndPeers(userA);
    expect(inboxA.messages.some((m) => m.messageId === testMsgId)).toBe(true);

    const inboxB = await fetchUserDirectMessagesAndPeers(userB);
    expect(inboxB.messages.some((m) => m.messageId === testMsgId)).toBe(true);
  });

  it('marks undelivered messages as delivered when recipient comes online', async () => {
    const receipts = await markUndeliveredMessagesDelivered(userB);
    const hasSender = receipts.some((r) => r.senderPhone === userA && r.messageIds.includes(testMsgId));
    expect(hasSender).toBe(true);
  });

  it('marks messages read when recipient opens conversation', async () => {
    const readIds = await markConversationReadInDb(userB, userA);
    expect(readIds.includes(testMsgId)).toBe(true);
  });

  it('supports toggle reactions on direct messages', async () => {
    const reacted = await toggleMessageReactionInDb({
      messageId: testMsgId,
      actorPhone: userB,
      actorName: 'Recipient User',
      emoji: '👍',
    });

    expect(reacted).not.toBeNull();
    const thumbsReaction = reacted?.payload.reactions?.find((r) => r.emoji === '👍');
    expect(thumbsReaction?.count).toBe(1);

    // Toggle off
    const unreacted = await toggleMessageReactionInDb({
      messageId: testMsgId,
      actorPhone: userB,
      actorName: 'Recipient User',
      emoji: '👍',
    });
    const remaining = unreacted?.payload.reactions?.find((r) => r.emoji === '👍');
    expect(remaining).toBeUndefined();
  });

  it('supports voting and un-voting on poll messages', async () => {
    const pollMsgId = `poll_${Date.now()}`;
    await saveDirectMessage({
      messageId: pollMsgId,
      senderPhone: userA,
      senderName: 'Sender User',
      senderAvatar: null,
      recipientPhone: userB,
      text: 'Poll Question',
      mediaType: 'poll',
      payload: {
        poll: {
          question: 'Do you like ZOLO?',
          options: [
            { id: 'opt_1', text: 'Yes', votes: 0, voterNames: [] },
            { id: 'opt_2', text: 'Love it', votes: 0, voterNames: [] },
          ],
          allowMultipleAnswers: false,
        },
      },
      initialStatus: 'sent',
    });

    const voted = await voteMessagePollInDb({
      messageId: pollMsgId,
      actorPhone: userB,
      voterName: 'Recipient User',
      optionId: 'opt_1',
    });

    const opt1 = voted?.payload.poll?.options.find((o) => o.id === 'opt_1');
    expect(opt1?.votes).toBe(1);
    expect(opt1?.voterNames).toContain('Recipient User');
  });

  it('deletes messages for everyone safely with authorization check', async () => {
    // Unauthorized actor cannot delete
    const denied = await deleteDirectMessageInDb(testMsgId, '+919999999999');
    expect(denied).toBeNull();

    // Authorized sender can delete
    const deleted = await deleteDirectMessageInDb(testMsgId, userA);
    expect(deleted?.messageId).toBe(testMsgId);
  });
});

describe('ZOLO Internet Calling & Status Stories Persistence', () => {
  const caller = '+919876500010';
  const callee = '+919876500020';
  const callId = `call_${Date.now()}`;

  it('creates call records with initial ringing state', async () => {
    const call = await createCallRecordInDb({
      callId,
      callerPhone: caller,
      callerName: 'Caller',
      callerAvatar: null,
      calleePhone: callee,
      calleeName: 'Callee',
      calleeAvatar: null,
      callType: 'video',
      initialOutcome: 'ringing',
    });

    expect(call.callId).toBe(callId);
    expect(call.outcome).toBe('ringing');
    expect(call.callType).toBe('video');
  });

  it('finalizes call records with accurate outcome and duration', async () => {
    await markCallAnsweredInDb(callId);
    const finalized = await finalizeCallRecordInDb({
      callId,
      outcome: 'answered',
      durationSeconds: 42,
    });

    expect(finalized?.outcome).toBe('answered');
    expect(finalized?.durationSeconds).toBe(42);
  });

  it('fetches call history for participants', async () => {
    const history = await fetchUserCallHistory(caller);
    expect(history.some((c) => c.callId === callId)).toBe(true);
  });

  it('publishes and retrieves 24-hour status stories', async () => {
    const storyId = `st_${Date.now()}`;
    const story = await createStatusStoryInDb({
      storyId,
      authorPhone: caller,
      authorName: 'Status Author',
      authorAvatar: null,
      storyType: 'text',
      textContent: 'Status from test',
      bgColor: '#005c4b',
    });

    expect(story.storyId).toBe(storyId);
    expect(story.authorPhone).toBe(caller);

    const feed = await fetchVisibleStatusStories({
      viewerPhone: callee,
      contactPhones: [caller],
    });

    expect(feed.some((s) => s.storyId === storyId)).toBe(true);
  });
});

describe('ZOLO HTTP Server & Authentication Flow', () => {
  const app = createApp({ disableRateLimit: true });
  const uniqueTestPhone = `+91987${Math.floor(1000000 + Math.random() * 9000000)}`;
  let sessionToken = '';

  it('GET /api/health returns 200 with database health status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
  });

  it('GET /api/config returns public client configuration and ICE servers', async () => {
    const res = await request(app).get('/api/config');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.iceServers)).toBe(true);
    expect(res.body.iceServers.length).toBeGreaterThan(0);
  });

  it('POST /api/auth/signup registers a new lifetime account with password', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      fullName: 'Test User',
      phone: uniqueTestPhone,
      countryIso: 'IN',
      dialCode: '+91',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.user.phoneNormalized).toBe(uniqueTestPhone);
    expect(typeof res.body.recoveryKey).toBe('string');
    expect(typeof res.body.sessionToken).toBe('string');
    sessionToken = res.body.sessionToken;
  });

  it('POST /api/auth/signup rejects duplicate mobile numbers with 409', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      fullName: 'Duplicate User',
      phone: uniqueTestPhone,
      countryIso: 'IN',
      dialCode: '+91',
      password: 'password123',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_ALREADY_REGISTERED');
  });

  it('POST /api/auth/login validates password and restores session', async () => {
    // Valid password
    const resOk = await request(app).post('/api/auth/login').send({
      phone: uniqueTestPhone,
      countryIso: 'IN',
      dialCode: '+91',
      password: 'password123',
    });
    expect(resOk.status).toBe(200);
    expect(resOk.body.user.phoneNormalized).toBe(uniqueTestPhone);

    // Invalid password
    const resBad = await request(app).post('/api/auth/login').send({
      phone: uniqueTestPhone,
      countryIso: 'IN',
      dialCode: '+91',
      password: 'wrongPassword!',
    });
    expect(resBad.status).toBe(401);
    expect(resBad.body.code).toBe('INVALID_PASSWORD');
  });

  it('GET /api/account/me verifies authenticated session token', async () => {
    const res = await request(app)
      .get('/api/account/me')
      .set('x-session-token', sessionToken);

    expect(res.status).toBe(200);
    expect(res.body.user.phoneNormalized).toBe(uniqueTestPhone);
  });

  it('GET /api/account/me rejects requests without valid session with 401', async () => {
    const res = await request(app).get('/api/account/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });
});

describe('ZOLO Real-Time WebSocket Messaging & WebRTC Signaling Between Two Accounts', () => {
  let userAToken: string;
  let userBToken: string;
  let userAPhone: string;
  let userBPhone: string;
  const app = createApp({ disableRateLimit: true });

  beforeEach(async () => {
    userAPhone = `+91981${Math.floor(1000000 + Math.random() * 9000000)}`;
    userBPhone = `+91982${Math.floor(1000000 + Math.random() * 9000000)}`;

    const resA = await request(app).post('/api/auth/signup').send({
      fullName: 'Alice Test',
      phone: userAPhone,
      countryIso: 'IN',
      dialCode: '+91',
      password: 'passwordAlice123',
    });
    userAToken = resA.body.sessionToken;

    const resB = await request(app).post('/api/auth/signup').send({
      fullName: 'Bob Test',
      phone: userBPhone,
      countryIso: 'IN',
      dialCode: '+91',
      password: 'passwordBob123',
    });
    userBToken = resB.body.sessionToken;
  });

  it('delivers real-time message to recipient over WebSocket without refreshing', async () => {
    const { createServer } = await import('node:http');
    const { WebSocket } = await import('ws');
    const { attachRealtimeHub } = await import('../src/server/realtimeHub.ts');

    const httpServer = createServer(app);
    attachRealtimeHub(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = httpServer.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${addr.port}/ws`;

    // Connect User B
    const wsB = new WebSocket(`${wsUrl}?token=${userBToken}`);
    await new Promise<void>((resolve) => {
      wsB.on('open', () => resolve());
    });

    const receivedPromise = new Promise<Record<string, unknown>>((resolve) => {
      wsB.on('message', (data) => {
        const parsed = JSON.parse(String(data));
        if (parsed.type === 'message:new') {
          resolve(parsed);
        }
      });
    });

    // User A sends message to User B via HTTP API
    const msgRes = await request(app)
      .post('/api/messages/send')
      .set('x-session-token', userAToken)
      .send({
        recipientPhone: userBPhone,
        text: 'Hello Bob in real-time!',
        mediaType: 'text',
      });

    expect(msgRes.status).toBe(201);
    expect(msgRes.body.message.text).toBe('Hello Bob in real-time!');

    // User B receives the event live over WebSocket
    const receivedEvent = await receivedPromise;
    expect(receivedEvent.type).toBe('message:new');
    expect((receivedEvent as any).message.text).toBe('Hello Bob in real-time!');
    expect((receivedEvent as any).message.senderPhone).toBe(userAPhone);

    wsB.close();
    httpServer.close();
  });

  it('completes WebRTC call signaling flow (offer -> incoming -> answer -> accepted -> ice -> hangup)', { timeout: 15000 }, async () => {
    const { createServer } = await import('node:http');
    const { WebSocket } = await import('ws');
    const { attachRealtimeHub } = await import('../src/server/realtimeHub.ts');

    const httpServer = createServer(app);
    attachRealtimeHub(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = httpServer.address() as { port: number };
    const wsUrl = `ws://127.0.0.1:${addr.port}/ws`;

    const wsA = new WebSocket(`${wsUrl}?token=${userAToken}`);
    const wsB = new WebSocket(`${wsUrl}?token=${userBToken}`);

    await Promise.all([
      new Promise<void>((res) => wsA.on('open', () => res())),
      new Promise<void>((res) => wsB.on('open', () => res())),
    ]);

    const testCallId = `call_test_${Date.now()}`;
    const dummySdpOffer = { type: 'offer', sdp: 'v=0\r\no=alice ...' } as RTCSessionDescriptionInit;
    const dummySdpAnswer = { type: 'answer', sdp: 'v=0\r\no=bob ...' } as RTCSessionDescriptionInit;
    const dummyIce = { candidate: 'candidate:1 1 UDP ...', sdpMid: '0', sdpMLineIndex: 0 };

    // 1. User B waits for incoming call
    const incomingPromise = new Promise<any>((resolve) => {
      wsB.on('message', (d) => {
        const msg = JSON.parse(String(d));
        if (msg.type === 'call:incoming') resolve(msg);
      });
    });

    // 2. User A waits for call accepted
    const acceptedPromise = new Promise<any>((resolve) => {
      wsA.on('message', (d) => {
        const msg = JSON.parse(String(d));
        if (msg.type === 'call:accepted') resolve(msg);
      });
    });

    // 3. User B waits for ICE candidate
    const icePromise = new Promise<any>((resolve) => {
      wsB.on('message', (d) => {
        const msg = JSON.parse(String(d));
        if (msg.type === 'call:ice') resolve(msg);
      });
    });

    // User A initiates call
    wsA.send(
      JSON.stringify({
        type: 'call:offer',
        callId: testCallId,
        toPhone: userBPhone,
        callType: 'video',
        sdpOffer: dummySdpOffer,
      })
    );

    const incoming = await incomingPromise;
    expect(incoming.callId).toBe(testCallId);
    expect(incoming.callerPhone).toBe(userAPhone);
    expect(incoming.callType).toBe('video');

    // User B answers call
    wsB.send(
      JSON.stringify({
        type: 'call:answer',
        callId: testCallId,
        toPhone: userAPhone,
        sdpAnswer: dummySdpAnswer,
      })
    );

    const accepted = await acceptedPromise;
    expect(accepted.callId).toBe(testCallId);
    expect(accepted.calleePhone).toBe(userBPhone);

    // User A sends ICE candidate
    wsA.send(
      JSON.stringify({
        type: 'call:ice',
        callId: testCallId,
        toPhone: userBPhone,
        candidate: dummyIce,
      })
    );

    const iceRecv = await icePromise;
    expect(iceRecv.callId).toBe(testCallId);
    expect(iceRecv.candidate.candidate).toBe(dummyIce.candidate);

    // User A hangs up
    const endedPromise = new Promise<any>((resolve) => {
      wsB.on('message', (d) => {
        const msg = JSON.parse(String(d));
        if (msg.type === 'call:ended') resolve(msg);
      });
    });

    wsA.send(
      JSON.stringify({
        type: 'call:hangup',
        callId: testCallId,
        toPhone: userBPhone,
        durationSeconds: 15,
        wasConnected: true,
      })
    );

    const ended = await endedPromise;
    expect(ended.callId).toBe(testCallId);
    expect(ended.outcome).toBe('answered');
    expect(ended.durationSeconds).toBe(15);

    wsA.close();
    wsB.close();
    httpServer.close();
  });
});
