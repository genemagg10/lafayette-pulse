"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type {
  InvolvementItem,
  InvolvementMetric,
  InvolvementResponse,
} from "@/lib/civic-graph";
import { scaleSize } from "@/lib/civic-graph";
import GraphLegend from "./graph/GraphLegend";
import type { RenderableEdge, RenderableNode } from "./graph/CivicGraph";

const CivicGraph = dynamic(() => import("./graph/CivicGraph"), { ssr: false });

interface InvolvementBoardProps {
  memberships: number | null;
  seatHolders: number | null;
  unavailable?: boolean;
  onSelectPerson?: (id: string) => void;
}

export default function InvolvementBoard({
  memberships,
  seatHolders,
  unavailable,
  onSelectPerson,
}: InvolvementBoardProps) {
  const [entity, setEntity] = useState<"person" | "org">("person");
  const [metric, setMetric] = useState<InvolvementMetric>("degree");
  const [data, setData] = useState<InvolvementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      entity,
      metric,
      current_only: "true",
      limit: "50",
    });
    setLoading(true);
    setError(null);
    fetch(`/api/graph/involvement?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        return json as InvolvementResponse;
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setData(null);
        setLoading(false);
      });
  }, [entity, metric]);

  const maxScore = data?.items[0]?.score ?? 1;
  const graph = useMemo(() => {
    if (!data) return { nodes: [] as RenderableNode[], edges: [] as RenderableEdge[] };
    const top = data.items.slice(0, 12);
    const nodes: RenderableNode[] = [];
    const edges: RenderableEdge[] = [];
    const seen = new Set<string>();
    const scores = top.map((item) => item.score);
    const min = Math.min(...scores, 0);
    const max = Math.max(...scores, 1);

    for (const item of top) {
      nodes.push({
        id: item.id,
        kind: item.kind,
        label: item.label,
        org_type: item.org_type,
        size: scaleSize(item.score, min, max, 8, 18),
      });
      seen.add(item.id);
      for (const board of item.boards) {
        const boardKind = item.kind === "person" ? "organization" : "person";
        if (!seen.has(board.id)) {
          nodes.push({
            id: board.id,
            kind: boardKind,
            label: board.name,
            size: 8,
          });
          seen.add(board.id);
        }
        edges.push({
          source: item.id,
          target: board.id,
          kind: "membership",
          role: board.role,
          is_primary: false,
        });
      }
      if (item.kind === "person") {
        for (const seat of item.seats) {
          if (!seen.has(seat.id)) {
            nodes.push({
              id: seat.id,
              kind: "seat",
              label: seat.title,
              size: 7,
            });
            seen.add(seat.id);
          }
          edges.push({
            source: item.id,
            target: seat.id,
            kind: "seat_holder",
            role: seat.title,
            is_primary: true,
          });
        }
      }
    }
    return { nodes, edges };
  }, [data]);

  const noLinks =
    (memberships === 0 || memberships == null) &&
    (seatHolders === 0 || seatHolders == null);

  if (unavailable && noLinks && !loading && !data) {
    return (
      <p className="text-sm font-body text-forest-500">
        Board footprint ranking is temporarily unavailable.
      </p>
    );
  }

  if (!loading && !error && data && data.items.length === 0) {
    return (
      <p className="text-sm font-body text-forest-500">
        No overlapping membership or formal seats to rank yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Toggle
          value={entity}
          onChange={setEntity}
          options={[
            { id: "person", label: "People" },
            { id: "org", label: "Organizations" },
          ]}
        />
        <Toggle
          value={metric}
          onChange={setMetric}
          options={[
            { id: "degree", label: "Board footprint" },
            { id: "formal", label: "Formal seats" },
          ]}
        />
      </div>

      {data && (
        <p className="text-xs font-body text-forest-500">
          {data.label}: memberships × {data.weights.membership}
          {" + "}
          seat holders × {data.weights.seat_holder}. Current overlapping
          membership only.
        </p>
      )}

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 bg-cream-100 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm font-body text-forest-500">{error}</p>
      ) : (
        <ol className="space-y-2">
          {data?.items.map((item, index) => (
            <RankRow
              key={item.id}
              item={item}
              rank={index + 1}
              maxScore={maxScore}
              onSelectPerson={item.kind === "person" ? onSelectPerson : undefined}
            />
          ))}
        </ol>
      )}

      <CivicGraph nodes={graph.nodes} edges={graph.edges} heightClassName="h-[280px] sm:h-[320px]" />
      <GraphLegend />
    </div>
  );
}

function RankRow({
  item,
  rank,
  maxScore,
  onSelectPerson,
}: {
  item: InvolvementItem;
  rank: number;
  maxScore: number;
  onSelectPerson?: (id: string) => void;
}) {
  const width = maxScore > 0 ? Math.max(8, (item.score / maxScore) * 100) : 8;
  const seatNote = item.seats
    .map((seat) => (seat.org_name ? `${seat.title} (${seat.org_name})` : seat.title))
    .join(", ");
  return (
    <li className="rounded-lg border border-cream-200 bg-cream-50/60 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-body text-forest-400 mr-2">{rank}</span>
          {onSelectPerson ? (
            <button
              type="button"
              onClick={() => onSelectPerson(item.id)}
              className="font-heading font-semibold text-sm text-forest-800 hover:underline text-left"
            >
              {item.label}
            </button>
          ) : (
            <span className="font-heading font-semibold text-sm text-forest-800">
              {item.label}
            </span>
          )}
          {seatNote && (
            <p className="text-[11px] font-body text-forest-500 mt-0.5 truncate">
              {seatNote}
            </p>
          )}
        </div>
        <span className="text-sm font-heading text-forest-700 flex-shrink-0">
          {item.score}
        </span>
      </div>
      <div className="mt-2 h-1.5 bg-cream-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-forest-600 rounded-full"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="text-[11px] font-body text-forest-500 mt-1">
        {item.memberships} board{item.memberships === 1 ? "" : "s"}
        {" · "}
        {item.seat_holders} formal seat{item.seat_holders === 1 ? "" : "s"}
      </p>
    </li>
  );
}

function Toggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-cream-300 bg-white p-0.5">
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`px-3 py-1 text-xs font-body rounded-md transition-colors ${
              active
                ? "bg-forest-800 text-cream-50"
                : "text-forest-600 hover:bg-cream-50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
