"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  WHO_NETWORK_WELL_SIZE,
  networkPreviewFits,
  resolveNetworkPreviewLabel,
  type WhoNetworkSchematic,
} from "@/lib/network-preview";

const WELL = WHO_NETWORK_WELL_SIZE;
/** One label style on every door — same face, size, weight as the person card. Ink. */
const LABEL_CLASS =
  "font-heading font-semibold text-[15px] leading-snug text-ink";

function OverviewSchematic() {
  return (
    <svg viewBox="0 0 44 44" width="100%" height="100%" aria-hidden="true">
      <circle cx="11" cy="13" r="2.4" fill="var(--oak)" />
      <circle cx="23" cy="10" r="1.8" fill="var(--sage)" />
      <circle cx="33" cy="15" r="2.5" fill="var(--gold)" />
      <circle cx="8" cy="24" r="2" fill="var(--sage)" />
      <circle cx="19" cy="21" r="1.6" fill="var(--gold)" />
      <circle cx="30" cy="24" r="2.2" fill="var(--oak)" />
      <circle cx="37" cy="29" r="1.8" fill="var(--sage)" />
      <circle cx="14" cy="33" r="2.4" fill="var(--oak)" />
      <circle cx="25" cy="35" r="2.1" fill="var(--gold)" />
      <circle cx="34" cy="37" r="1.7" fill="var(--sage)" />
    </svg>
  );
}

function PersonEgoSchematic() {
  return (
    <svg viewBox="0 0 44 44" width="100%" height="100%" aria-hidden="true">
      <g fill="none" stroke="var(--line-strong)" strokeWidth="0.9">
        <line x1="11" y1="22" x2="22" y2="22" />
        <line x1="22" y1="22" x2="33" y2="22" />
      </g>
      <rect x="6" y="17.5" width="9" height="9" rx="1.2" fill="var(--gold)" />
      <circle cx="34.5" cy="22" r="4" fill="var(--sage)" />
      <circle cx="22" cy="22" r="6.2" fill="var(--oak)" />
    </svg>
  );
}

function OrgEgoSchematic() {
  return (
    <svg viewBox="0 0 44 44" width="100%" height="100%" aria-hidden="true">
      <g fill="none" stroke="var(--line-strong)" strokeWidth="0.9">
        <line x1="22" y1="22" x2="32" y2="13" />
        <line x1="22" y1="22" x2="13" y2="32" />
      </g>
      <circle cx="33" cy="12.5" r="4" fill="var(--sage)" />
      <circle cx="12" cy="33" r="4" fill="var(--gold)" />
      <rect x="15.5" y="15.5" width="13" height="13" rx="1.5" fill="var(--oak)" />
    </svg>
  );
}

function Schematic({ kind }: { kind: WhoNetworkSchematic }) {
  if (kind === "person") return <PersonEgoSchematic />;
  if (kind === "org") return <OrgEgoSchematic />;
  return <OverviewSchematic />;
}

/**
 * One mobile Who card family. Same chrome on every door — surface, hairline,
 * quiet well on the left, ink label. Only the drawing inside the well changes.
 */
export default function WhoNetworkCard({
  label,
  schematic,
  onOpen,
}: {
  label: string;
  schematic: WhoNetworkSchematic;
  onOpen: () => void;
}) {
  const slotRef = useRef<HTMLSpanElement>(null);
  const probeRef = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(label);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    const probe = probeRef.current;
    if (!slot || !probe) return;

    const update = () => {
      const availableWidth = slot.clientWidth;
      if (availableWidth <= 0) {
        setShown(label);
        return;
      }
      probe.style.width = `${availableWidth}px`;
      const fits = networkPreviewFits({
        availableWidth,
        availableHeight: WELL,
        contentWidth: probe.scrollWidth,
        contentHeight: probe.scrollHeight,
      });
      setShown(resolveNetworkPreviewLabel(label, fits));
    };

    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(slot);
    return () => ro.disconnect();
  }, [label]);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      className="lg:hidden w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-surface-muted">
          <span className="block h-9 w-9">
            <Schematic kind={schematic} />
          </span>
        </span>
        <span
          ref={slotRef}
          className="relative min-w-0 flex-1 overflow-hidden"
        >
          <span
            ref={probeRef}
            className={`invisible absolute left-0 top-0 ${LABEL_CLASS}`}
            aria-hidden="true"
          >
            {label}
          </span>
          <span className={`block ${LABEL_CLASS}`}>{shown}</span>
        </span>
      </span>
    </button>
  );
}
