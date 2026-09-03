"use client";

import dynamic from "next/dynamic";
import GraphLegend from "./graph/GraphLegend";
import type { LabeledStance } from "@/lib/stances";
import { STANCE_GOLD, STANCE_TEAL, STANCE_VERMILLION } from "@/lib/stances";
import type { RenderableEdge, RenderableNode } from "./graph/CivicGraph";

const CivicGraph = dynamic(() => import("./graph/CivicGraph"), { ssr: false });

interface ConflictRibbonProps {
  nodes: RenderableNode[];
  edges: RenderableEdge[];
  centerId: string;
  stances: Array<
    Pick<
      LabeledStance,
      | "id"
      | "actor_label"
      | "polarity"
      | "confidence"
      | "evidence_quote"
      | "source_url"
      | "as_of"
    >
  >;
  emptyHint?: string;
  showList?: boolean;
  showGraph?: boolean;
  heightClassName?: string;
}

function polarityStyle(polarity: string): { color: string; dashed?: boolean } {
  if (polarity === "oppose") return { color: STANCE_VERMILLION, dashed: true };
  if (polarity === "endorse") return { color: STANCE_GOLD };
  return { color: STANCE_TEAL };
}

export default function ConflictRibbon({
  nodes,
  edges,
  centerId,
  stances,
  emptyHint,
  showList = true,
  showGraph = true,
  heightClassName = "h-[280px] sm:h-[340px]",
}: ConflictRibbonProps) {
  const support = stances.filter((row) => row.polarity === "support").length;
  const oppose = stances.filter((row) => row.polarity === "oppose").length;
  const endorse = stances.filter((row) => row.polarity === "endorse").length;

  if (stances.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line-strong bg-canvas p-4">
        <p className="text-sm font-body text-forest-600">
          {emptyHint ||
            "No attributed support or oppose on this measure yet. The ribbon does not infer a clash from overlapping membership."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs font-body text-forest-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-6 border-t-2" style={{ borderColor: STANCE_TEAL }} />
          Support {support}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="w-6 border-t-2 border-dashed"
            style={{ borderColor: STANCE_VERMILLION }}
          />
          Oppose {oppose}
        </span>
        {endorse > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-6 border-t-2" style={{ borderColor: STANCE_GOLD }} />
            Endorse {endorse}
          </span>
        )}
      </div>
      {showGraph && (
        <CivicGraph
          nodes={nodes}
          edges={edges}
          centerId={centerId}
          layout="ribbon"
          heightClassName={heightClassName}
        />
      )}
      {showGraph && <GraphLegend stance showSeats={false} nodes={nodes} />}
      {showList && (
        <ul className="space-y-2">
          {stances.map((row) => {
            const style = polarityStyle(row.polarity);
            return (
              <li
                key={row.id}
                className="rounded-lg border border-line bg-surface p-3 text-sm font-body text-forest-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-heading font-semibold">{row.actor_label}</span>
                    <span
                      className="ml-2 text-[11px] uppercase tracking-wide"
                      style={{ color: style.color }}
                    >
                      {row.polarity}
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-muted tabular-nums">
                    {Math.round(row.confidence * 100)}%
                  </span>
                </div>
                {row.evidence_quote && (
                  <p className="mt-1 text-xs text-forest-600 leading-relaxed">
                    “{row.evidence_quote}”
                  </p>
                )}
                <p className="mt-1 text-[11px] text-ink-muted">
                  {row.as_of ? `As of ${row.as_of}` : "Date not recorded"}
                  {row.source_url ? (
                    <>
                      {" · "}
                      <a
                        href={row.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-ink"
                      >
                        Source ↗
                      </a>
                    </>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
