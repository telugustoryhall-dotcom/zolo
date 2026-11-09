import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Contact } from '../types/chat';
import { sound } from '../utils/audio';
import { UserAvatar } from './UserAvatar';
import {
  Phone,
  Video,
  PhoneOff,
  Mic,
  MicOff,
  VideoOff,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Users,
  ShieldCheck,
  Crown,
  Wifi,
} from 'lucide-react';

export interface GroupParticipantInfo {
  phone: string;
  name: string;
  avatar: string | null;
  role: 'host' | 'member';
  joinedAtMs: number;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export type GroupCallSignalEvent =
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
    };

interface GroupCallModalProps {
  callId: string;
  groupId: string;
  groupName: string;
  groupAvatar?: string;
  callType: 'audio' | 'video';
  currentUser: {
    phone: string;
    name: string;
    avatar?: string;
  };
  isHost: boolean;
  isIncoming?: boolean;
  incomingCaller?: {
    phone: string;
    name: string;
    avatar?: string | null;
  };
  memberPhones?: string[];
  allContacts: Contact[];
  onSendSignal: (payload: Record<string, unknown>) => void;
  registerSignalListener: (listener: ((ev: GroupCallSignalEvent) => void) | null) => void;
  onClose: (result: {
    durationSeconds: number;
    outcome: 'answered' | 'missed' | 'rejected';
  }) => void;
}

const RTC_ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ],
};

function createFallbackAudioStream(): { stream: MediaStream; stop: () => void } | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    const dst = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.00001; // Keepalive silent track
    osc.connect(gain);
    gain.connect(dst);
    osc.start();
    return {
      stream: dst.stream,
      stop: () => {
        try {
          osc.stop();
          ctx.close().catch(() => {});
        } catch {}
      },
    };
  } catch {
    return null;
  }
}

export const GroupCallModal: React.FC<GroupCallModalProps> = ({
  callId,
  groupId,
  groupName,
  groupAvatar,
  callType,
  currentUser,
  isHost,
  isIncoming = false,
  incomingCaller,
  memberPhones = [],
  allContacts,
  onSendSignal,
  registerSignalListener,
  onClose,
}) => {
  const [callState, setCallState] = useState<'ringing' | 'connecting' | 'connected' | 'ended'>(
    isIncoming ? 'ringing' : 'connecting'
  );
  const [statusMessage, setStatusMessage] = useState<string>(
    isIncoming ? `Incoming Group ${callType} Call...` : 'Connecting group session...'
  );

  const [participants, setParticipants] = useState<GroupParticipantInfo[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [speakingPhones, setSpeakingPhones] = useState<Set<string>>(new Set());

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [cameraError, setCameraError] = useState(false);

  // WebRTC & Audio refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const fallbackCleanupRef = useRef<(() => void) | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analysersRef = useRef<Map<string, { analyser: AnalyserNode; source: MediaStreamAudioSourceNode }>>(new Map());
  const animationFrameRef = useRef<number | null>(null);
  const closedRef = useRef(false);
  const durationRef = useRef(0);
  const hasJoinedRef = useRef(!isIncoming);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  // Audio Analyser Setup for Real Speaking Indicators
  const setupAudioAnalyser = useCallback((phone: string, stream: MediaStream) => {
    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      analysersRef.current.set(phone, { analyser, source });
    } catch {}
  }, []);

  // Monitor speaking levels continuously
  useEffect(() => {
    if (callState !== 'connected') return;

    const dataArray = new Uint8Array(128);

    const checkAudioLevels = () => {
      const activeSpeakers = new Set<string>();

      analysersRef.current.forEach(({ analyser }, phone) => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        if (avg > 18) {
          activeSpeakers.add(phone);
        }
      });

      setSpeakingPhones(activeSpeakers);
      animationFrameRef.current = requestAnimationFrame(checkAudioLevels);
    };

    animationFrameRef.current = requestAnimationFrame(checkAudioLevels);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [callState]);

  // Cleanup all media and WebRTC connections
  const cleanupAllResources = useCallback(() => {
    sound.stopRinging();

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Close AudioContext
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch {}
      audioContextRef.current = null;
    }
    analysersRef.current.clear();

    // Close peer connections
    peersRef.current.forEach((pc) => {
      try {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {}
    });
    peersRef.current.clear();
    pendingIceRef.current.clear();

    // Stop local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (fallbackCleanupRef.current) {
      fallbackCleanupRef.current();
      fallbackCleanupRef.current = null;
    }
  }, []);

  const finishAndClose = useCallback(
    (outcome: 'answered' | 'missed' | 'rejected', customLabel?: string) => {
      if (closedRef.current) return;
      closedRef.current = true;
      sound.stopRinging();

      const secs = durationRef.current;
      const finalOutcome = secs > 0 || hasJoinedRef.current ? 'answered' : outcome;

      if (customLabel) {
        setCallState('ended');
        setStatusMessage(customLabel);
        setTimeout(() => {
          cleanupAllResources();
          onClose({
            durationSeconds: secs,
            outcome: finalOutcome,
          });
        }, 850);
        return;
      }

      cleanupAllResources();
      onClose({
        durationSeconds: secs,
        outcome: finalOutcome,
      });
    },
    [cleanupAllResources, onClose]
  );

  // Acquire local media
  const acquireLocalMedia = useCallback(async (): Promise<MediaStream | null> => {
    if (localStreamRef.current) return localStreamRef.current;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video:
            callType === 'video'
              ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
              : false,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current && callType === 'video') {
          localVideoRef.current.srcObject = stream;
        }
        setupAudioAnalyser('self', stream);
        return stream;
      }
    } catch {
      if (callType === 'video') {
        setCameraError(true);
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = audioOnly;
          setupAudioAnalyser('self', audioOnly);
          return audioOnly;
        } catch {}
      }
    }

    setCameraError(true);
    const fb = createFallbackAudioStream();
    if (fb) {
      localStreamRef.current = fb.stream;
      fallbackCleanupRef.current = fb.stop;
      setupAudioAnalyser('self', fb.stream);
      return fb.stream;
    }
    return null;
  }, [callType, setupAudioAnalyser]);

  // Create Peer Connection to a specific remote peer in the mesh
  const createPeerConnectionFor = useCallback(
    (remotePhone: string): RTCPeerConnection => {
      const existing = peersRef.current.get(remotePhone);
      if (existing) return existing;

      const pc = new RTCPeerConnection(RTC_ICE_SERVERS);
      peersRef.current.set(remotePhone, pc);

      // Add local media tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate && ev.candidate.candidate) {
          onSendSignal({
            type: 'call:group-ice',
            callId,
            toPhone: remotePhone,
            candidate: ev.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (ev) => {
        const incomingStream = ev.streams && ev.streams[0] ? ev.streams[0] : new MediaStream([ev.track]);
        setRemoteStreams((prev) => {
          const updated = new Map(prev);
          updated.set(remotePhone, incomingStream);
          return updated;
        });
        setupAudioAnalyser(remotePhone, incomingStream);
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') {
          try {
            pc.restartIce();
          } catch {}
        }
      };

      return pc;
    },
    [callId, onSendSignal, setupAudioAnalyser]
  );

  // Send SDP Offer to a specific newcomer
  const initiateOfferTo = useCallback(
    async (remotePhone: string) => {
      const pc = createPeerConnectionFor(remotePhone);
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: callType === 'video',
        });
        await pc.setLocalDescription(offer);

        onSendSignal({
          type: 'call:group-signal',
          callId,
          toPhone: remotePhone,
          signalType: 'offer',
          sdp: offer,
        });
      } catch {}
    },
    [callId, callType, createPeerConnectionFor, onSendSignal]
  );

  // Handle incoming group signaling events
  useEffect(() => {
    if (!registerSignalListener) return;

    const handler = async (ev: GroupCallSignalEvent) => {
      if (ev.callId !== callId || closedRef.current) return;

      if (ev.type === 'call:group-joined') {
        sound.stopRinging();
        hasJoinedRef.current = true;
        setCallState('connected');
        setStatusMessage('Connected');

        const mappedList: GroupParticipantInfo[] = [
          {
            phone: currentUser.phone,
            name: currentUser.name,
            avatar: currentUser.avatar || null,
            role: isHost ? 'host' : 'member',
            joinedAtMs: Date.now(),
            isMuted,
            isVideoOff: !isVideoEnabled,
          },
          ...ev.existingParticipants.map((p) => ({
            ...p,
            joinedAtMs: Date.now(),
          })),
        ];

        setParticipants(mappedList);

        // When a newcomer joins, existing participants initiate offers to the newcomer,
        // so we wait for incoming offers or create peer connections for them
        return;
      }

      if (ev.type === 'call:group-user-joined') {
        const newUser = ev.user;
        setParticipants((prev) => {
          if (prev.some((p) => p.phone === newUser.phone)) return prev;
          return [
            ...prev,
            {
              ...newUser,
              joinedAtMs: Date.now(),
            },
          ];
        });

        // Existing participants initiate offer to the new joiner!
        await initiateOfferTo(newUser.phone);
        return;
      }

      if (ev.type === 'call:group-signal') {
        const senderPhone = ev.fromPhone;
        const pc = createPeerConnectionFor(senderPhone);

        if (ev.signalType === 'offer') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(ev.sdp));

            // Flush pending ICE candidates
            const pending = pendingIceRef.current.get(senderPhone) || [];
            while (pending.length > 0) {
              const c = pending.shift();
              if (c) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(c));
                } catch {}
              }
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            onSendSignal({
              type: 'call:group-signal',
              callId,
              toPhone: senderPhone,
              signalType: 'answer',
              sdp: answer,
            });
          } catch {}
        } else if (ev.signalType === 'answer') {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(ev.sdp));

            const pending = pendingIceRef.current.get(senderPhone) || [];
            while (pending.length > 0) {
              const c = pending.shift();
              if (c) {
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(c));
                } catch {}
              }
            }
          } catch {}
        }
        return;
      }

      if (ev.type === 'call:group-ice') {
        const senderPhone = ev.fromPhone;
        const pc = peersRef.current.get(senderPhone);

        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(ev.candidate));
          } catch {}
        } else {
          const list = pendingIceRef.current.get(senderPhone) || [];
          list.push(ev.candidate);
          pendingIceRef.current.set(senderPhone, list);
        }
        return;
      }

      if (ev.type === 'call:group-media-updated') {
        setParticipants((prev) =>
          prev.map((p) =>
            p.phone === ev.phone
              ? {
                  ...p,
                  isMuted: ev.isMuted !== undefined ? ev.isMuted : p.isMuted,
                  isVideoOff: ev.isVideoOff !== undefined ? ev.isVideoOff : p.isVideoOff,
                }
              : p
          )
        );
        return;
      }

      if (ev.type === 'call:group-user-left') {
        // Close peer connection for user who left
        const pc = peersRef.current.get(ev.phone);
        if (pc) {
          try {
            pc.close();
          } catch {}
          peersRef.current.delete(ev.phone);
        }
        setRemoteStreams((prev) => {
          const updated = new Map(prev);
          updated.delete(ev.phone);
          return updated;
        });
        setParticipants((prev) => prev.filter((p) => p.phone !== ev.phone));
        return;
      }

      if (ev.type === 'call:group-ended') {
        finishAndClose(
          'answered',
          ev.reason === 'ended_by_host' ? 'Call ended by host' : 'Group call ended'
        );
      }
    };

    registerSignalListener(handler);
    return () => {
      registerSignalListener(null);
    };
  }, [
    callId,
    createPeerConnectionFor,
    currentUser.avatar,
    currentUser.name,
    currentUser.phone,
    finishAndClose,
    initiateOfferTo,
    isHost,
    isMuted,
    isVideoEnabled,
    onSendSignal,
    registerSignalListener,
  ]);

  // Initial startup: ring or connect
  useEffect(() => {
    if (isIncoming) {
      sound.startRinging();
      return () => {
        sound.stopRinging();
      };
    }

    // Outgoing group call initiation
    let cancelled = false;
    (async () => {
      await acquireLocalMedia();
      if (cancelled || closedRef.current) return;

      onSendSignal({
        type: 'call:group-start',
        callId,
        groupId,
        groupName,
        groupAvatar: groupAvatar || null,
        callType,
        memberPhones,
      });

      setCallState('connected');
      setStatusMessage('Connected');
      hasJoinedRef.current = true;

      setParticipants([
        {
          phone: currentUser.phone,
          name: currentUser.name,
          avatar: currentUser.avatar || null,
          role: 'host',
          joinedAtMs: Date.now(),
          isMuted,
          isVideoOff: !isVideoEnabled,
        },
      ]);
    })().catch(() => {
      if (!cancelled) {
        finishAndClose('missed', 'Call setup failed');
      }
    });

    return () => {
      cancelled = true;
      cleanupAllResources();
    };
  }, [
    acquireLocalMedia,
    callId,
    callType,
    cleanupAllResources,
    currentUser.avatar,
    currentUser.name,
    currentUser.phone,
    finishAndClose,
    groupAvatar,
    groupId,
    groupName,
    isIncoming,
    isMuted,
    isVideoEnabled,
    memberPhones,
    onSendSignal,
  ]);

  // Duration timer once connected
  useEffect(() => {
    if (callState !== 'connected') return;
    const interval = window.setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [callState]);

  // Answer incoming group call
  const handleAnswerIncoming = async () => {
    sound.stopRinging();
    setCallState('connecting');
    setStatusMessage('Joining group call...');

    try {
      await acquireLocalMedia();
      onSendSignal({
        type: 'call:group-join',
        callId,
        groupId,
      });
    } catch {
      finishAndClose('missed', 'Could not access microphone/camera');
    }
  };

  // Decline incoming group call
  const handleDeclineIncoming = () => {
    sound.stopRinging();
    onSendSignal({
      type: 'call:group-reject',
      callId,
      groupId,
    });
    finishAndClose('rejected');
  };

  // Leave active group call
  const handleLeaveCall = () => {
    sound.stopRinging();
    onSendSignal({
      type: 'call:group-leave',
      callId,
    });
    finishAndClose('answered');
  };

  // End active group call for everyone (host only)
  const handleEndCallForEveryone = () => {
    sound.stopRinging();
    onSendSignal({
      type: 'call:group-end',
      callId,
    });
    finishAndClose('answered', 'You ended the call for everyone');
  };

  // Toggle microphone
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
    onSendSignal({
      type: 'call:group-toggle-media',
      callId,
      isMuted: nextMuted,
    });
  };

  // Toggle camera
  const toggleVideo = () => {
    const nextVideoEnabled = !isVideoEnabled;
    setIsVideoEnabled(nextVideoEnabled);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = nextVideoEnabled;
      });
    }
    onSendSignal({
      type: 'call:group-toggle-media',
      callId,
      isVideoOff: !nextVideoEnabled,
    });
  };

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Find contact info for avatar fallback
  const getParticipantContact = (phone: string): Contact | undefined => {
    return allContacts.find((c) => c.phoneNormalized === phone || c.phone === phone);
  };

  const otherParticipants = participants.filter((p) => p.phone !== currentUser.phone);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4">
      <div
        className={`relative w-full overflow-hidden rounded-3xl bg-[#111b21] text-white shadow-2xl transition-all duration-300 flex flex-col justify-between border border-slate-800 ${
          isFullScreen ? 'h-[96vh] max-w-6xl' : 'h-[640px] max-w-2xl sm:max-w-4xl'
        }`}
      >
        {/* Top Header Bar */}
        <div className="relative z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <Users className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white">{groupName}</h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Group {callType}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300 mt-0.5">
                <Wifi className="w-3 h-3 text-emerald-400" />
                <span className="font-medium text-emerald-400 tabular-nums">
                  {callState === 'connected' ? formatTimer(duration) : statusMessage}
                </span>
                <span className="text-slate-500">•</span>
                <span>{participants.length} {participants.length === 1 ? 'participant' : 'participants'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              title={isFullScreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Call Stage Area */}
        <div className="relative flex-1 flex flex-col items-center justify-center p-3 sm:p-5 overflow-hidden">
          {callState === 'ringing' && isIncoming ? (
            /* Incoming Group Call Card */
            <div className="flex flex-col items-center justify-center gap-4 text-center z-10 max-w-md">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping opacity-75" />
                <div className="absolute -inset-4 rounded-full bg-emerald-500/10 animate-pulse" />
                <UserAvatar
                  src={groupAvatar || incomingCaller?.avatar || ''}
                  name={groupName}
                  className="w-28 h-28 sm:w-36 sm:h-36 border-4 border-emerald-500/60 shadow-2xl"
                  textClassName="text-4xl"
                />
              </div>

              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">{groupName}</h2>
                <p className="text-sm text-emerald-400 font-medium mt-1">
                  Incoming group {callType} call from {incomingCaller?.name || incomingCaller?.phone || 'a member'}
                </p>
                <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mt-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>End-to-end encrypted group call</span>
                </div>
              </div>
            </div>
          ) : callType === 'video' ? (
            /* Video Conference Grid */
            <div className="w-full h-full flex flex-col justify-center">
              <div
                className={`w-full h-full grid gap-2 sm:gap-3 items-center justify-center ${
                  otherParticipants.length === 0
                    ? 'grid-cols-1'
                    : otherParticipants.length === 1
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : otherParticipants.length <= 3
                    ? 'grid-cols-2'
                    : 'grid-cols-2 sm:grid-cols-3'
                }`}
              >
                {/* Local Camera Tile */}
                <div className="relative w-full h-full max-h-[420px] rounded-2xl overflow-hidden bg-slate-900 border-2 border-slate-700/60 flex items-center justify-center shadow-lg group">
                  {cameraError || !isVideoEnabled ? (
                    <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
                      <div className={`relative ${speakingPhones.has('self') ? 'ring-4 ring-emerald-400 rounded-full' : ''}`}>
                        <UserAvatar
                          src={currentUser.avatar}
                          name={currentUser.name}
                          className="w-20 h-20 sm:w-24 sm:h-24 shadow-xl border-2 border-slate-700"
                          textClassName="text-2xl"
                        />
                      </div>
                      <span className="text-xs text-slate-400 font-medium">Camera is off</span>
                    </div>
                  ) : (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover transform -scale-x-100"
                    />
                  )}

                  {/* Local Info Badge */}
                  <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/10">
                    <span className="text-xs font-semibold text-white">You</span>
                    {isHost && (
                      <span title="Host">
                        <Crown className="w-3.5 h-3.5 text-amber-400" />
                      </span>
                    )}
                    {isMuted ? (
                      <MicOff className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                  </div>

                  {speakingPhones.has('self') && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-500/80 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow">
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                      Speaking
                    </div>
                  )}
                </div>

                {/* Remote Participants Tiles */}
                {otherParticipants.map((participant) => {
                  const stream = remoteStreams.get(participant.phone);
                  const isSpeaking = speakingPhones.has(participant.phone);
                  const contactInfo = getParticipantContact(participant.phone);
                  const avatar = participant.avatar || contactInfo?.avatar || '';

                  return (
                    <div
                      key={participant.phone}
                      className={`relative w-full h-full max-h-[420px] rounded-2xl overflow-hidden bg-slate-900 border-2 transition-all flex items-center justify-center shadow-lg ${
                        isSpeaking ? 'border-emerald-400 shadow-emerald-500/20 shadow-lg' : 'border-slate-800'
                      }`}
                    >
                      {/* Hidden Audio element for clear remote sound */}
                      {stream && (
                        <audio
                          autoPlay
                          playsInline
                          ref={(el) => {
                            if (el && el.srcObject !== stream) {
                              el.srcObject = stream;
                              el.muted = !isSpeakerOn;
                              el.play().catch(() => {});
                            }
                          }}
                        />
                      )}

                      {/* Video Element or Avatar Fallback */}
                      {stream && !participant.isVideoOff ? (
                        <video
                          autoPlay
                          playsInline
                          ref={(el) => {
                            if (el && el.srcObject !== stream) {
                              el.srcObject = stream;
                              el.play().catch(() => {});
                            }
                          }}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-3 p-4 text-center">
                          <div className={`relative ${isSpeaking ? 'ring-4 ring-emerald-400 rounded-full animate-pulse' : ''}`}>
                            <UserAvatar
                              src={avatar}
                              name={participant.name}
                              className="w-20 h-20 sm:w-24 sm:h-24 shadow-2xl border-2 border-slate-700"
                              textClassName="text-3xl"
                            />
                          </div>
                          <div>
                            <span className="text-sm font-bold text-white block">{participant.name}</span>
                            <span className="text-[11px] text-slate-400">
                              {participant.isVideoOff ? 'Camera off' : 'Audio stream active'}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Participant Overlay Badge */}
                      <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-white/10">
                        <span className="text-xs font-semibold text-white truncate max-w-[120px]">
                          {participant.name}
                        </span>
                        {participant.role === 'host' && (
                          <span title="Host">
                            <Crown className="w-3.5 h-3.5 text-amber-400" />
                          </span>
                        )}
                        {participant.isMuted ? (
                          <MicOff className="w-3.5 h-3.5 text-rose-400" />
                        ) : (
                          <Mic className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </div>

                      {/* Speaking indicator badge */}
                      {isSpeaking && (
                        <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-500/80 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow">
                          <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping" />
                          Speaking
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Audio Conference Stage */
            <div className="w-full max-w-2xl flex flex-col items-center justify-center gap-6 z-10">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6 justify-center items-center w-full">
                {/* Local user tile */}
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={`relative rounded-full transition-all duration-200 ${
                      speakingPhones.has('self')
                        ? 'ring-4 ring-emerald-400 ring-offset-4 ring-offset-[#111b21] scale-105'
                        : ''
                    }`}
                  >
                    <UserAvatar
                      src={currentUser.avatar}
                      name={currentUser.name}
                      className="w-20 h-20 sm:w-24 sm:h-24 shadow-2xl border-4 border-slate-700"
                      textClassName="text-3xl"
                    />
                    <div className="absolute bottom-0 right-0 p-1.5 rounded-full bg-slate-900 border border-slate-700 shadow">
                      {isMuted ? (
                        <MicOff className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <Mic className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                    </div>
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-bold text-white block">You {isHost ? '(Host)' : ''}</span>
                    <span className="text-[10px] text-emerald-400 font-medium">
                      {speakingPhones.has('self') ? 'Speaking...' : isMuted ? 'Muted' : 'Connected'}
                    </span>
                  </div>
                </div>

                {/* Remote Participants */}
                {otherParticipants.map((p) => {
                  const stream = remoteStreams.get(p.phone);
                  const isSpeaking = speakingPhones.has(p.phone);
                  const contactInfo = getParticipantContact(p.phone);
                  const avatar = p.avatar || contactInfo?.avatar || '';

                  return (
                    <div key={p.phone} className="flex flex-col items-center gap-2">
                      {/* Hidden audio element for voice playback */}
                      {stream && (
                        <audio
                          autoPlay
                          playsInline
                          ref={(el) => {
                            if (el && el.srcObject !== stream) {
                              el.srcObject = stream;
                              el.muted = !isSpeakerOn;
                              el.play().catch(() => {});
                            }
                          }}
                        />
                      )}

                      <div
                        className={`relative rounded-full transition-all duration-200 ${
                          isSpeaking
                            ? 'ring-4 ring-emerald-400 ring-offset-4 ring-offset-[#111b21] scale-105'
                            : ''
                        }`}
                      >
                        <UserAvatar
                          src={avatar}
                          name={p.name}
                          className="w-20 h-20 sm:w-24 sm:h-24 shadow-2xl border-4 border-slate-800"
                          textClassName="text-3xl"
                        />
                        <div className="absolute bottom-0 right-0 p-1.5 rounded-full bg-slate-900 border border-slate-700 shadow">
                          {p.isMuted ? (
                            <MicOff className="w-3.5 h-3.5 text-rose-400" />
                          ) : (
                            <Mic className="w-3.5 h-3.5 text-emerald-400" />
                          )}
                        </div>
                      </div>

                      <div className="text-center">
                        <span className="text-xs font-bold text-white block truncate max-w-[100px]">
                          {p.name}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-medium">
                          {isSpeaking ? 'Speaking...' : p.isMuted ? 'Muted' : 'In Call'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Group Call Live Audio Waves */}
              {callState === 'connected' && (
                <div className="flex items-center gap-1.5 h-6 mt-2">
                  <span className="w-1 bg-[#00a884] rounded-full animate-wave-1 h-3" />
                  <span className="w-1 bg-[#00a884] rounded-full animate-wave-2 h-6" />
                  <span className="w-1 bg-[#00a884] rounded-full animate-wave-3 h-4" />
                  <span className="w-1 bg-[#00a884] rounded-full animate-wave-4 h-7" />
                  <span className="w-1 bg-[#00a884] rounded-full animate-wave-2 h-4" />
                  <span className="w-1 bg-[#00a884] rounded-full animate-wave-3 h-6" />
                  <span className="w-1 bg-[#00a884] rounded-full animate-wave-1 h-3" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Call Controls Bar */}
        <div className="relative z-20 flex items-center justify-center gap-3 sm:gap-6 p-4 sm:p-6 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
          {callState === 'ringing' && isIncoming ? (
            /* Incoming Call Controls: Decline / Accept */
            <div className="flex items-center gap-12">
              <button
                onClick={handleDeclineIncoming}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 flex items-center justify-center transition-transform active:scale-90 shadow-lg">
                  <PhoneOff className="w-7 h-7 text-white" />
                </div>
                <span className="text-xs text-slate-300 font-medium">Decline</span>
              </button>

              <button
                onClick={handleAnswerIncoming}
                className="flex flex-col items-center gap-2 group"
              >
                <div className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center transition-transform active:scale-90 shadow-lg shadow-emerald-500/30">
                  {callType === 'video' ? (
                    <Video className="w-7 h-7 text-white animate-bounce" />
                  ) : (
                    <Phone className="w-7 h-7 text-white animate-bounce" />
                  )}
                </div>
                <span className="text-xs text-slate-300 font-medium">Join Call</span>
              </button>
            </div>
          ) : (
            /* Active Group Call Controls */
            <>
              {/* Mic Toggle */}
              <button
                onClick={toggleMute}
                className={`p-3.5 sm:p-4 rounded-full transition-transform active:scale-90 ${
                  isMuted ? 'bg-rose-500/80 text-white' : 'bg-white/15 hover:bg-white/25 text-white'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="w-5 h-5 sm:w-6 sm:h-6" /> : <Mic className="w-5 h-5 sm:w-6 sm:h-6" />}
              </button>

              {/* Video Camera Toggle */}
              {callType === 'video' && (
                <button
                  onClick={toggleVideo}
                  className={`p-3.5 sm:p-4 rounded-full transition-transform active:scale-90 ${
                    !isVideoEnabled
                      ? 'bg-rose-500/80 text-white'
                      : 'bg-white/15 hover:bg-white/25 text-white'
                  }`}
                  title={isVideoEnabled ? 'Turn camera off' : 'Turn camera on'}
                >
                  {isVideoEnabled ? (
                    <Video className="w-5 h-5 sm:w-6 sm:h-6" />
                  ) : (
                    <VideoOff className="w-5 h-5 sm:w-6 sm:h-6" />
                  )}
                </button>
              )}

              {/* Speaker Toggle */}
              <button
                onClick={() => setIsSpeakerOn(!isSpeakerOn)}
                className={`p-3.5 sm:p-4 rounded-full transition-transform active:scale-90 ${
                  !isSpeakerOn
                    ? 'bg-rose-500/80 text-white'
                    : 'bg-white/15 hover:bg-white/25 text-white'
                }`}
                title={isSpeakerOn ? 'Mute audio' : 'Unmute audio'}
              >
                {isSpeakerOn ? (
                  <Volume2 className="w-5 h-5 sm:w-6 sm:h-6" />
                ) : (
                  <VolumeX className="w-5 h-5 sm:w-6 sm:h-6" />
                )}
              </button>

              {/* Leave Call Button */}
              <button
                onClick={handleLeaveCall}
                className="px-5 py-3 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs sm:text-sm flex items-center gap-2 transition-transform active:scale-95 shadow-xl"
                title="Leave group call"
              >
                <PhoneOff className="w-5 h-5" />
                <span>Leave</span>
              </button>

              {/* End for Everyone (Host only) */}
              {isHost && (
                <button
                  onClick={handleEndCallForEveryone}
                  className="px-4 py-3 rounded-full bg-slate-800 hover:bg-slate-700 border border-rose-500/40 text-rose-300 font-semibold text-xs sm:text-sm transition-transform active:scale-95"
                  title="End group call for everyone"
                >
                  End for All
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
