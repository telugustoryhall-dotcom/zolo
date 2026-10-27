import React, { useState, useRef, useEffect } from 'react';
import { Contact, Message, LocationData, PollData, UserProfile } from '../types/chat';
import { AudioPlayer } from './AudioPlayer';
import { PollCard } from './PollCard';
import { UserAvatar } from './UserAvatar';
import {
  Phone, Video, Search, MoreVertical, Paperclip, Smile, Mic, Send,
  Check, CheckCheck, Star, CornerUpLeft, Trash2, Copy, Image as ImageIcon,
  FileText, MapPin, BarChart2, X, Download, ShieldCheck, ChevronDown, Radio
} from 'lucide-react';

interface ChatAreaProps {
  contact: Contact;
  allContacts?: Contact[];
  messages: Message[];
  currentUser: UserProfile;
  theme: 'dark' | 'light';
  isTyping: boolean;
  onSendMessage: (text: string, mediaType?: Message['mediaType'], mediaData?: Partial<Message>) => void;
  onAudioCall: () => void;
  onVideoCall: () => void;
  onToggleContactInfo: () => void;
  onReactMessage: (messageId: string, emoji: string) => void;
  onStarMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string, forEveryone: boolean) => void;
  onVotePoll: (messageId: string, optionId: string) => void;
  onOpenImageModal: (url: string) => void;
  onOpenPollModal: () => void;
  onOpenLocationModal: () => void;
  onTypingChange?: (isTyping: boolean) => void;
  onBackMobile?: () => void;
}

const COMMON_EMOJIS = ['😊', '😂', '❤️', '👍', '🔥', '🙏', '🎉', '😍', '✨', '👏', '🙌', '💯', '😎', '🤔', '🚀', '☕'];
const QUICK_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const ChatArea: React.FC<ChatAreaProps> = ({
  contact,
  allContacts = [],
  messages,
  currentUser,
  theme,
  isTyping,
  onSendMessage,
  onAudioCall,
  onVideoCall,
  onToggleContactInfo,
  onReactMessage,
  onStarMessage,
  onDeleteMessage,
  onVotePoll,
  onOpenImageModal,
  onOpenPollModal,
  onOpenLocationModal,
  onTypingChange,
  onBackMobile,
}) => {
  const [inputText, setInputText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [activeMenuMessageId, setActiveMenuMessageId] = useState<string | null>(null);
  const [searchInChat, setSearchInChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Microphone recording state & refs
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [liveWaveformBars, setLiveWaveformBars] = useState<number[]>([25, 45, 30, 60, 35, 75, 40, 20]);
  const [micPermissionDenied, setMicPermissionDenied] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const liveAmplitudesRef = useRef<number[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const lastTypingSentAtRef = useRef<number>(0);
  const isDark = theme === 'dark';

  // Auto scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Voice recording timer
  useEffect(() => {
    if (isRecordingVoice) {
      recordingTimerRef.current = window.setInterval(() => {
        setRecordDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, [isRecordingVoice]);

  // Cleanup microphone resources on unmount
  useEffect(() => {
    return () => {
      cleanupRecorder();
    };
  }, []);

  const cleanupRecorder = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      onTypingChange?.(false);
    };
  }, [contact.id, onTypingChange]);

  const notifyTyping = (nextText: string) => {
    if (!onTypingChange) return;
    if (!nextText.trim()) {
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      lastTypingSentAtRef.current = 0;
      onTypingChange(false);
      return;
    }

    const now = Date.now();
    if (now - lastTypingSentAtRef.current > 1800) {
      lastTypingSentAtRef.current = now;
      onTypingChange(true);
    }

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      lastTypingSentAtRef.current = 0;
      onTypingChange(false);
    }, 2600);
  };

  const handleSend = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    lastTypingSentAtRef.current = 0;
    onTypingChange?.(false);

    onSendMessage(trimmed, 'text', {
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text || (replyingTo.mediaType ? `[${replyingTo.mediaType}]` : ''),
            senderName: replyingTo.senderName,
          }
        : undefined,
    });

    setInputText('');
    setReplyingTo(null);
    setShowEmojiPicker(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (currentUser.enterIsSend && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Browser Microphone Live Voice Note Recording
  const startVoiceRecording = async () => {
    setMicPermissionDenied(false);
    recordedChunksRef.current = [];
    liveAmplitudesRef.current = [];
    setRecordDuration(0);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone not supported on this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // AudioContext & AnalyserNode for real-time visual waveform
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Determine supported mime type
      let mimeType = '';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      setIsRecordingVoice(true);

      // Real-time animation loop for waveform
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateWave = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(100, Math.max(15, (avg / 128) * 100));
        liveAmplitudesRef.current.push(normalized);

        setLiveWaveformBars((prev) => {
          const next = [...prev, normalized];
          if (next.length > 20) next.shift();
          return next;
        });

        animationFrameRef.current = requestAnimationFrame(updateWave);
      };

      animationFrameRef.current = requestAnimationFrame(updateWave);
    } catch (err) {
      console.warn('Microphone permission request or device issue:', err);
      // Fallback: start simulated voice recording with visual wave
      setMicPermissionDenied(true);
      setIsRecordingVoice(true);
    }
  };

  const cancelVoiceRecording = () => {
    cleanupRecorder();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    setIsRecordingVoice(false);
    setRecordDuration(0);
  };

  const finishVoiceRecording = () => {
    const finalDuration = Math.max(recordDuration, 1);
    const capturedAmplitudes = [...liveAmplitudesRef.current];

    // Downsample captured amplitudes into 24 distinct waveform bars
    let sampledWaveform: number[] = [];
    if (capturedAmplitudes.length >= 24) {
      const step = capturedAmplitudes.length / 24;
      for (let i = 0; i < 24; i++) {
        sampledWaveform.push(Math.round(capturedAmplitudes[Math.floor(i * step)]));
      }
    } else if (capturedAmplitudes.length > 0) {
      sampledWaveform = [...capturedAmplitudes];
      while (sampledWaveform.length < 24) {
        sampledWaveform.push(Math.round(20 + Math.random() * 50));
      }
    } else {
      sampledWaveform = [25, 45, 70, 35, 80, 50, 90, 65, 40, 75, 100, 60, 45, 85, 30, 55, 95, 40, 70, 25, 60, 85, 40, 20];
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
        const audioBlob = new Blob(recordedChunksRef.current, { type: mimeType });
        const capturedReply = replyingTo
          ? {
              id: replyingTo.id,
              text: replyingTo.text,
              senderName: replyingTo.senderName,
            }
          : undefined;

        cleanupRecorder();
        setIsRecordingVoice(false);
        setRecordDuration(0);
        setReplyingTo(null);

        const reader = new FileReader();
        reader.onloadend = () => {
          const mediaUrl =
            typeof reader.result === 'string' && reader.result.length > 0
              ? reader.result
              : URL.createObjectURL(audioBlob);

          onSendMessage('Voice note', 'audio', {
            mediaUrl,
            audioDuration: finalDuration,
            waveformSamples: sampledWaveform,
            replyTo: capturedReply,
          });
        };
        reader.onerror = () => {
          onSendMessage('Voice note', 'audio', {
            mediaUrl: URL.createObjectURL(audioBlob),
            audioDuration: finalDuration,
            waveformSamples: sampledWaveform,
            replyTo: capturedReply,
          });
        };
        reader.readAsDataURL(audioBlob);
      };

      try {
        mediaRecorderRef.current.stop();
      } catch {
        cleanupRecorder();
        setIsRecordingVoice(false);
      }
    } else {
      // Fallback
      cleanupRecorder();
      setIsRecordingVoice(false);
      setRecordDuration(0);

      onSendMessage('Voice note', 'audio', {
        audioDuration: finalDuration,
        waveformSamples: sampledWaveform,
        replyTo: replyingTo
          ? {
              id: replyingTo.id,
              text: replyingTo.text,
              senderName: replyingTo.senderName,
            }
          : undefined,
      });
      setReplyingTo(null);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        onSendMessage(file.name, 'image', {
          mediaUrl: reader.result as string,
        });
      };
      reader.readAsDataURL(file);
    }
    setShowAttachMenu(false);
  };

  const filteredMessages = searchQuery.trim()
    ? messages.filter((m) => m.text?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Top Chat Header */}
      <div
        className={`h-16 px-4 flex items-center justify-between border-b shrink-0 z-20 ${
          isDark ? 'bg-[#202c33] border-slate-800 text-white' : 'bg-[#f0f2f5] border-slate-200 text-slate-800'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Back Button */}
          {onBackMobile && (
            <button
              onClick={onBackMobile}
              className="md:hidden p-1.5 -ml-2 rounded-full hover:bg-slate-700/20"
            >
              <CornerUpLeft className="w-5 h-5 text-slate-400" />
            </button>
          )}

          <div
            onClick={onToggleContactInfo}
            className="flex items-center gap-3 cursor-pointer min-w-0 group"
          >
            <div className="relative w-10 h-10 rounded-full overflow-hidden bg-slate-700 shrink-0">
              {contact.avatar ? (
                <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-bold text-white bg-emerald-800">
                  {contact.name[0]}
                </div>
              )}
              {contact.online && (
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#202c33]" />
              )}
            </div>

            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate group-hover:underline">{contact.name}</h3>
              <p className="text-xs text-slate-400 truncate">
                {isTyping ? (
                  <span className="text-[#00a884] font-medium animate-pulse">typing...</span>
                ) : contact.online ? (
                  <span className="text-[#00a884]">online</span>
                ) : (
                  contact.lastSeen
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 sm:gap-2 text-slate-400">
          <button
            onClick={onVideoCall}
            className="p-2.5 rounded-full hover:bg-slate-700/20 transition-colors"
            title="Video call"
          >
            <Video className="w-5 h-5" />
          </button>
          <button
            onClick={onAudioCall}
            className="p-2.5 rounded-full hover:bg-slate-700/20 transition-colors"
            title="Audio call"
          >
            <Phone className="w-5 h-5" />
          </button>
          <button
            onClick={() => setSearchInChat(!searchInChat)}
            className={`p-2.5 rounded-full transition-colors ${
              searchInChat ? 'bg-slate-700/30 text-[#00a884]' : 'hover:bg-slate-700/20'
            }`}
            title="Search in chat"
          >
            <Search className="w-5 h-5" />
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="p-2.5 rounded-full hover:bg-slate-700/20 transition-colors"
              title="More options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {/* More Menu Popover */}
            {showMoreMenu && (
              <div
                className={`absolute right-0 top-12 w-48 rounded-xl shadow-xl py-2 z-50 border ${
                  isDark ? 'bg-[#233138] border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                }`}
              >
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    onToggleContactInfo();
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-[#111b21]/30 transition-colors"
                >
                  {contact.isGroup ? 'Group Info & Photo' : 'Contact Info'}
                </button>
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    setSearchInChat(true);
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-[#111b21]/30 transition-colors"
                >
                  Search Messages
                </button>
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    const content = messages
                      .map((m) => `[${m.timestamp}] ${m.senderName}: ${m.text || m.mediaType || ''}`)
                      .join('\n');
                    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${contact.name.replace(/\s+/g, '_')}_ZOLO_Chat.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-[#111b21]/30 transition-colors"
                >
                  Export Chat
                </button>
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    messages.forEach((m) => onDeleteMessage(m.id, true));
                  }}
                  className="w-full text-left px-4 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  Clear Chat
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* In-Chat Search Bar */}
      {searchInChat && (
        <div
          className={`px-4 py-2 border-b flex items-center justify-between z-10 ${
            isDark ? 'bg-[#182229] border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in conversation..."
              className="w-full bg-transparent text-xs outline-none"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              {filteredMessages.length} {filteredMessages.length === 1 ? 'match' : 'matches'}
            </span>
            <button
              onClick={() => {
                setSearchInChat(false);
                setSearchQuery('');
              }}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Chat Messages Body with WhatsApp Wallpaper Pattern */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 relative"
        style={{
          backgroundImage: isDark
            ? `radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)`
            : `radial-gradient(circle, rgba(0,0,0,0.04) 1px, transparent 1px)`,
          backgroundColor: isDark ? '#0b141a' : '#efeae2',
          backgroundSize: '20px 20px',
        }}
      >
        {/* End to end encryption security notice */}
        <div className="flex justify-center my-2">
          <div
            className={`max-w-md px-4 py-2 rounded-xl text-center flex items-center gap-2 shadow-sm ${
              isDark ? 'bg-[#182229] text-amber-300/80 border border-amber-500/10' : 'bg-[#ffeecd] text-amber-900 border border-amber-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
            <span className="text-[11px] leading-tight">
              Messages and calls are end-to-end encrypted in ZOLO. No one outside of this chat can read or listen to them.
            </span>
          </div>
        </div>

        {/* Messages List */}
        {filteredMessages.map((msg) => {
          const isOutgoing = msg.senderId === 'user';
          const isMenuOpen = activeMenuMessageId === msg.id;
          const senderContact = !isOutgoing
            ? allContacts.find((c) => c.id === msg.senderId) || contact
            : null;
          const avatarSrc = isOutgoing ? currentUser.avatar : senderContact?.avatar;
          const avatarName = isOutgoing ? currentUser.name : msg.senderName || contact.name;

          return (
            <div
              key={msg.id}
              onMouseEnter={() => setHoveredMessageId(msg.id)}
              onMouseLeave={() => setHoveredMessageId(null)}
              className={`flex items-start gap-2 group relative ${
                isOutgoing ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              {msg.senderId !== 'system' && (
                <UserAvatar
                  src={avatarSrc}
                  name={avatarName}
                  className="w-7 h-7 mt-0.5 shadow-sm"
                  textClassName="text-[10px]"
                />
              )}

              {/* Message Bubble */}
              <div
                className={`relative max-w-[82%] sm:max-w-[68%] md:max-w-[58%] rounded-2xl p-2.5 shadow-sm transition-all ${
                  isOutgoing
                    ? isDark
                      ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-none'
                      : 'bg-[#d9fdd3] text-[#111b21] rounded-tr-none'
                    : isDark
                    ? 'bg-[#202c33] text-[#e9edef] rounded-tl-none'
                    : 'bg-white text-[#111b21] rounded-tl-none'
                }`}
              >
                {/* Sender Name in Group Chat */}
                {contact.isGroup && !isOutgoing && (
                  <div className="text-[11px] font-bold text-[#00a884] mb-1">
                    {msg.senderName}
                  </div>
                )}

                {/* Quoted Reply Banner */}
                {msg.replyTo && (
                  <div
                    className={`mb-2 p-2 rounded-lg border-l-4 border-[#00a884] text-xs cursor-pointer ${
                      isDark ? 'bg-black/25 text-slate-300' : 'bg-black/5 text-slate-600'
                    }`}
                  >
                    <div className="font-semibold text-[11px] text-[#00a884]">
                      {msg.replyTo.senderName}
                    </div>
                    <div className="truncate text-slate-400">{msg.replyTo.text}</div>
                  </div>
                )}

                {/* Render Media Content */}
                {msg.mediaType === 'image' && msg.mediaUrl && (
                  <div
                    onClick={() => onOpenImageModal(msg.mediaUrl!)}
                    className="cursor-pointer overflow-hidden rounded-xl mb-1.5 max-h-[340px]"
                  >
                    <img
                      src={msg.mediaUrl}
                      alt="Shared media"
                      className="w-full h-full object-cover hover:scale-[1.02] transition-transform"
                    />
                  </div>
                )}

                {/* Audio Voice Note with Visual Waveform and Playback */}
                {msg.mediaType === 'audio' && (
                  <AudioPlayer
                    duration={msg.audioDuration || 15}
                    mediaUrl={msg.mediaUrl}
                    waveformSamples={msg.waveformSamples}
                    isOutgoing={isOutgoing}
                    theme={theme}
                  />
                )}

                {msg.mediaType === 'poll' && msg.poll && (
                  <PollCard
                    poll={msg.poll}
                    isOutgoing={isOutgoing}
                    theme={theme}
                    onVote={(optId) => onVotePoll(msg.id, optId)}
                  />
                )}

                {msg.mediaType === 'location' && msg.location && (
                  <div className="min-w-[240px] max-w-[320px] rounded-xl overflow-hidden mb-1">
                    <div className="h-28 bg-emerald-950/40 relative flex items-center justify-center border border-emerald-500/20">
                      <MapPin className="w-8 h-8 text-rose-500 animate-bounce" />
                    </div>
                    <div className="p-2 bg-black/20">
                      <div className="font-semibold text-xs">{msg.location.name}</div>
                      <div className="text-[11px] text-slate-400">{msg.location.address}</div>
                    </div>
                  </div>
                )}

                {msg.mediaType === 'document' && (
                  <div className="flex items-center gap-3 p-2.5 rounded-xl bg-black/15 min-w-[220px]">
                    <div className="w-10 h-10 rounded-lg bg-rose-600/20 text-rose-400 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate">{msg.mediaFileName || 'Document.pdf'}</div>
                      <div className="text-[10px] text-slate-400">{msg.mediaFileSize || '1.8 MB'}</div>
                    </div>
                    <button className="p-1.5 text-slate-400 hover:text-white" title="Download">
                      <Download className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Text Body */}
                {msg.text && msg.mediaType !== 'audio' && (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words pr-14">
                    {msg.text}
                  </p>
                )}

                {/* Timestamp & Status Checkmarks */}
                <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-slate-400 select-none float-right ml-2">
                  {msg.isStarred && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
                  <span>{msg.timestamp}</span>
                  {isOutgoing && (
                    <span>
                      {msg.status === 'read' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-[#53bdeb]" />
                      ) : msg.status === 'delivered' ? (
                        <CheckCheck className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </span>
                  )}
                </div>

                {/* Reaction Badges pill at bottom edge */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div
                    className={`absolute -bottom-3 ${
                      isOutgoing ? 'right-2' : 'left-2'
                    } flex items-center gap-1 bg-[#202c33] border border-slate-700/60 rounded-full px-2 py-0.5 text-xs shadow-md z-10`}
                  >
                    {msg.reactions.map((r, i) => (
                      <span key={i} className="flex items-center gap-0.5">
                        <span>{r.emoji}</span>
                        {r.count > 1 && (
                          <span className="text-[10px] font-bold text-slate-300 tabular-nums">
                            {r.count}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Hover Quick Action Toolbar */}
              {(hoveredMessageId === msg.id || isMenuOpen) && (
                <div
                  className={`absolute -top-4 ${
                    isOutgoing ? 'right-0' : 'left-0'
                  } z-30 flex items-center gap-1 bg-[#202c33] border border-slate-700 rounded-full px-2 py-1 shadow-lg text-slate-300`}
                >
                  {/* Quick Reactions */}
                  {QUICK_REACTION_EMOJIS.slice(0, 3).map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => onReactMessage(msg.id, emoji)}
                      className="hover:scale-125 transition-transform text-xs p-1"
                    >
                      {emoji}
                    </button>
                  ))}

                  <div className="w-[1px] h-3 bg-slate-600 mx-0.5" />

                  {/* Reply Button */}
                  <button
                    onClick={() => setReplyingTo(msg)}
                    className="p-1 hover:text-white transition-colors"
                    title="Reply"
                  >
                    <CornerUpLeft className="w-3.5 h-3.5" />
                  </button>

                  {/* Star / Unstar Button */}
                  <button
                    onClick={() => onStarMessage(msg.id)}
                    className={`p-1 transition-colors ${
                      msg.isStarred ? 'text-amber-400' : 'hover:text-white'
                    }`}
                    title={msg.isStarred ? 'Unstar' : 'Star'}
                  >
                    <Star className="w-3.5 h-3.5" />
                  </button>

                  {/* Dropdown Options */}
                  <div className="relative">
                    <button
                      onClick={() => setActiveMenuMessageId(isMenuOpen ? null : msg.id)}
                      className="p-1 hover:text-white transition-colors"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>

                    {isMenuOpen && (
                      <div
                        className={`absolute ${
                          isOutgoing ? 'right-0' : 'left-0'
                        } top-6 w-36 py-1.5 rounded-xl shadow-xl z-50 border ${
                          isDark ? 'bg-[#233138] border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                        }`}
                      >
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(msg.text || '');
                            setActiveMenuMessageId(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-700/30 flex items-center gap-2"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </button>
                        <button
                          onClick={() => {
                            onDeleteMessage(msg.id, false);
                            setActiveMenuMessageId(null);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Contact Typing Indicator Bubble */}
        {isTyping && (
          <div className="flex items-center gap-2 bg-[#202c33] text-slate-300 px-4 py-2 rounded-2xl rounded-tl-none w-20 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce" />
            <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
            <span className="w-2 h-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quoted Reply Banner Above Input */}
      {replyingTo && (
        <div
          className={`px-4 py-2 border-t flex items-center justify-between ${
            isDark ? 'bg-[#202c33] border-slate-700' : 'bg-slate-100 border-slate-300'
          }`}
        >
          <div className="border-l-4 border-[#00a884] pl-3 min-w-0">
            <div className="text-xs font-semibold text-[#00a884] truncate">
              Replying to {replyingTo.senderName}
            </div>
            <div className="text-xs text-slate-400 truncate">{replyingTo.text}</div>
          </div>
          <button
            onClick={() => setReplyingTo(null)}
            className="p-1 rounded-full text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Emoji Picker Popover */}
      {showEmojiPicker && (
        <div
          className={`p-3 border-t max-h-48 overflow-y-auto grid grid-cols-8 gap-2 z-20 ${
            isDark ? 'bg-[#202c33] border-slate-700' : 'bg-white border-slate-200'
          }`}
        >
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                setInputText((prev) => prev + emoji);
              }}
              className="text-2xl hover:scale-125 transition-transform p-1.5 rounded-lg hover:bg-slate-700/20"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Attachment Popover */}
      {showAttachMenu && (
        <div
          className={`absolute bottom-20 left-12 w-52 rounded-2xl p-2 shadow-2xl z-40 border grid grid-cols-2 gap-2 ${
            isDark ? 'bg-[#233138] border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <label className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-slate-700/30 cursor-pointer transition-colors text-center">
            <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white">
              <ImageIcon className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">Photos & Videos</span>
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </label>

          <button
            onClick={() => {
              setShowAttachMenu(false);
              onOpenPollModal();
            }}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-slate-700/30 transition-colors text-center"
          >
            <div className="w-10 h-10 rounded-full bg-amber-600 flex items-center justify-center text-white">
              <BarChart2 className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">Poll</span>
          </button>

          <button
            onClick={() => {
              setShowAttachMenu(false);
              onOpenLocationModal();
            }}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-slate-700/30 transition-colors text-center"
          >
            <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white">
              <MapPin className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">Location</span>
          </button>

          <button
            onClick={() => {
              setShowAttachMenu(false);
              onSendMessage('Document attachment: Quarterly_Report.pdf', 'document', {
                mediaFileName: 'ZOLO_Report_2026.pdf',
                mediaFileSize: '1.2 MB',
              });
            }}
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-slate-700/30 transition-colors text-center"
          >
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium">Document</span>
          </button>
        </div>
      )}

      {/* Chat Footer / Input Row */}
      <div
        className={`px-4 py-2.5 flex items-center gap-2 border-t shrink-0 z-10 ${
          isDark ? 'bg-[#202c33] border-slate-800' : 'bg-[#f0f2f5] border-slate-200'
        }`}
      >
        {isRecordingVoice ? (
          /* Live Browser Microphone Recording Bar with Waveform */
          <div className="flex-1 flex items-center justify-between px-3 py-2 bg-rose-950/20 rounded-2xl border border-rose-500/30 animate-pulse">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-3 h-3 rounded-full bg-rose-500 animate-ping shrink-0" />
              <span className="text-sm font-semibold text-rose-400 tabular-nums shrink-0">
                {formatTimer(recordDuration)}
              </span>

              {/* Dynamic live waveform bars responding to microphone amplitude */}
              <div className="flex items-center gap-[3px] h-6 px-1 overflow-hidden max-w-[160px] sm:max-w-[240px]">
                {liveWaveformBars.map((val, idx) => (
                  <div
                    key={idx}
                    style={{ height: `${Math.max(15, val)}%` }}
                    className="w-[3px] bg-[#00a884] rounded-full transition-all duration-75 shrink-0"
                  />
                ))}
              </div>

              <span className="text-xs text-slate-400 truncate hidden md:inline">
                {micPermissionDenied
                  ? 'Recording voice note (simulated)...'
                  : 'Recording browser mic audio...'}
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={cancelVoiceRecording}
                className="p-2 rounded-full text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Discard recording"
                aria-label="Discard recording"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={finishVoiceRecording}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#00a884] text-white hover:bg-[#008f72] shadow-md transition-transform active:scale-95 font-semibold text-xs"
                title="Send voice note"
                aria-label="Send voice note"
              >
                <span>Send</span>
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* Standard Input Bar */
          <>
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className={`p-2 rounded-full transition-colors ${
                showEmojiPicker ? 'text-[#00a884]' : 'text-slate-400 hover:text-slate-300'
              }`}
              title="Emojis"
            >
              <Smile className="w-6 h-6" />
            </button>

            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className={`p-2 rounded-full transition-colors ${
                showAttachMenu ? 'text-[#00a884]' : 'text-slate-400 hover:text-slate-300'
              }`}
              title="Attach files"
            >
              <Paperclip className="w-6 h-6" />
            </button>

            <div className="flex-1 relative flex items-center">
              <textarea
                value={inputText}
                onChange={(e) => {
                  const val = e.target.value;
                  setInputText(val);
                  notifyTyping(val);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Type a message"
                rows={1}
                className={`w-full py-2.5 px-4 rounded-xl text-sm outline-none resize-none max-h-32 transition-colors ${
                  isDark
                    ? 'bg-[#2a3942] text-white placeholder-slate-400'
                    : 'bg-white text-slate-900 placeholder-slate-400 shadow-sm'
                }`}
              />
            </div>

            {inputText.trim() ? (
              <button
                onClick={handleSend}
                className="w-10 h-10 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white flex items-center justify-center transition-transform active:scale-95 shadow-md shrink-0"
                title="Send message"
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            ) : (
              /* Dedicated 'Record Voice Note' button with browser microphone */
              <button
                type="button"
                onClick={startVoiceRecording}
                className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-semibold shadow-md transition-all active:scale-95 shrink-0"
                title="Record Voice Note with Microphone"
                aria-label="Record Voice Note"
              >
                <Mic className="w-4 h-4" />
                <span className="hidden sm:inline">Record Voice Note</span>
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
