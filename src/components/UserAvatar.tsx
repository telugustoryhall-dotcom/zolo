
import React from "react";

interface UserAvatarProps {
  name?: string;
  src?: string | null;
  avatar?: string | null;
  imageUrl?: string | null;
  size?: number | string;
  className?: string;
  online?: boolean;
  isOnline?: boolean;
  showOnline?: boolean;
  onClick?: () => void;
}

export function UserAvatar({
  name = "User",
  src,
  avatar,
  imageUrl,
  size = 40,
  className = "",
  online = false,
  isOnline = false,
  showOnline = false,
  onClick,
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = React.useState(false);

  const image = src || avatar || imageUrl;
  const dimension =
    typeof size === "number" ? `${size}px` : size;

  const initials =
    name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-white ${className}`}
      style={{ width: dimension, height: dimension }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      {image && !imageFailed ? (
        <img
          src={image}
          alt={name}
          className="h-full w-full rounded-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="select-none font-semibold">
          {initials}
        </span>
      )}

      {(online || isOnline || showOnline) && (
        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-green-500" />
      )}
    </div>
  );
}
