export function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function PersonAvatar({
  name,
  photoUrl,
  size = 36,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0 bg-forest-100"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className="rounded-full bg-forest-800 text-cream-50 flex items-center justify-center font-heading font-semibold flex-shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.36) }}
      aria-hidden="true"
    >
      {personInitials(name)}
    </div>
  );
}
