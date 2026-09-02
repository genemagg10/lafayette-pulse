"use client";

import type { ReactNode } from "react";

export type MobileStep = "list" | "detail" | "viz";

interface FocusPanesProps {
  master: ReactNode;
  viz: ReactNode;
  detail: ReactNode;
  vizLabel: string;
  mobileStep: MobileStep;
  onMobileStep: (step: MobileStep) => void;
}

export default function FocusPanes({
  master,
  viz,
  detail,
  vizLabel,
  mobileStep,
  onMobileStep,
}: FocusPanesProps) {
  return (
    <div className="h-full min-h-0">
      <div className="hidden lg:grid h-full min-h-0 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)_minmax(280px,340px)]">
        <aside className="min-h-0 overflow-y-auto border-r border-cream-200 bg-white p-3">
          {master}
        </aside>
        <section className="min-w-0 min-h-[420px] h-full overflow-hidden flex flex-col bg-cream-50 p-3">
          {viz}
        </section>
        <aside className="min-h-0 overflow-y-auto border-l border-cream-200 bg-white p-3">
          {detail}
        </aside>
      </div>

      <div className="lg:hidden h-full min-h-0 flex flex-col">
        {mobileStep !== "list" && mobileStep !== "viz" && (
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-cream-200 bg-white">
            <button
              type="button"
              onClick={() => onMobileStep("list")}
              className="text-sm font-body text-forest-700 hover:text-forest-900"
            >
              ← List
            </button>
            <span className="font-heading text-sm text-forest-800">Detail</span>
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
              <button
                type="button"
                onClick={() => onMobileStep("viz")}
                className="w-full rounded-lg bg-forest-800 text-cream-50 font-heading text-sm py-3 hover:bg-forest-700"
              >
                Open {vizLabel}
              </button>
            </div>
          )}
        </div>
      </div>

      {mobileStep === "viz" && (
        <div className="lg:hidden fixed inset-x-0 top-0 bottom-14 z-30 bg-cream-50 flex flex-col">
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-cream-200 bg-white">
            <button
              type="button"
              onClick={() => onMobileStep("detail")}
              className="text-sm font-body text-forest-700 hover:text-forest-900"
            >
              ← Detail
            </button>
            <span className="font-heading text-sm text-forest-800">{vizLabel}</span>
          </div>
          <div className="flex-1 min-h-[420px] p-3 flex flex-col">{viz}</div>
        </div>
      )}
    </div>
  );
}
