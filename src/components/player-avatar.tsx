type PlayerAvatarProps = {
  src?: string | null;
  name: string;
  size?: number;
  className?: string;
};

/** 玩家头像；无图时用昵称首字占位 */
export function PlayerAvatar({
  src,
  name,
  size = 40,
  className = "",
}: PlayerAvatarProps) {
  const initial = (name || "?").replace(/^\u007f+/, "").trim().slice(0, 1) || "?";

  if (!src) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-black/35 font-medium text-[var(--gold)] ${className}`}
        style={{ width: size, height: size, fontSize: Math.max(12, size * 0.4) }}
        aria-hidden
      >
        {initial}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full border border-[var(--line)] object-cover ${className}`}
      style={{ width: size, height: size }}
      referrerPolicy="no-referrer"
    />
  );
}
