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
  User,
  Wifi,
} from 'lucide-react';

export type CallSignalEvent =
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
    }
  | {
      type: 'call:ended';
      callId: string;
      byPhone: string;
      outcome: 'answered' | 'missed' | 'rejected' | 'busy';
      durationSeconds: number;
    };

interface CallModalProps {
  callId: string;
  contact: Contact;
  peerPhoneNormalized?: string | null;
  type: 'audio' | 'video';
  isIncoming?: boolean;
  incomingOffer?: RTCSessionDescriptionInit;
  onSendSignal?: (payload: Record<string, unknown>) => void;
  registerSignalListener?: (listener: ((ev: CallSignalEvent) => void) | null) => void;
  onClose: (result: {
    durationStr?: string;
    durationSeconds: number;
    outcome: 'answered' | 'missed' | 'rejected' | 'busy';
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
    gain.gain.value = 0.00001; // Near-silent keepalive track when hardware mic is absent
    osc.connect(gain);
    gain.connect(dst);
    osc.start();
    return {
      stream: dst.stream,
      stop: () => {
        try {
          osc.stop();
          ctx.close().catch(() => {});
        } catch {
          // Ignore cleanup error
        }
      },
    };
  } catch {
    return null;
  }
}

export const CallModal: React.FC<CallModalProps> = ({
  callId,
  contact,
  peerPhoneNormalized,
  type,
  isIncoming = false,
  incomingOffer,
  onSendSignal,
  registerSignalListener,
  onClose,
}) => {
  const isRealPeerCall = Boolean(peerPhoneNormalized && onSendSignal);

  const [callState, setCallState] = useState<
    'calling' | 'ringing' | 'connecting' | 'connected' | 'ended'
  >(isIncoming ? 'ringing' : isRealPeerCall ? 'calling' : 'ringing');
  const [statusLabel, setStatusLabel] = useState<string>(
    isIncoming
      ? `Incoming ZOLO ${type} call...`
      : isRealPeerCall
      ? 'Calling...'
      : 'Ringing...'
  );

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(type === 'video');
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const fallbackCleanupRef = useRef<(() => void) | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const closedRef = useRef(false);
  const durationRef = useRef(0);
  const wasConnectedRef = useRef(false);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  const formatDurationResult = (secs: number): string | undefined => {
    if (secs <= 0) return undefined;
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return mins > 0 ? `${mins}m ${rem < 10 ? '0' : ''}${rem}s` : `${rem}s`;
  };

  const cleanupMediaAndRtc = useCallback(() => {
    sound.stopRinging();
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // Ignore
      }
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    if (fallbackCleanupRef.current) {
      fallbackCleanupRef.current();
      fallbackCleanupRef.current = null;
    }
    remoteStreamRef.current = null;
  }, []);

  const finishAndClose = useCallback(
    (outcome: 'answered' | 'missed' | 'rejected' | 'busy', customLabel?: string) => {
      if (closedRef.current) return;
      closedRef.current = true;
      sound.stopRinging();

      const secs = durationRef.current;
      const finalOutcome = wasConnectedRef.current || secs > 0 ? 'answered' : outcome;

      if (customLabel) {
        setCallState('ended');
        setStatusLabel(customLabel);
        window.setTimeout(() => {
          cleanupMediaAndRtc();
          onClose({
            durationSeconds: secs,
            durationStr: formatDurationResult(secs),
            outcome: finalOutcome,
          });
        }, 900);
        return;
      }

      cleanupMediaAndRtc();
      onClose({
        durationSeconds: secs,
        durationStr: formatDurationResult(secs),
        outcome: finalOutcome,
      });
    },
    [cleanupMediaAndRtc, onClose]
  );

  const acquireLocalMedia = useCallback(async (): Promise<MediaStream | null> => {
    if (localStreamRef.current) return localStreamRef.current;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });
        localStreamRef.current = stream;
        if (localVideoRef.current && type === 'video') {
          localVideoRef.current.srcObject = stream;
        }
        return stream;
      }
    } catch {
      // If video+audio failed (e.g. no webcam), retry audio-only so internet voice still works
      if (type === 'video') {
        setCameraError(true);
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          localStreamRef.current = audioOnly;
          return audioOnly;
        } catch {
          // Fall through to Web Audio fallback track
        }
      }
    }

    setCameraError(true);
    const fb = createFallbackAudioStream();
    if (fb) {
      localStreamRef.current = fb.stream;
      fallbackCleanupRef.current = fb.stop;
      return fb.stream;
    }
    return null;
  }, [type]);

  const flushPendingIce = useCallback(async (pc: RTCPeerConnection) => {
    while (pendingIceCandidatesRef.current.length > 0) {
      const cand = pendingIceCandidatesRef.current.shift();
      if (cand) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(cand));
        } catch {
          // Ignore stale ICE candidate
        }
      }
    }
  }, []);

  const createPeerConnection = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection(RTC_ICE_SERVERS);
    pcRef.current = pc;

    const inboundStream = new MediaStream();
    remoteStreamRef.current = inboundStream;

    pc.onicecandidate = (ev) => {
      if (ev.candidate && ev.candidate.candidate && peerPhoneNormalized && onSendSignal) {
        onSendSignal({
          type: 'call:ice',
          callId,
          toPhone: peerPhoneNormalized,
          candidate: ev.candidate.toJSON(),
        });
      }
    };

    pc.ontrack = (ev) => {
      const stream = ev.streams && ev.streams[0] ? ev.streams[0] : inboundStream;
      if (!ev.streams || !ev.streams[0]) {
        inboundStream.addTrack(ev.track);
      }
      remoteStreamRef.current = stream;

      if (ev.track.kind === 'video') {
        setHasRemoteVideo(true);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      }
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    const onStateChange = () => {
      const conn = pc.connectionState;
      const ice = pc.iceConnectionState;
      if (conn === 'connected' || ice === 'connected' || ice === 'completed') {
        sound.stopRinging();
        wasConnectedRef.current = true;
        setCallState('connected');
        setStatusLabel('Connected');
      } else if (conn === 'failed' || ice === 'failed') {
        if (!closedRef.current) {
          finishAndClose(wasConnectedRef.current ? 'answered' : 'missed', 'Call connection failed');
        }
      } else if (conn === 'disconnected') {
        setStatusLabel('Reconnecting...');
      }
    };
    pc.onconnectionstatechange = onStateChange;
    pc.oniceconnectionstatechange = onStateChange;

    return pc;
  }, [callId, finishAndClose, onSendSignal, peerPhoneNormalized]);

  // Attach streams to video/audio elements whenever stage re-renders
  useEffect(() => {
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
    }
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current;
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      remoteAudioRef.current.srcObject = remoteStreamRef.current;
      remoteAudioRef.current.muted = !isSpeakerOn;
    }
  }, [callState, isVideoEnabled, hasRemoteVideo, isSpeakerOn]);

  // Register WebSocket call signaling listener for real peer calls
  useEffect(() => {
    if (!isRealPeerCall || !registerSignalListener) return;

    const handler = async (ev: CallSignalEvent) => {
      if (ev.callId !== callId || closedRef.current) return;

      if (ev.type === 'call:ringing') {
        setCallState('ringing');
        setStatusLabel(ev.calleeOnline ? 'Ringing...' : 'Calling (user offline)...');
        return;
      }

      if (ev.type === 'call:accepted') {
        sound.stopRinging();
        setCallState('connecting');
        setStatusLabel('Connecting media...');
        const pc = pcRef.current;
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(ev.sdpAnswer));
            remoteDescSetRef.current = true;
            await flushPendingIce(pc);
          } catch {
            // Connection state fallback
          }
        }
        return;
      }

      if (ev.type === 'call:ice') {
        const pc = pcRef.current;
        if (pc && remoteDescSetRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(ev.candidate));
          } catch {
            // Ignore
          }
        } else {
          pendingIceCandidatesRef.current.push(ev.candidate);
        }
        return;
      }

      if (ev.type === 'call:rejected') {
        finishAndClose(
          ev.reason,
          ev.reason === 'busy' ? 'User is on another call' : 'Call declined'
        );
        return;
      }

      if (ev.type === 'call:ended') {
        finishAndClose(
          ev.outcome,
          ev.outcome === 'missed' ? 'No answer' : 'Call ended'
        );
      }
    };

    registerSignalListener(handler);
    return () => {
      registerSignalListener(null);
    };
  }, [callId, finishAndClose, flushPendingIce, isRealPeerCall, registerSignalListener]);

  // Start ringing & initiate WebRTC offer (or demo fallback for starter contacts)
  useEffect(() => {
    sound.startRinging();

    if (isRealPeerCall) {
      if (!isIncoming && peerPhoneNormalized && onSendSignal) {
        let cancelled = false;
        (async () => {
          const stream = await acquireLocalMedia();
          if (cancelled || closedRef.current) return;

          const pc = createPeerConnection();
          if (stream) {
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));
          } else {
            pc.addTransceiver('audio', { direction: 'recvonly' });
            if (type === 'video') {
              pc.addTransceiver('video', { direction: 'recvonly' });
            }
          }

          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: type === 'video',
          });
          await pc.setLocalDescription(offer);

          onSendSignal({
            type: 'call:offer',
            callId,
            toPhone: peerPhoneNormalized,
            callType: type,
            sdpOffer: offer,
          });
        })().catch(() => {
          if (!cancelled) {
            finishAndClose('missed', 'Call setup failed');
          }
        });

        return () => {
          cancelled = true;
          cleanupMediaAndRtc();
        };
      }

      return () => {
        cleanupMediaAndRtc();
      };
    }

    // Demo contact fallback ('c1'..'c6')
    let connectTimeout: number | null = null;
    if (!isIncoming) {
      connectTimeout = window.setTimeout(() => {
        sound.stopRinging();
        wasConnectedRef.current = true;
        setCallState('connected');
        if (type === 'video') {
          void acquireLocalMedia();
        }
      }, 2800);
    }

    return () => {
      if (connectTimeout) window.clearTimeout(connectTimeout);
      cleanupMediaAndRtc();
    };
  }, [
    acquireLocalMedia,
    callId,
    cleanupMediaAndRtc,
    createPeerConnection,
    finishAndClose,
    isIncoming,
    isRealPeerCall,
    onSendSignal,
    peerPhoneNormalized,
    type,
  ]);

  // Call duration timer once connected
  useEffect(() => {
    if (callState !== 'connected') return;
    const interval = window.setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [callState]);

  const handleAnswerIncoming = async () => {
    sound.stopRinging();
    setCallState('connecting');
    setStatusLabel('Connecting...');

    if (isRealPeerCall && incomingOffer && peerPhoneNormalized && onSendSignal) {
      try {
        const stream = await acquireLocalMedia();
        const pc = createPeerConnection();
        if (stream) {
          stream.getTracks().forEach((track) => pc.addTrack(track, stream));
        }

        await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
        remoteDescSetRef.current = true;
        await flushPendingIce(pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        onSendSignal({
          type: 'call:answer',
          callId,
          toPhone: peerPhoneNormalized,
          sdpAnswer: answer,
        });

        setCallState('connecting');
        setStatusLabel('Connecting media...');
      } catch {
        finishAndClose('missed', 'Could not connect call');
      }
      return;
    }

    wasConnectedRef.current = true;
    setCallState('connected');
  };

  const handleDeclineIncoming = () => {
    sound.stopRinging();
    if (isRealPeerCall && peerPhoneNormalized && onSendSignal) {
      onSendSignal({
        type: 'call:reject',
        callId,
        toPhone: peerPhoneNormalized,
        reason: 'rejected',
      });
    }
    finishAndClose('rejected');
  };

  const handleEndCall = () => {
    sound.stopRinging();
    const secs = durationRef.current;
    const connected = wasConnectedRef.current || callState === 'connected';

    if (isRealPeerCall && peerPhoneNormalized && onSendSignal) {
      onSendSignal({
        type: 'call:hangup',
        callId,
        toPhone: peerPhoneNormalized,
        durationSeconds: secs,
        wasConnected: connected,
      });
    }

    finishAndClose(connected ? 'answered' : 'missed');
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }
  };

  const toggleVideo = () => {
    const nextEnabled = !isVideoEnabled;
    setIsVideoEnabled(nextEnabled);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = nextEnabled;
      });
    }
  };

  const toggleSpeaker = () => {
    const nextSpeaker = !isSpeakerOn;
    setIsSpeakerOn(nextSpeaker);
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !nextSpeaker;
    }
  };

  const formatTimer = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      {/* Hidden audio element for crystal-clear WebRTC voice playback */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div
        className={`relative w-full overflow-hidden rounded-3xl bg-[#111b21] text-white shadow-2xl transition-all duration-300 flex flex-col justify-between border border-slate-800 ${
          isFullScreen ? 'h-[95vh] max-w-5xl' : 'h-[600px] max-w-md md:max-w-xl'
        }`}
      >
        {/* Top Controls Bar */}
        <div className="relative z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-2">
            <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400">
              End-to-End Encrypted Internet Call
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="p-2 rounded-full hover:bg-white/10 transition-colors"
              title={isFullScreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullScreen ? (
                <Minimize2 className="w-5 h-5" />
              ) : (
                <Maximize2 className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Video or Audio Stage */}
        <div className="relative flex-1 flex flex-col items-center justify-center p-6 text-center">
          {type === 'video' && (isVideoEnabled || hasRemoteVideo) ? (
            <div className="absolute inset-0 w-full h-full bg-slate-950 flex items-center justify-center overflow-hidden">
              {/* Remote Peer Live WebRTC Video Stream */}
              {hasRemoteVideo ? (
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : contact.avatar ? (
                <img
                  src={contact.avatar}
                  alt={contact.name}
                  className="w-full h-full object-cover filter brightness-50 blur-[1px] scale-105 transition-transform"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-tr from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center">
                  <UserAvatar
                    src={contact.avatar}
                    name={contact.name}
                    className="w-32 h-32 shadow-2xl"
                    textClassName="text-4xl"
                  />
                </div>
              )}

              {/* Local Camera PiP Inset */}
              <div className="absolute bottom-6 right-6 w-32 h-44 sm:w-40 sm:h-56 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black z-20">
                {cameraError || !isVideoEnabled ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 p-2 text-center">
                    <User className="w-8 h-8 text-slate-400 mb-1" />
                    <span className="text-[10px] text-slate-300">
                      {!isVideoEnabled ? 'Camera off' : 'Audio active'}
                    </span>
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
                <div className="absolute top-2 left-2 text-[10px] bg-black/60 px-1.5 py-0.5 rounded text-white">
                  You
                </div>
              </div>

              {/* Contact overlay name & live timer */}
              <div className="absolute top-6 left-6 z-10 text-left bg-black/45 backdrop-blur-sm px-3.5 py-2 rounded-xl border border-white/10">
                <h3 className="text-base font-bold text-white drop-shadow">{contact.name}</h3>
                <span className="text-xs text-emerald-300 font-medium tabular-nums">
                  {callState === 'connected' ? formatTimer(duration) : statusLabel}
                </span>
              </div>
            </div>
          ) : (
            /* Audio Call Stage */
            <div className="flex flex-col items-center justify-center gap-4 z-10">
              <div className="relative">
                {(callState === 'ringing' || callState === 'calling') && (
                  <>
                    <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping opacity-75" />
                    <div className="absolute -inset-4 rounded-full bg-emerald-500/10 animate-pulse" />
                  </>
                )}
                <UserAvatar
                  src={contact.avatar}
                  name={contact.name}
                  className="w-28 h-28 sm:w-36 sm:h-36 border-4 border-slate-700 shadow-2xl"
                  textClassName="text-4xl"
                />
              </div>

              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">{contact.name}</h2>
                {contact.phoneNormalized && (
                  <p className="text-xs text-slate-400 tabular-nums mt-0.5">
                    {contact.phoneNormalized}
                  </p>
                )}
                <p className="text-sm text-emerald-400 font-medium mt-1.5 tabular-nums">
                  {callState === 'connected' ? formatTimer(duration) : statusLabel}
                </p>
              </div>

              {/* Connected Audio Waveform Animation */}
              {callState === 'connected' && (
                <div className="flex items-center gap-1.5 h-6 mt-2">
                  <span className="w-1 bg-[#00a884] rounded-full animate-wave-1 h-3" />
                  <span className="w-1 bg-[#00a884] rounded-full animate-wave-2 h-5" />
                  <span className="w-1 bg-[#00a884] rounded-full animate-wave-3 h-4" />
                  <span className="w-1 bg-[#00a884] rounded-full animate-wave-4 h-6" />
                  <span className="w-1 bg-[#00a884] rounded-full animate-wave-2 h-3" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Call Controls */}
        <div className="relative z-20 flex items-center justify-center gap-4 sm:gap-6 p-6 bg-gradient-to-t from-black/85 via-black/45 to-transparent">
          {callState === 'ringing' && isIncoming ? (
            /* Incoming Call Accept / Decline Actions */
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
                  {type === 'video' ? (
                    <Video className="w-7 h-7 text-white animate-bounce" />
                  ) : (
                    <Phone className="w-7 h-7 text-white animate-bounce" />
                  )}
                </div>
                <span className="text-xs text-slate-300 font-medium">Accept</span>
              </button>
            </div>
          ) : (
            /* Outgoing / Connected Controls */
            <>
              <button
                onClick={toggleMute}
                className={`p-4 rounded-full transition-transform active:scale-90 ${
                  isMuted
                    ? 'bg-rose-500/80 text-white'
                    : 'bg-white/15 hover:bg-white/25 text-white'
                }`}
                title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>

              {type === 'video' && (
                <button
                  onClick={toggleVideo}
                  className={`p-4 rounded-full transition-transform active:scale-90 ${
                    !isVideoEnabled
                      ? 'bg-rose-500/80 text-white'
                      : 'bg-white/15 hover:bg-white/25 text-white'
                  }`}
                  title={isVideoEnabled ? 'Turn camera off' : 'Turn camera on'}
                >
                  {isVideoEnabled ? (
                    <Video className="w-6 h-6" />
                  ) : (
                    <VideoOff className="w-6 h-6" />
                  )}
                </button>
              )}

              <button
                onClick={toggleSpeaker}
                className={`p-4 rounded-full transition-transform active:scale-90 ${
                  !isSpeakerOn
                    ? 'bg-rose-500/80 text-white'
                    : 'bg-white/15 hover:bg-white/25 text-white'
                }`}
                title={isSpeakerOn ? 'Mute speaker' : 'Unmute speaker'}
              >
                {isSpeakerOn ? (
                  <Volume2 className="w-6 h-6" />
                ) : (
                  <VolumeX className="w-6 h-6" />
                )}
              </button>

              <button
                onClick={handleEndCall}
                className="p-4 rounded-full bg-rose-600 hover:bg-rose-700 text-white transition-transform active:scale-90 shadow-xl"
                title="End call"
              >
                <PhoneOff className="w-7 h-7" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
