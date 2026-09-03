"use client";

import {
  STANCE_GOLD,
  STANCE_TEAL,
  STANCE_VERMILLION,
  STANCE_POLARITY_LABELS,
  type StancePolarity,
} from "@/lib/stances";

export interface OnTheRecordItem {
  id: string;
  polarity: StancePolarity;
  confidence: number;
  evidence_quote: string | null;
  source_url: string | null;
  as_of: string | null;
  subject_title: string;
}

function polarityColor(polarity: StancePolarity): string {
  if (polarity === "oppose") return STANCE_VERMILLION;
  if (polarity === "endorse") return STANCE_GOLD;
  if (polarity === "support") return STANCE_TEAL;
  return "#6B6B6B";
}

export default function OnTheRecord({
  items,
  bare = false,
}: {
  items: OnTheRecordItem[];
  bare?: boolean;
}) {
  if (items.length === 0) return null;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <h4
          className={
            bare
              ? "text-[11px] uppercase tracking-wide text-ink-muted font-body"
              : "font-heading font-semibold text-sm text-ink"
          }
        >
          On the record
        </h4>
        {bare && (
          <span className="text-[10px] font-body tabular-nums text-ink-faint">
            {items.length}
          </span>
        )}
      </div>
      <p className="text-[11px] font-body text-ink-muted">
        Quote-backed support, oppose, or endorse — not inferred from boards.
      </p>
      <ul className="space-y-1.5">
        {items.map((row) => (
          <li key={row.id} className="text-[13px] font-body text-forest-700 leading-snug">
            <span
              className="text-[11px] uppercase tracking-wide mr-1.5"
              style={{ color: polarityColor(row.polarity) }}
            >
              {STANCE_POLARITY_LABELS[row.polarity]}
            </span>
            {row.subject_title}
            {row.as_of ? (
              <span className="text-[11px] text-ink-muted"> · {row.as_of}</span>
            ) : null}
            {row.evidence_quote && (
              <p className="text-xs text-forest-600 mt-0.5 leading-relaxed">
                “{row.evidence_quote}”
              </p>
            )}
            {row.source_url && (
              <a
                href={row.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] underline hover:text-ink"
              >
                Source ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </>
  );

  if (bare) return <section className="space-y-1">{body}</section>;

  return (
    <div className="rounded-md border border-line bg-surface p-3 space-y-2">
      {body}
    </div>
  );
}
