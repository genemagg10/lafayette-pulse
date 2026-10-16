"use client";

import type { ReactNode } from "react";

export type MobileStep = "list" | "detail" | "viz";

interface FocusPanesProps {
  master: ReactNode;
  viz: ReactNode;
  detail: ReactNode;
  vizLabel: string;
  vizBackStep?: MobileStep;
  mobileStep: MobileStep;
  onMobileStep: (step: MobileStep) => void;
  /** Dark “Open {vizLabel}” bar. People/orgs replace this with a preview card. */
  showOpenControl?: boolean;
  /**
   * "column" (default): detail is a permanent right column on desktop.
   * "overlay": no right column; detail floats as a dismissible card over the viz
   * on desktop, shown only while detailOpen is true.
   */
  detailMode?: "column" | "overlay";
  detailOpen?: boolean;
  onCloseDetail?: () => void;
  detailTitle?: string;
}

export default function FocusPanes({
  master,
  viz,
  detail,
  vizLabel,
  vizBackStep = "detail",
  mobileStep,
  onMobileStep,
  showOpenControl = true,
  detailMode = "column",
  detailOpen = false,
  onCloseDetail,
  detailTitle = "Details",
}: FocusPanesProps) {
  const overlay = detailMode === "overlay";
  return (
    <div className="h-full min-h-0">
      <div
        className={`hidden lg:grid h-full min-h-0 ${
          overlay
            ? "lg:grid-cols-[minmax(240px,theme(width.master))_minmax(0,1fr)]"
            : "lg:grid-cols-[minmax(240px,theme(width.master))_minmax(0,1fr)_minmax(280px,theme(width.detail))]"
        }`}
      >
        <aside className="min-h-0 overflow-y-auto border-r border-line bg-surface p-3">
          {master}
        </aside>
        <section className="relative min-w-0 min-h-viz h-full overflow-hidden flex flex-col bg-canvas p-3">
          {viz}
          {overlay && detailOpen && (
            <div
              role="dialog"
              aria-label={detailTitle}
              className="absolute right-3 top-3 bottom-3 z-30 w-[min(24rem,45%)] flex flex-col rounded-md border border-line bg-surface shadow-[0_12px_32px_rgba(26,36,32,0.18)]"
            >
              <div className="flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-line">
                <span className="font-heading font-semibold text-sm text-ink">
                  {detailTitle}
                </span>
                <button
                  type="button"
                  onClick={onCloseDetail}
                  className="text-sm font-body text-ink-muted hover:text-ink leading-none px-1"
                  aria-label={`Close ${detailTitle.toLowerCase()}`}
                >
                  Close ✕
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-3">{detail}</div>
            </div>
          )}
        </section>
        {!overlay && (
          <aside className="min-h-0 overflow-y-auto border-l border-line bg-surface p-3">
            {detail}
          </aside>
        )}
      </div>

      <div className="lg:hidden h-full min-h-0 flex flex-col">
        {mobileStep !== "list" && mobileStep !== "viz" && (
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-line bg-surface">
            <button
              type="button"
              onClick={() => onMobileStep("list")}
              className="text-sm font-body text-forest-700 hover:text-forest-900"
            >
              ← List
            </button>
            <span className="font-heading text-sm text-ink">Detail</span>
          </div>
        )}
        <div
          className={`flex-1 min-h-0 p-3 ${
            mobileStep === "viz" ? "hidden" : "overflow-y-auto"
          }`}
        >
          {mobileStep === "list" && master}
          {mobileStep === "detail" && (
            <div className="space-y-4">
              {detail}
              {showOpenControl && (
                <button
                  type="button"
                  onClick={() => onMobileStep("viz")}
                  className="w-full rounded-none bg-forest-800 text-cream-50 font-heading text-sm py-3 hover:bg-forest-700"
                >
                  Open {vizLabel}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {mobileStep === "viz" && (
        <div className="lg:hidden fixed inset-x-0 top-0 bottom-14 z-30 bg-canvas flex flex-col">
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-line bg-surface">
            <button
              type="button"
              onClick={() => onMobileStep(vizBackStep)}
              className="text-sm font-body text-forest-700 hover:text-forest-900"
            >
              ← {vizBackStep === "list" ? "List" : "Detail"}
            </button>
            <span className="font-heading text-sm text-ink">{vizLabel}</span>
          </div>
          <div className="flex-1 min-h-viz p-3 flex flex-col">{viz}</div>
        </div>
      )}
    </div>
  );
}
