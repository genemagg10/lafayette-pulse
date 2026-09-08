"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  networkPreviewFits,
  resolveNetworkPreviewLabel,
} from "@/lib/network-preview";

/**
 * Quiet static schematic of a person ego: one person circle, a few org
 * squares, a few smaller people, thin faint lines. Not a live Sigma graph.
 */
function NetworkSchematic() {
  return (
    <svg
      viewBox="0 0 96 52"
      width="96"
      height="52"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <g
        fill="none"
        stroke="var(--ink-faint)"
        strokeWidth="0.75"
        strokeOpacity="0.55"
      >
        <line x1="20" y1="26" x2="40" y2="12" />
        <line x1="20" y1="26" x2="46" y2="26" />
        <line x1="20" y1="26" x2="40" y2="40" />
        <line x1="50" y1="12" x2="74" y2="10" />
        <line x1="56" y1="26" x2="80" y2="26" />
        <line x1="50" y1="40" x2="74" y2="42" />
      </g>
      <circle cx="18" cy="26" r="7.5" fill="var(--forest)" />
      <rect
        x="38"
        y="7"
        width="11"
        height="11"
        rx="1.25"
        fill="var(--accent)"
      />
      <rect
        x="44"
        y="20.5"
        width="11"
        height="11"
        rx="1.25"
        fill="var(--accent)"
      />
      <rect
        x="38"
        y="34"
        width="11"
        height="11"
        rx="1.25"
        fill="var(--accent)"
      />
      <circle cx="76" cy="10" r="4" fill="var(--ink-muted)" />
      <circle cx="84" cy="26" r="4" fill="var(--ink-muted)" />
      <circle cx="76" cy="42" r="4" fill="var(--ink-muted)" />
    </svg>
  );
}

export default function NetworkPreviewCard({
  label,
  onOpen,
}: {
  label: string;
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
      // Same height as the static schematic (96×52). Do not grow the card.
      const availableHeight = 52;
      if (availableWidth <= 0) {
        setShown(label);
        return;
      }
      probe.style.width = `${availableWidth}px`;
      const fits = networkPreviewFits({
        availableWidth,
        availableHeight,
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
      className="lg:hidden w-full rounded-md border border-line bg-surface px-3 py-2.5 text-left hover:bg-canvas focus:outline-none focus:ring-2 focus:ring-forest-500/30"
    >
      <span className="flex items-center gap-3">
        <NetworkSchematic />
        <span
          ref={slotRef}
          className="relative min-w-0 flex-1 overflow-hidden"
        >
          <span
            ref={probeRef}
            className="invisible absolute left-0 top-0 font-heading text-sm leading-snug"
            aria-hidden="true"
          >
            {label}
          </span>
          <span className="block font-heading text-sm text-ink leading-snug">
            {shown}
          </span>
        </span>
      </span>
    </button>
  );
}
