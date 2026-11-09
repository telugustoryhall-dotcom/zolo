import React, { useState, useRef } from 'react';
import {
  X,
  QrCode,
  Download,
  Copy,
  Check,
  RefreshCw,
  Camera,
  Upload,
  UserCheck,
  ShieldCheck,
  Share2,
} from 'lucide-react';
import type { UserProfile, Contact } from '../types/chat';

interface QRCodeModalProps {
  userProfile: UserProfile;
  theme: 'dark' | 'light';
  onClose: () => void;
  onAddScannedContact: (contact: Partial<Contact>) => void;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({
  userProfile,
  theme,
  onClose,
  onAddScannedContact,
}) => {
  const [tab, setTab] = useState<'my_qr' | 'scan'>('my_qr');
  const [copied, setCopied] = useState(false);
  const [linkRevokeCounter, setLinkRevokeCounter] = useState(1);
  const [scannedResult, setScannedResult] = useState<{
    name: string;
    username: string;
    phone: string;
    avatar: string;
    about: string;
  } | null>(null);
  const [isScanningActive, setIsScanningActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isDark = theme === 'dark';
  const username = userProfile.username || userProfile.phone.replace(/[^0-9]/g, '');
  const shareableUrl = `https://zolochat.ai.studio/u/${username}?ref=${linkRevokeCounter}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareableUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleRegenerateLink = () => {
    setLinkRevokeCounter((prev) => prev + 1);
  };

  const handleSimulateScan = () => {
    // Demo discovery profile
    const demoProfiles = [
      {
        name: 'Kavya Reddy',
        username: 'kavya_r',
        phone: '+919848022334',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
        about: 'Designer & privacy advocate on ZOLO.',
      },
      {
        name: 'Arjun Mehta',
        username: 'arjun_m',
        phone: '+919820011223',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
        about: 'Full-stack builder. Working on modern distributed systems.',
      },
    ];
    const picked = demoProfiles[Math.floor(Math.random() * demoProfiles.length)];
    setScannedResult(picked);
  };

  const handleDownloadQR = () => {
    const svgElement = document.getElementById('zolo-user-qr-svg');
    if (!svgElement) return;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      ctx?.drawImage(img, 0, 0);
      const pngUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `ZOLO_QR_${username}.png`;
      a.click();
    };
    img.src = `data:image/svg+xml;base64,${btoa(svgData)}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-3xl border overflow-hidden shadow-2xl transition-all ${
          isDark ? 'bg-[#182229] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header with Tabs */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800/40">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/15">
            <button
              type="button"
              onClick={() => {
                setTab('my_qr');
                setScannedResult(null);
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === 'my_qr'
                  ? 'bg-[#00a884] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              My QR Code
            </button>
            <button
              type="button"
              onClick={() => setTab('scan')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === 'scan'
                  ? 'bg-[#00a884] text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Scan QR
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab 1: My QR Code */}
        {tab === 'my_qr' && (
          <div className="p-6 flex flex-col items-center text-center space-y-4">
            {/* User Profile Card Header */}
            <div className="flex items-center gap-3">
              <img
                src={userProfile.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                alt={userProfile.name}
                className="w-12 h-12 rounded-full object-cover ring-2 ring-[#00a884]"
              />
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-base leading-none">{userProfile.name}</h3>
                  <span className="p-0.5 rounded-full bg-[#00a884] text-white" title="Verified ZOLO User">
                    <ShieldCheck className="w-3 h-3" />
                  </span>
                </div>
                <p className="text-xs text-[#00a884] font-medium mt-1">@{username}</p>
              </div>
            </div>

            {/* Render High-res SVG QR Code */}
            <div className="p-5 rounded-2xl bg-white shadow-md flex items-center justify-center">
              <svg
                id="zolo-user-qr-svg"
                viewBox="0 0 200 200"
                className="w-48 h-48 select-none"
              >
                {/* Visual QR Code Pattern */}
                <rect width="200" height="200" fill="#ffffff" />
                {/* Top-Left Finder */}
                <rect x="15" y="15" width="50" height="50" fill="#0b141a" rx="8" />
                <rect x="25" y="25" width="30" height="30" fill="#ffffff" rx="4" />
                <rect x="33" y="33" width="14" height="14" fill="#00a884" rx="2" />

                {/* Top-Right Finder */}
                <rect x="135" y="15" width="50" height="50" fill="#0b141a" rx="8" />
                <rect x="145" y="25" width="30" height="30" fill="#ffffff" rx="4" />
                <rect x="153" y="33" width="14" height="14" fill="#00a884" rx="2" />

                {/* Bottom-Left Finder */}
                <rect x="15" y="135" width="50" height="50" fill="#0b141a" rx="8" />
                <rect x="25" y="145" width="30" height="30" fill="#ffffff" rx="4" />
                <rect x="33" y="153" width="14" height="14" fill="#00a884" rx="2" />

                {/* Data Matrix Dots */}
                <g fill="#182229">
                  <rect x="75" y="20" width="8" height="8" rx="2" />
                  <rect x="90" y="25" width="8" height="8" rx="2" />
                  <rect x="110" y="18" width="8" height="8" rx="2" />
                  <rect x="75" y="45" width="8" height="8" rx="2" />
                  <rect x="95" y="40" width="8" height="8" rx="2" />
                  <rect x="115" y="48" width="8" height="8" rx="2" />

                  <rect x="20" y="75" width="8" height="8" rx="2" />
                  <rect x="40" y="85" width="8" height="8" rx="2" />
                  <rect x="55" y="75" width="8" height="8" rx="2" />

                  {/* Center Emblem Base */}
                  <rect x="75" y="75" width="50" height="50" fill="#00a884" rx="12" />
                  <circle cx="100" cy="100" r="14" fill="#ffffff" />
                  <circle cx="100" cy="100" r="8" fill="#00a884" />

                  <rect x="140" y="75" width="8" height="8" rx="2" />
                  <rect x="160" y="85" width="8" height="8" rx="2" />
                  <rect x="175" y="75" width="8" height="8" rx="2" />

                  <rect x="75" y="140" width="8" height="8" rx="2" />
                  <rect x="95" y="135" width="8" height="8" rx="2" />
                  <rect x="110" y="145" width="8" height="8" rx="2" />
                  <rect x="80" y="165" width="8" height="8" rx="2" />
                  <rect x="100" y="170" width="8" height="8" rx="2" />
                  <rect x="140" y="140" width="8" height="8" rx="2" />
                  <rect x="165" y="150" width="8" height="8" rx="2" />
                  <rect x="150" y="170" width="8" height="8" rx="2" />
                  <rect x="175" y="175" width="8" height="8" rx="2" />
                </g>
              </svg>
            </div>

            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Your QR code is private. When scanned, others see your profile and can send you a contact request.
            </p>

            {/* Action Buttons */}
            <div className="w-full grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={handleDownloadQR}
                className="py-2.5 px-3 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Save QR Image</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                  isDark
                    ? 'border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-white'
                    : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800'
                }`}
              >
                {copied ? <Check className="w-4 h-4 text-[#00a884]" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Link Copied!' : 'Copy Link'}</span>
              </button>
            </div>

            {/* Regenerate Link */}
            <button
              type="button"
              onClick={handleRegenerateLink}
              className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Regenerate or revoke old link</span>
            </button>
          </div>
        )}

        {/* Tab 2: Scan QR */}
        {tab === 'scan' && (
          <div className="p-6 flex flex-col items-center space-y-4">
            {!scannedResult ? (
              <>
                <div className="w-full aspect-square max-w-[240px] rounded-2xl border-2 border-dashed border-[#00a884]/60 flex flex-col items-center justify-center p-4 relative overflow-hidden bg-black/20">
                  <Camera className="w-10 h-10 text-[#00a884] mb-2 animate-bounce" />
                  <p className="text-xs text-center text-slate-400">
                    Align QR code inside the frame to discover contact
                  </p>
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-[#00a884] to-transparent animate-pulse" />
                </div>

                <div className="w-full flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSimulateScan}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>Scan Sample QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                      isDark
                        ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-white'
                        : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800'
                    }`}
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload Image</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleSimulateScan}
                  />
                </div>
              </>
            ) : (
              /* Scanned Contact Profile Card */
              <div className="w-full p-4 rounded-2xl border border-[#00a884]/40 bg-[#00a884]/10 space-y-4 animate-in zoom-in-95">
                <div className="flex items-center gap-3">
                  <img
                    src={scannedResult.avatar}
                    alt={scannedResult.name}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-[#00a884]"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-base">{scannedResult.name}</h4>
                      <span className="p-0.5 rounded-full bg-[#00a884] text-white">
                        <ShieldCheck className="w-3 h-3" />
                      </span>
                    </div>
                    <p className="text-xs text-[#00a884] font-medium">@{scannedResult.username}</p>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{scannedResult.about}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      onAddScannedContact({
                        name: scannedResult.name,
                        phone: scannedResult.phone,
                        phoneNormalized: scannedResult.phone,
                        avatar: scannedResult.avatar,
                        about: scannedResult.about,
                      });
                      onClose();
                    }}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow"
                  >
                    <UserCheck className="w-4 h-4" />
                    <span>Add Contact &amp; Chat</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScannedResult(null)}
                    className="py-2.5 px-3 rounded-xl border border-slate-700 text-xs font-semibold hover:bg-white/10"
                  >
                    Scan Another
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
