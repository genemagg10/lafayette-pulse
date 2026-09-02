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

export default function OnTheRecord({ items }: { items: OnTheRecordItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-cream-200 bg-white p-3 space-y-2">
      <h4 className="font-heading font-semibold text-sm text-forest-800">
        On the record
      </h4>
      <p className="text-[11px] font-body text-forest-500">
        Quote-backed support, oppose, or endorse — not inferred from boards.
      </p>
      <ul className="space-y-2">
        {items.map((row) => (
          <li key={row.id} className="text-sm font-body text-forest-700">
            <span
              className="text-[11px] uppercase tracking-wide mr-1.5"
              style={{ color: polarityColor(row.polarity) }}
            >
              {STANCE_POLARITY_LABELS[row.polarity]}
            </span>
            {row.subject_title}
            {row.as_of ? (
              <span className="text-[11px] text-forest-500"> · {row.as_of}</span>
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
                className="text-[11px] underline hover:text-forest-800"
              >
                Source ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
