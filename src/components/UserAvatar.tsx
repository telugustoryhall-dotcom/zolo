import React, { useState, useEffect } from 'react';
import { User } from 'lucide-react';

interface UserAvatarProps {
  src?: string | null;
  name?: string;
  className?: string;
  textClassName?: string;
}

const AVATAR_BG_PALETTE = [
  'bg-[#007a60]',
  'bg-[#0f5fa6]',
  'bg-[#1e6b7b]',
  'bg-[#2b547e]',
  'bg-[#0d7377]',
  'bg-[#3b5998]',
];

function getInitials(name?: string): string {
  if (!name || !name.trim()) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

function getPaletteClass(name?: string): string {
  if (!name) return AVATAR_BG_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_BG_PALETTE[Math.abs(hash) % AVATAR_BG_PALETTE.length];
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  name,
  className = 'w-10 h-10',
  textClassName = 'text-xs',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [src]);

  const initials = getInitials(name);
  const bgClass = getPaletteClass(name);

  if (src && !imgFailed) {
    return (
      <div className={`rounded-full overflow-hidden shrink-0 bg-slate-700 ${className}`}>
        <img
          src={src}
          alt={name || 'Profile avatar'}
          onError={() => setImgFailed(true)}
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-full overflow-hidden shrink-0 flex items-center justify-center font-bold text-white select-none ${bgClass} ${className}`}
      aria-label={name || 'Default avatar'}
    >
      {initials ? (
        <span className={textClassName}>{initials}</span>
      ) : (
        <User className="w-1/2 h-1/2 text-white/85" />
      )}
    </div>
  );
};
