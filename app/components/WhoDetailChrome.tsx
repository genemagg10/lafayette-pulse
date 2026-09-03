"use client";

import { useState, type ReactNode } from "react";
import FootprintChip from "./FootprintChip";
import PersonAvatar from "./PersonAvatar";

export function StickyDetailChrome({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 -mx-3 px-3 pb-2 bg-surface space-y-2">
      {children}
    </div>
  );
}

export function IdentityHeader({
  name,
  subtitle,
  footprint,
  email,
  website,
  photoUrl,
  showAvatar = true,
}: {
  name: string;
  subtitle?: string | null;
  footprint?: number | null;
  email?: string | null;
  website?: string | null;
  photoUrl?: string | null;
  showAvatar?: boolean;
}) {
  return (
    <header className="rounded-md border border-line bg-surface-muted px-3 py-2.5">
      <div className="flex items-start gap-2.5">
        {showAvatar && <PersonAvatar name={name} photoUrl={photoUrl} size={40} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-heading font-semibold text-[15px] leading-snug text-ink">
              {name}
            </h3>
            {footprint != null && <FootprintChip score={footprint} />}
          </div>
          {subtitle && (
            <p className="text-[11px] font-body text-ink-muted mt-0.5 leading-snug">
              {subtitle}
            </p>
          )}
          {(email || website) && (
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-body text-ink-muted">
              {email && (
                <a href={`mailto:${email}`} className="underline hover:text-ink">
                  {email}
                </a>
              )}
              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-ink"
                >
                  Website ↗
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function DetailSection<T>({
  title,
  items,
  renderItem,
  getKey,
  initialVisible = 6,
  empty,
}: {
  title: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  getKey?: (item: T, index: number) => string;
  initialVisible?: number;
  empty?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) {
    return empty ? (
      <section className="space-y-1">
        <h4 className="text-[11px] uppercase tracking-wide text-ink-muted font-body">
          {title}
        </h4>
        {empty}
      </section>
    ) : null;
  }

  const visible = expanded ? items : items.slice(0, initialVisible);
  const hidden = items.length - visible.length;

  return (
    <section className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-[11px] uppercase tracking-wide text-ink-muted font-body">
          {title}
        </h4>
        <span className="text-[10px] font-body tabular-nums text-ink-faint">
          {items.length}
        </span>
      </div>
      <ul className="text-[13px] font-body text-forest-700 leading-snug space-y-1">
        {visible.map((item, index) => (
          <li key={getKey ? getKey(item, index) : String(index)}>
            {renderItem(item, index)}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[11px] font-body text-forest-700 underline hover:text-forest-900"
        >
          Show all {items.length}
        </button>
      )}
      {expanded && items.length > initialVisible && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-[11px] font-body text-forest-700 underline hover:text-forest-900"
        >
          Show fewer
        </button>
      )}
    </section>
  );
}

export function DetailLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  if (!onClick) return <>{children}</>;
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left underline hover:text-forest-900"
    >
      {children}
    </button>
  );
}
