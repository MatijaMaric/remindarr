import { cn } from "@/lib/utils";

interface AvatarProps {
  username: string;
  displayName?: string | null;
  image?: string | null;
  size?: number;
  fontSize?: number;
  className?: string;
}

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

function initialsFor(displayName: string | null | undefined, username: string): string {
  const src = (displayName?.trim() || username || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function Avatar({
  username,
  displayName,
  image,
  size = 32,
  fontSize,
  className,
}: AvatarProps) {
  const hue = hashHue(username);
  const initials = initialsFor(displayName, username);
  const px = `${size}px`;
  const fz = fontSize ?? Math.round(size * 0.38);

  if (image) {
    return (
      <img
        src={image}
        alt={displayName ?? username}
        width={size}
        height={size}
        className={cn("rounded-full object-cover flex-shrink-0", className)}
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-extrabold text-black flex-shrink-0 select-none",
        className,
      )}
      style={{
        width: px,
        height: px,
        background: `oklch(0.6 0.12 ${hue})`,
        fontSize: `${fz}px`,
        letterSpacing: "-0.03em",
      }}
      aria-label={displayName ?? username}
      data-testid="avatar"
      data-hue={hue}
    >
      {initials}
    </div>
  );
}
