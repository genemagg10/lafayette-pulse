"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import lafayetteMark from "../../public/lafayette-emblem.png";
import { MORE_LINKS, PRIMARY_NAV, isFocusPath } from "@/lib/layout-ia";
import { useHealth } from "@/lib/use-health";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { freshness } = useHealth();
  const [moreOpen, setMoreOpen] = useState(false);
  const focus = isFocusPath(pathname);
  const hideMobileBrand = pathname === "/map";

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  return (
    <div
      className={`min-h-dvh flex flex-col bg-canvas text-ink ${
        hideMobileBrand ? "pulse-shell-map" : ""
      } ${focus ? "pulse-shell-focus" : ""}`}
    >
      <header className="hidden md:flex sticky top-0 z-40 h-chrome items-center bg-surface border-b border-line">
        <div className="w-full px-4 flex items-center gap-6">
          <Brand />
          <nav className="flex items-center gap-1" aria-label="Primary">
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.id}
                href={item.href}
                label={item.label}
                active={isActive(pathname, item.href)}
              />
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 relative">
            <MoreButton open={moreOpen} onToggle={() => setMoreOpen((v) => !v)} />
            {moreOpen && (
              <MorePanel
                className="absolute right-0 top-[calc(100%+8px)]"
                onNavigate={() => setMoreOpen(false)}
              />
            )}
            <FreshnessChip
              label={freshness.label}
              unavailable={freshness.unavailable}
            />
          </div>
        </div>
      </header>

      {!hideMobileBrand && (
        <div className="md:hidden sticky top-0 z-40 h-12 flex items-center justify-between px-4 bg-surface border-b border-line text-ink">
          <Brand compact />
          <FreshnessChip
            label={freshness.label}
            unavailable={freshness.unavailable}
          />
        </div>
      )}

      <div
        className={`flex-1 min-h-0 ${
          focus ? "overflow-hidden" : "pb-chrome md:pb-0"
        }`}
      >
        {children}
      </div>

      {!focus && (
        <footer className="hidden md:block border-t border-line bg-surface text-ink-muted py-4 text-center text-xs font-body">
          <p>
            Lafayette Pulse &middot; Map, calendar &amp; who&apos;s who &middot;
            Public records
            <span className="mx-1.5">·</span>
            <a href="/api/health" className="underline hover:text-ink">
              Health
            </a>
            <span className="mx-1.5">·</span>
            <Link href="/more" className="underline hover:text-ink">
              More
            </Link>
          </p>
        </footer>
      )}

      {moreOpen && (
        <button
          type="button"
          aria-label="Close More menu"
          className="fixed inset-0 z-30 bg-transparent"
          onClick={() => setMoreOpen(false)}
        />
      )}

      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-chrome bg-surface text-ink border-t border-line"
        aria-label="Primary"
      >
        <div className="h-full grid grid-cols-5">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className={`flex flex-col items-center justify-center text-[11px] font-body ${
                isActive(pathname, item.href)
                  ? "text-ink font-semibold bg-canvas"
                  : "text-ink-muted"
              }`}
            >
              <span>{item.label}</span>
            </Link>
          ))}
          <div className="relative flex">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className={`flex-1 flex flex-col items-center justify-center text-[11px] font-body ${
                pathname === "/projects" ||
                pathname === "/more" ||
                pathname === "/ask"
                  ? "text-ink font-semibold bg-canvas"
                  : "text-ink-muted"
              }`}
            >
              More
            </button>
            {moreOpen && (
              <MorePanel
                className="absolute bottom-[calc(100%+8px)] right-2"
                onNavigate={() => setMoreOpen(false)}
              />
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 flex-shrink-0 text-ink">
      <Image
        src={lafayetteMark}
        alt="City of Lafayette emblem"
        priority
        height={compact ? 24 : 28}
        width={compact ? 27 : 32}
        className="flex-shrink-0"
      />
      <span
        className={`font-heading font-bold tracking-tight ${compact ? "text-base" : "text-lg"}`}
      >
        Lafayette Pulse
      </span>
    </Link>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`px-3 py-1.5 text-sm font-body transition-colors border-b-2 ${
        active
          ? "border-accent text-ink font-semibold"
          : "border-transparent text-ink-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

function MoreButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`px-3 py-1.5 text-sm font-body border transition-colors ${
        open
          ? "bg-canvas text-ink border-line"
          : "bg-surface text-forest-600 border-line hover:border-forest-400"
      }`}
    >
      More
    </button>
  );
}

function MorePanel({
  onNavigate,
  className = "",
}: {
  onNavigate: () => void;
  className?: string;
}) {
  return (
    <div
      className={`z-50 w-72 border border-line bg-surface text-ink p-2 ${className}`}
    >
      {MORE_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={onNavigate}
          className="block px-3 py-2.5 hover:bg-canvas"
        >
          <div className="font-heading font-semibold text-sm">{link.label}</div>
          <div className="text-xs font-body text-ink-muted">{link.description}</div>
        </Link>
      ))}
      <a
        href="/api/health"
        className="block px-3 py-2.5 hover:bg-canvas text-sm font-body text-forest-600"
      >
        Open /api/health ↗
      </a>
    </div>
  );
}

function FreshnessChip({
  label,
  unavailable,
}: {
  label: string;
  unavailable: boolean;
}) {
  return (
    <Link
      href="/more"
      className={`px-3 py-1 font-body text-xs border ${
        unavailable
          ? "bg-amber-50 text-forest-900 border-amber-300"
          : "bg-canvas text-forest-600 border-line"
      }`}
      title={label}
    >
      {label}
    </Link>
  );
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
