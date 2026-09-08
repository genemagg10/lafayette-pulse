"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  networkPreviewFits,
  resolveNetworkPreviewLabel,
} from "@/lib/network-preview";

/**
 * Quiet mobile-list door to the existing unselected overview graph.
 * Label only — not the selected-person / selected-org preview card.
 */
export default function NetworkListDoor({
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
      if (availableWidth <= 0) {
        setShown(label);
        return;
      }
      const fits = networkPreviewFits({
        availableWidth,
        availableHeight: Number.POSITIVE_INFINITY,
        contentWidth: probe.scrollWidth,
        contentHeight: 1,
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
      <span
        ref={slotRef}
        className="relative block min-w-0 overflow-hidden"
      >
        <span
          ref={probeRef}
          className="invisible absolute left-0 top-0 font-heading text-sm leading-snug whitespace-nowrap"
          aria-hidden="true"
        >
          {label}
        </span>
        <span className="block font-heading text-sm text-ink leading-snug whitespace-nowrap">
          {shown}
        </span>
      </span>
    </button>
  );
}
