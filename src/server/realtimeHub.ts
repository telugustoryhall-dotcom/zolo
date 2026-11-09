import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { getSessionWithUser } from '../db/repository.ts';
import { lookupRegisteredUsersByPhones } from '../db/messagingRepository.ts';
import {
  type CallRecordWireDto,
  type StatusStoryWireDto,
  createCallRecordInDb,
  finalizeCallRecordInDb,
  markCallAnsweredInDb,
  createGroupCallRecordInDb,
  updateCallParticipantStatusInDb,
} from '../db/statusAndCallsRepository.ts';
import { SESSION_COOKIE_NAME } from '../middleware/auth.ts';
import type { DirectMessageDto, PeerDirectoryProfile } from '../db/messagingRepository.ts';
import type { GroupConversationWireDto, GroupMessageWireDto } from '../types/auth.ts';

export type ServerRealtimeEvent =
  | {
      type: 'connected';
      phoneNormalized: string;
      onlinePhones: string[];
    }
  | {
      type: 'message:new';
      message: DirectMessageDto;
      senderProfile: PeerDirectoryProfile;
    }
  | {
      type: 'message:status';
      peerPhone: string;
      messageIds: string[];
      status: 'delivered' | 'read';
    }
  | {
      type: 'message:updated';
      message: DirectMessageDto;
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
      type: 'scheduled:executed';
      scheduleId: string;
    }
  | {
      type: 'pong';
    };

type ClientWsInbound =
  | {
      type: 'typing';
      toPhone: string;
      isTyping: boolean;
    }
  | {
      type: 'call:offer';
      callId: string;
      toPhone: string;
      callType: 'audio' | 'video';
      sdpOffer: RTCSessionDescriptionInit;
    }
  | {
      type: 'call:answer';
      callId: string;
      toPhone: string;
      sdpAnswer: RTCSessionDescriptionInit;
    }
  | {
      type: 'call:ice';
      callId: string;
      toPhone: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      type: 'call:reject';
      callId: string;
      toPhone: string;
      reason?: 'rejected' | 'busy';
    }
  | {
      type: 'call:hangup';
      callId: string;
      toPhone: string;
      durationSeconds?: number;
      wasConnected?: boolean;
    }
  | {
      type: 'call:group-start';
      callId: string;
      groupId: string;
      groupName: string;
      groupAvatar?: string | null;
      callType: 'audio' | 'video';
      memberPhones: string[];
    }
  | {
      type: 'call:group-join';
      callId: string;
      groupId: string;
    }
  | {
      type: 'call:group-signal';
      callId: string;
      toPhone: string;
      signalType: 'offer' | 'answer';
      sdp: RTCSessionDescriptionInit;
    }
  | {
      type: 'call:group-ice';
      callId: string;
      toPhone: string;
      candidate: RTCIceCandidateInit;
    }
  | {
      type: 'call:group-toggle-media';
      callId: string;
      isMuted?: boolean;
      isVideoOff?: boolean;
    }
  | {
      type: 'call:group-leave';
      callId: string;
    }
  | {
      type: 'call:group-reject';
      callId: string;
    }
  | {
      type: 'call:group-end';
      callId: string;
    }
  | {
      type: 'call:group-query-active';
      groupId: string;
    }
  | {
      type: 'ping';
    };

interface ActiveCallState {
  callId: string;
  callerPhone: string;
  calleePhone: string;
  callType: 'audio' | 'video';
  status: 'ringing' | 'answered';
  startedAtMs: number;
  answeredAtMs: number | null;
  ringTimeout: ReturnType<typeof setTimeout> | null;
}

export interface ActiveGroupParticipant {
  phone: string;
  name: string;
  avatar: string | null;
  role: 'host' | 'member';
  joinedAtMs: number;
  isMuted: boolean;
  isVideoOff: boolean;
}

export interface ActiveGroupCallState {
  callId: string;
  groupId: string;
  groupName: string;
  groupAvatar: string | null;
  hostPhone: string;
  hostName: string;
  hostAvatar: string | null;
  callType: 'audio' | 'video';
  status: 'active' | 'ended';
  startedAtMs: number;
  memberPhones: Set<string>;
  participants: Map<string, ActiveGroupParticipant>;
}

function parseCookiesFromHeader(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = decodeURIComponent(part.slice(idx + 1).trim());
      result[key] = val;
    }
  }
  return result;
}

function extractWsSessionToken(req: IncomingMessage): string | null {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    const queryToken = url.searchParams.get('token');
    if (queryToken && queryToken.trim().length > 0) {
      return queryToken.trim();
    }
  } catch {
    // Ignore malformed URL
  }

  const cookies = parseCookiesFromHeader(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }

  return null;
}

class RealtimeHub {
  private socketsByPhone = new Map<string, Set<WebSocket>>();
  private lastSeenByPhone = new Map<string, string>();
  private activeCalls = new Map<string, ActiveCallState>();
  private activeGroupCalls = new Map<string, ActiveGroupCallState>();

  isPhoneOnline(phoneNormalized: string): boolean {
    const set = this.socketsByPhone.get(phoneNormalized);
    return Boolean(set && set.size > 0);
  }

  getOnlinePhones(): string[] {
    const list: string[] = [];
    for (const [phone, set] of this.socketsByPhone.entries()) {
      if (set.size > 0) list.push(phone);
    }
    return list;
  }

  getPresence(phoneNormalized: string): { online: boolean; lastSeen: string } {
    if (this.isPhoneOnline(phoneNormalized)) {
      return { online: true, lastSeen: 'online' };
    }
    const last = this.lastSeenByPhone.get(phoneNormalized);
    if (last) {
      const timeStr = new Date(last).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      return { online: false, lastSeen: `last seen at ${timeStr}` };
    }
    return { online: false, lastSeen: 'Registered on ZOLO' };
  }

  sendToPhone(phoneNormalized: string, event: ServerRealtimeEvent): boolean {
    const set = this.socketsByPhone.get(phoneNormalized);
    if (!set || set.size === 0) return false;

    const payload = JSON.stringify(event);
    let sentCount = 0;
    for (const ws of set) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
        sentCount++;
      }
    }
    return sentCount > 0;
  }

  sendToPhones(phones: Iterable<string>, event: ServerRealtimeEvent): void {
    const seen = new Set<string>();
    for (const p of phones) {
      if (!p || seen.has(p)) continue;
      seen.add(p);
      this.sendToPhone(p, event);
    }
  }

  broadcastAll(event: ServerRealtimeEvent, excludePhone?: string): void {
    const payload = JSON.stringify(event);
    for (const [phone, set] of this.socketsByPhone.entries()) {
      if (excludePhone && phone === excludePhone) continue;
      for (const ws of set) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(payload);
        }
      }
    }
  }

  getActiveCallForPhone(phoneNormalized: string): ActiveCallState | null {
    for (const call of this.activeCalls.values()) {
      if (call.callerPhone === phoneNormalized || call.calleePhone === phoneNormalized) {
        return call;
      }
    }
    return null;
  }

  setActiveCall(call: ActiveCallState): void {
    this.activeCalls.set(call.callId, call);
  }

  getCall(callId: string): ActiveCallState | undefined {
    return this.activeCalls.get(callId);
  }

  clearCall(callId: string): ActiveCallState | undefined {
    const existing = this.activeCalls.get(callId);
    if (existing?.ringTimeout) {
      clearTimeout(existing.ringTimeout);
    }
    this.activeCalls.delete(callId);
    return existing;
  }

  // Group call management
  getActiveGroupCall(callId: string): ActiveGroupCallState | undefined {
    return this.activeGroupCalls.get(callId);
  }

  getActiveGroupCallForGroup(groupId: string): ActiveGroupCallState | undefined {
    for (const call of this.activeGroupCalls.values()) {
      if (call.groupId === groupId && call.status === 'active') {
        return call;
      }
    }
    return undefined;
  }

  getActiveGroupCallForPhone(phoneNormalized: string): ActiveGroupCallState | null {
    for (const call of this.activeGroupCalls.values()) {
      if (call.status === 'active' && call.participants.has(phoneNormalized)) {
        return call;
      }
    }
    return null;
  }

  setGroupCall(call: ActiveGroupCallState): void {
    this.activeGroupCalls.set(call.callId, call);
  }

  clearGroupCall(callId: string): ActiveGroupCallState | undefined {
    const existing = this.activeGroupCalls.get(callId);
    if (existing) {
      existing.status = 'ended';
      this.activeGroupCalls.delete(callId);
    }
    return existing;
  }

  broadcastToGroupCall(callId: string, event: ServerRealtimeEvent, excludePhone?: string): void {
    const call = this.activeGroupCalls.get(callId);
    if (!call) return;
    for (const participant of call.participants.values()) {
      if (excludePhone && participant.phone === excludePhone) continue;
      this.sendToPhone(participant.phone, event);
    }
  }

  registerSocket(phoneNormalized: string, ws: WebSocket): void {
    const wasOnline = this.isPhoneOnline(phoneNormalized);
    let set = this.socketsByPhone.get(phoneNormalized);
    if (!set) {
      set = new Set<WebSocket>();
      this.socketsByPhone.set(phoneNormalized, set);
    }
    set.add(ws);

    if (ws.readyState === WebSocket.OPEN) {
      const initMsg: ServerRealtimeEvent = {
        type: 'connected',
        phoneNormalized,
        onlinePhones: this.getOnlinePhones(),
      };
      ws.send(JSON.stringify(initMsg));
    }

    if (!wasOnline) {
      this.broadcastAll(
        {
          type: 'presence:update',
          phoneNormalized,
          online: true,
          lastSeen: 'online',
        },
        phoneNormalized
      );
    }
  }

  unregisterSocket(phoneNormalized: string, ws: WebSocket): void {
    const set = this.socketsByPhone.get(phoneNormalized);
    if (!set) return;
    set.delete(ws);

    if (set.size === 0) {
      this.socketsByPhone.delete(phoneNormalized);
      const nowIso = new Date().toISOString();
      this.lastSeenByPhone.set(phoneNormalized, nowIso);
      const timeStr = new Date(nowIso).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      this.broadcastAll(
        {
          type: 'presence:update',
          phoneNormalized,
          online: false,
          lastSeen: `last seen at ${timeStr}`,
        },
        phoneNormalized
      );

      // Clean up any in-flight direct call if user lost all sockets mid-call
      const ongoing = this.getActiveCallForPhone(phoneNormalized);
      if (ongoing) {
        this.clearCall(ongoing.callId);
        const durationSecs = ongoing.answeredAtMs
          ? Math.max(1, Math.round((Date.now() - ongoing.answeredAtMs) / 1000))
          : 0;
        const outcome: CallRecordWireDto['outcome'] =
          ongoing.status === 'answered' ? 'answered' : 'missed';

        finalizeCallRecordInDb({
          callId: ongoing.callId,
          outcome,
          durationSeconds: durationSecs,
        })
          .then((savedLog) => {
            const peerPhone =
              ongoing.callerPhone === phoneNormalized
                ? ongoing.calleePhone
                : ongoing.callerPhone;
            this.sendToPhone(peerPhone, {
              type: 'call:ended',
              callId: ongoing.callId,
              byPhone: phoneNormalized,
              outcome,
              durationSeconds: durationSecs,
              callLog: savedLog,
            });
          })
          .catch(() => {});
      }

      // Clean up any in-flight group call if user lost all sockets
      const ongoingGroupCall = this.getActiveGroupCallForPhone(phoneNormalized);
      if (ongoingGroupCall) {
        ongoingGroupCall.participants.delete(phoneNormalized);
        updateCallParticipantStatusInDb({
          callId: ongoingGroupCall.callId,
          userPhone: phoneNormalized,
          status: 'left',
        }).catch(() => {});

        this.broadcastToGroupCall(ongoingGroupCall.callId, {
          type: 'call:group-user-left',
          callId: ongoingGroupCall.callId,
          phone: phoneNormalized,
          name: phoneNormalized,
        });

        if (ongoingGroupCall.participants.size === 0) {
          this.clearGroupCall(ongoingGroupCall.callId);
          finalizeCallRecordInDb({
            callId: ongoingGroupCall.callId,
            outcome: 'answered',
            durationSeconds: Math.max(1, Math.round((Date.now() - ongoingGroupCall.startedAtMs) / 1000)),
          }).catch(() => {});
        }
      }
    }
  }
}

export const realtimeHub = new RealtimeHub();

export function attachRealtimeHub(httpServer: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (req, socket, head) => {
    try {
      const parsedUrl = new URL(req.url || '/', 'http://localhost');
      if (parsedUrl.pathname !== '/ws') {
        return;
      }

      const rawToken = extractWsSessionToken(req);
      if (!rawToken) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const activeSession = await getSessionWithUser(rawToken);
      if (!activeSession) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        const currentUser = activeSession.user;
        const userPhone = currentUser.phoneNormalized;
        realtimeHub.registerSocket(userPhone, ws);

        ws.on('message', async (rawBuf) => {
          try {
            const parsed = JSON.parse(String(rawBuf)) as ClientWsInbound;

            if (parsed.type === 'ping') {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'pong' }));
              }
              return;
            }

            if (parsed.type === 'typing' && typeof parsed.toPhone === 'string') {
              const target = parsed.toPhone.trim();
              if (target && target !== userPhone) {
                realtimeHub.sendToPhone(target, {
                  type: 'typing:update',
                  fromPhone: userPhone,
                  isTyping: Boolean(parsed.isTyping),
                });
              }
              return;
            }

            // ===============================================================
            // WEBRTC INTERNET AUDIO / VIDEO CALL SIGNALING & MISSED CALLS
            // ===============================================================

            if (parsed.type === 'call:offer') {
              const targetPhone = String(parsed.toPhone || '').trim();
              const callId = String(parsed.callId || '').trim();
              const callType = parsed.callType === 'video' ? 'video' : 'audio';
              if (!targetPhone || !callId || !parsed.sdpOffer || targetPhone === userPhone) {
                return;
              }

              const peerProfiles = await lookupRegisteredUsersByPhones([targetPhone]);
              const calleeProfile = peerProfiles[0] || null;
              const calleeName = calleeProfile?.fullName || targetPhone;
              const calleeAvatar = calleeProfile?.avatarUrl ?? null;

              // Check if callee is already in another active call
              const existingBusy = realtimeHub.getActiveCallForPhone(targetPhone);
              if (existingBusy && existingBusy.callId !== callId) {
                const busyRecord = await createCallRecordInDb({
                  callId,
                  callerPhone: userPhone,
                  callerName: currentUser.fullName,
                  callerAvatar: currentUser.avatarUrl ?? null,
                  calleePhone: targetPhone,
                  calleeName,
                  calleeAvatar,
                  callType,
                  initialOutcome: 'missed',
                });
                const updatedBusy = await finalizeCallRecordInDb({
                  callId,
                  outcome: 'busy',
                  durationSeconds: 0,
                });
                realtimeHub.sendToPhone(userPhone, {
                  type: 'call:rejected',
                  callId,
                  byPhone: targetPhone,
                  reason: 'busy',
                  callLog: updatedBusy || busyRecord,
                });
                realtimeHub.sendToPhone(targetPhone, {
                  type: 'call:log-updated',
                  callLog: updatedBusy || busyRecord,
                });
                return;
              }

              const calleeOnline = realtimeHub.isPhoneOnline(targetPhone);

              await createCallRecordInDb({
                callId,
                callerPhone: userPhone,
                callerName: currentUser.fullName,
                callerAvatar: currentUser.avatarUrl ?? null,
                calleePhone: targetPhone,
                calleeName,
                calleeAvatar,
                callType,
                initialOutcome: 'ringing',
              });

              const ringTimeout = setTimeout(() => {
                const stillRinging = realtimeHub.getCall(callId);
                if (!stillRinging || stillRinging.status !== 'ringing') return;
                realtimeHub.clearCall(callId);

                finalizeCallRecordInDb({
                  callId,
                  outcome: 'missed',
                  durationSeconds: 0,
                })
                  .then((missedLog) => {
                    realtimeHub.sendToPhone(userPhone, {
                      type: 'call:ended',
                      callId,
                      byPhone: targetPhone,
                      outcome: 'missed',
                      durationSeconds: 0,
                      callLog: missedLog,
                    });
                    realtimeHub.sendToPhone(targetPhone, {
                      type: 'call:ended',
                      callId,
                      byPhone: userPhone,
                      outcome: 'missed',
                      durationSeconds: 0,
                      callLog: missedLog,
                    });
                  })
                  .catch(() => {});
              }, 35000);

              realtimeHub.setActiveCall({
                callId,
                callerPhone: userPhone,
                calleePhone: targetPhone,
                callType,
                status: 'ringing',
                startedAtMs: Date.now(),
                answeredAtMs: null,
                ringTimeout,
              });

              // Notify caller that callee device is ringing (or offline ringing)
              realtimeHub.sendToPhone(userPhone, {
                type: 'call:ringing',
                callId,
                calleeOnline,
              });

              if (calleeOnline) {
                realtimeHub.sendToPhone(targetPhone, {
                  type: 'call:incoming',
                  callId,
                  callerPhone: userPhone,
                  callerName: currentUser.fullName,
                  callerAvatar: currentUser.avatarUrl ?? null,
                  callType,
                  sdpOffer: parsed.sdpOffer,
                  timestampRaw: Date.now(),
                });
              }
              return;
            }

            if (parsed.type === 'call:answer') {
              const targetPhone = String(parsed.toPhone || '').trim();
              const callId = String(parsed.callId || '').trim();
              if (!targetPhone || !callId || !parsed.sdpAnswer) return;

              const callState = realtimeHub.getCall(callId);
              if (callState) {
                if (callState.ringTimeout) {
                  clearTimeout(callState.ringTimeout);
                  callState.ringTimeout = null;
                }
                callState.status = 'answered';
                callState.answeredAtMs = Date.now();
              }

              await markCallAnsweredInDb(callId).catch(() => {});

              realtimeHub.sendToPhone(targetPhone, {
                type: 'call:accepted',
                callId,
                calleePhone: userPhone,
                sdpAnswer: parsed.sdpAnswer,
              });
              return;
            }

            if (parsed.type === 'call:ice') {
              const targetPhone = String(parsed.toPhone || '').trim();
              const callId = String(parsed.callId || '').trim();
              if (!targetPhone || !callId || !parsed.candidate) return;

              realtimeHub.sendToPhone(targetPhone, {
                type: 'call:ice',
                callId,
                fromPhone: userPhone,
                candidate: parsed.candidate,
              });
              return;
            }

            if (parsed.type === 'call:reject') {
              const targetPhone = String(parsed.toPhone || '').trim();
              const callId = String(parsed.callId || '').trim();
              const reason = parsed.reason === 'busy' ? 'busy' : 'rejected';
              if (!targetPhone || !callId) return;

              realtimeHub.clearCall(callId);
              const savedLog = await finalizeCallRecordInDb({
                callId,
                outcome: reason,
                durationSeconds: 0,
              });

              realtimeHub.sendToPhone(targetPhone, {
                type: 'call:rejected',
                callId,
                byPhone: userPhone,
                reason,
                callLog: savedLog,
              });
              if (savedLog) {
                realtimeHub.sendToPhone(userPhone, {
                  type: 'call:log-updated',
                  callLog: savedLog,
                });
              }
              return;
            }

            if (parsed.type === 'call:hangup') {
              const targetPhone = String(parsed.toPhone || '').trim();
              const callId = String(parsed.callId || '').trim();
              if (!targetPhone || !callId) return;

              const tracked = realtimeHub.clearCall(callId);
              const serverMeasuredDuration = tracked?.answeredAtMs
                ? Math.max(1, Math.round((Date.now() - tracked.answeredAtMs) / 1000))
                : 0;
              const finalDuration = Math.max(
                serverMeasuredDuration,
                Math.floor(Number(parsed.durationSeconds || 0))
              );
              const wasAnswered =
                tracked?.status === 'answered' || Boolean(parsed.wasConnected) || finalDuration > 0;
              const outcome: CallRecordWireDto['outcome'] = wasAnswered ? 'answered' : 'missed';

              const savedLog = await finalizeCallRecordInDb({
                callId,
                outcome,
                durationSeconds: wasAnswered ? Math.max(1, finalDuration) : 0,
              });

              realtimeHub.sendToPhone(targetPhone, {
                type: 'call:ended',
                callId,
                byPhone: userPhone,
                outcome,
                durationSeconds: wasAnswered ? Math.max(1, finalDuration) : 0,
                callLog: savedLog,
              });
              if (savedLog) {
                realtimeHub.sendToPhone(userPhone, {
                  type: 'call:log-updated',
                  callLog: savedLog,
                });
              }
              return;
            }

            // ===============================================================
            // WEBRTC GROUP AUDIO & VIDEO CALL SIGNALING & ROOM COORDINATION
            // ===============================================================

            if (parsed.type === 'call:group-start') {
              const callId = String(parsed.callId || '').trim();
              const groupId = String(parsed.groupId || '').trim();
              const groupName = String(parsed.groupName || groupId).trim();
              const callType = parsed.callType === 'video' ? 'video' : 'audio';
              const rawMemberPhones = Array.isArray(parsed.memberPhones) ? parsed.memberPhones : [];
              const memberPhones = rawMemberPhones.map((p) => String(p).trim()).filter(Boolean);

              if (!callId || !groupId) return;

              // Check if another group call is already active for this group
              const existingCall = realtimeHub.getActiveGroupCallForGroup(groupId);
              if (existingCall) {
                if (!existingCall.participants.has(userPhone)) {
                  existingCall.participants.set(userPhone, {
                    phone: userPhone,
                    name: currentUser.fullName,
                    avatar: currentUser.avatarUrl ?? null,
                    role: 'member',
                    joinedAtMs: Date.now(),
                    isMuted: false,
                    isVideoOff: false,
                  });
                  await updateCallParticipantStatusInDb({
                    callId: existingCall.callId,
                    userPhone,
                    userName: currentUser.fullName,
                    userAvatar: currentUser.avatarUrl ?? null,
                    status: 'joined',
                  }).catch(() => {});
                }

                realtimeHub.sendToPhone(userPhone, {
                  type: 'call:group-joined',
                  callId: existingCall.callId,
                  groupId: existingCall.groupId,
                  callType: existingCall.callType,
                  hostPhone: existingCall.hostPhone,
                  existingParticipants: Array.from(existingCall.participants.values()).filter(
                    (p) => p.phone !== userPhone
                  ),
                });
                return;
              }

              // Create new active group call session
              const newGroupCall: ActiveGroupCallState = {
                callId,
                groupId,
                groupName,
                groupAvatar: parsed.groupAvatar ?? null,
                hostPhone: userPhone,
                hostName: currentUser.fullName,
                hostAvatar: currentUser.avatarUrl ?? null,
                callType,
                status: 'active',
                startedAtMs: Date.now(),
                memberPhones: new Set(memberPhones),
                participants: new Map([
                  [
                    userPhone,
                    {
                      phone: userPhone,
                      name: currentUser.fullName,
                      avatar: currentUser.avatarUrl ?? null,
                      role: 'host',
                      joinedAtMs: Date.now(),
                      isMuted: false,
                      isVideoOff: false,
                    },
                  ],
                ]),
              };

              realtimeHub.setGroupCall(newGroupCall);

              // Persist in DB
              createGroupCallRecordInDb({
                callId,
                groupId,
                groupName,
                groupAvatar: parsed.groupAvatar ?? null,
                callerPhone: userPhone,
                callerName: currentUser.fullName,
                callerAvatar: currentUser.avatarUrl ?? null,
                callType,
                memberPhones,
              }).catch(() => {});

              // Confirm joined for the host
              realtimeHub.sendToPhone(userPhone, {
                type: 'call:group-joined',
                callId,
                groupId,
                callType,
                hostPhone: userPhone,
                existingParticipants: [],
              });

              // Ring each member in memberPhones (excluding caller)
              for (const memberPhone of memberPhones) {
                if (memberPhone === userPhone) continue;
                realtimeHub.sendToPhone(memberPhone, {
                  type: 'call:group-incoming',
                  callId,
                  groupId,
                  groupName,
                  groupAvatar: parsed.groupAvatar ?? null,
                  callerPhone: userPhone,
                  callerName: currentUser.fullName,
                  callerAvatar: currentUser.avatarUrl ?? null,
                  callType,
                  timestampRaw: Date.now(),
                  memberPhones,
                });
              }
              return;
            }

            if (parsed.type === 'call:group-join') {
              const callId = String(parsed.callId || '').trim();
              const groupId = String(parsed.groupId || '').trim();
              if (!callId) return;

              let groupCall = realtimeHub.getActiveGroupCall(callId);
              if (!groupCall && groupId) {
                groupCall = realtimeHub.getActiveGroupCallForGroup(groupId);
              }

              if (!groupCall || groupCall.status !== 'active') {
                realtimeHub.sendToPhone(userPhone, {
                  type: 'call:group-ended',
                  callId,
                  byPhone: 'server',
                  reason: 'all_left',
                  durationSeconds: 0,
                });
                return;
              }

              const newParticipant: ActiveGroupParticipant = {
                phone: userPhone,
                name: currentUser.fullName,
                avatar: currentUser.avatarUrl ?? null,
                role: 'member',
                joinedAtMs: Date.now(),
                isMuted: false,
                isVideoOff: false,
              };

              groupCall.participants.set(userPhone, newParticipant);

              await updateCallParticipantStatusInDb({
                callId: groupCall.callId,
                userPhone,
                userName: currentUser.fullName,
                userAvatar: currentUser.avatarUrl ?? null,
                status: 'joined',
              }).catch(() => {});

              // Send joiner all existing participants
              const existingOthers = Array.from(groupCall.participants.values()).filter(
                (p) => p.phone !== userPhone
              );
              realtimeHub.sendToPhone(userPhone, {
                type: 'call:group-joined',
                callId: groupCall.callId,
                groupId: groupCall.groupId,
                callType: groupCall.callType,
                hostPhone: groupCall.hostPhone,
                existingParticipants: existingOthers,
              });

              // Broadcast user joined to other connected participants in the call
              realtimeHub.broadcastToGroupCall(
                groupCall.callId,
                {
                  type: 'call:group-user-joined',
                  callId: groupCall.callId,
                  groupId: groupCall.groupId,
                  user: newParticipant,
                },
                userPhone
              );
              return;
            }

            if (parsed.type === 'call:group-signal') {
              const callId = String(parsed.callId || '').trim();
              const targetPhone = String(parsed.toPhone || '').trim();
              if (!callId || !targetPhone || !parsed.sdp) return;

              realtimeHub.sendToPhone(targetPhone, {
                type: 'call:group-signal',
                callId,
                fromPhone: userPhone,
                fromName: currentUser.fullName,
                signalType: parsed.signalType,
                sdp: parsed.sdp,
              });
              return;
            }

            if (parsed.type === 'call:group-ice') {
              const callId = String(parsed.callId || '').trim();
              const targetPhone = String(parsed.toPhone || '').trim();
              if (!callId || !targetPhone || !parsed.candidate) return;

              realtimeHub.sendToPhone(targetPhone, {
                type: 'call:group-ice',
                callId,
                fromPhone: userPhone,
                candidate: parsed.candidate,
              });
              return;
            }

            if (parsed.type === 'call:group-toggle-media') {
              const callId = String(parsed.callId || '').trim();
              if (!callId) return;

              const groupCall = realtimeHub.getActiveGroupCall(callId);
              if (groupCall) {
                const part = groupCall.participants.get(userPhone);
                if (part) {
                  if (parsed.isMuted !== undefined) part.isMuted = Boolean(parsed.isMuted);
                  if (parsed.isVideoOff !== undefined) part.isVideoOff = Boolean(parsed.isVideoOff);
                }
              }

              updateCallParticipantStatusInDb({
                callId,
                userPhone,
                isMuted: parsed.isMuted,
                isVideoOff: parsed.isVideoOff,
                status: 'joined',
              }).catch(() => {});

              realtimeHub.broadcastToGroupCall(
                callId,
                {
                  type: 'call:group-media-updated',
                  callId,
                  phone: userPhone,
                  isMuted: parsed.isMuted,
                  isVideoOff: parsed.isVideoOff,
                },
                userPhone
              );
              return;
            }

            if (parsed.type === 'call:group-reject') {
              const callId = String(parsed.callId || '').trim();
              if (callId) {
                updateCallParticipantStatusInDb({
                  callId,
                  userPhone,
                  status: 'declined',
                }).catch(() => {});
              }
              return;
            }

            if (parsed.type === 'call:group-leave') {
              const callId = String(parsed.callId || '').trim();
              if (!callId) return;

              const groupCall = realtimeHub.getActiveGroupCall(callId);
              if (groupCall) {
                groupCall.participants.delete(userPhone);

                updateCallParticipantStatusInDb({
                  callId,
                  userPhone,
                  status: 'left',
                }).catch(() => {});

                realtimeHub.broadcastToGroupCall(callId, {
                  type: 'call:group-user-left',
                  callId,
                  phone: userPhone,
                  name: currentUser.fullName,
                });

                // If everyone has left the call, finalize the group call record
                if (groupCall.participants.size === 0) {
                  realtimeHub.clearGroupCall(callId);
                  const durationSecs = Math.max(
                    1,
                    Math.round((Date.now() - groupCall.startedAtMs) / 1000)
                  );
                  finalizeCallRecordInDb({
                    callId,
                    outcome: 'answered',
                    durationSeconds: durationSecs,
                  }).catch(() => {});
                }
              }
              return;
            }

            if (parsed.type === 'call:group-end') {
              const callId = String(parsed.callId || '').trim();
              if (!callId) return;

              const groupCall = realtimeHub.clearGroupCall(callId);
              const durationSecs = groupCall
                ? Math.max(1, Math.round((Date.now() - groupCall.startedAtMs) / 1000))
                : 0;

              const savedLog = await finalizeCallRecordInDb({
                callId,
                outcome: 'answered',
                durationSeconds: durationSecs,
              }).catch(() => null);

              if (groupCall) {
                realtimeHub.broadcastToGroupCall(callId, {
                  type: 'call:group-ended',
                  callId,
                  byPhone: userPhone,
                  reason: 'ended_by_host',
                  durationSeconds: durationSecs,
                  callLog: savedLog,
                });
              }
              return;
            }

            if (parsed.type === 'call:group-query-active') {
              const groupId = String(parsed.groupId || '').trim();
              if (!groupId) return;

              const groupCall = realtimeHub.getActiveGroupCallForGroup(groupId);
              realtimeHub.sendToPhone(userPhone, {
                type: 'call:group-active-status',
                groupId,
                active: Boolean(groupCall && groupCall.status === 'active'),
                callId: groupCall?.callId,
                callType: groupCall?.callType,
                hostPhone: groupCall?.hostPhone,
                hostName: groupCall?.hostName,
                participantCount: groupCall?.participants.size || 0,
              });
              return;
            }
          } catch (err) {
            console.error('WS inbound error:', err);
          }
        });

        ws.on('close', () => {
          realtimeHub.unregisterSocket(userPhone, ws);
        });

        ws.on('error', () => {
          realtimeHub.unregisterSocket(userPhone, ws);
        });
      });
    } catch {
      socket.destroy();
    }
  });

  return wss;
}
