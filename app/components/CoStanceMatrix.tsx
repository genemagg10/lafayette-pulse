"use client";

import { useMemo, useState } from "react";
import {
  CO_STANCE_LABEL,
  OPPOSED_ON_ISSUES_LABEL,
  STANCE_INSUFFICIENT,
  STANCE_TEAL,
  STANCE_VERMILLION,
  type CoStanceResponse,
} from "@/lib/stances";

interface CoStanceMatrixProps {
  data: CoStanceResponse | null;
  loading?: boolean;
  error?: string | null;
  minShared: number;
  onMinShared: (value: number) => void;
  actor: "organization" | "person";
  onActor: (value: "organization" | "person") => void;
}

export default function CoStanceMatrix({
  data,
  loading,
  error,
  minShared,
  onMinShared,
  actor,
  onActor,
}: CoStanceMatrixProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const cellMap = useMemo(() => {
    const map = new Map<string, CoStanceResponse["cells"][number]>();
    if (!data) return map;
    for (const cell of data.cells) {
      map.set(`${cell.source}|${cell.target}`, cell);
      map.set(`${cell.target}|${cell.source}`, cell);
    }
    return map;
  }, [data]);

  const selected = useMemo(() => {
    if (!selectedKey || !data) return null;
    return data.cells.find(
      (cell) => `${cell.source}|${cell.target}` === selectedKey
    ) ?? null;
  }, [data, selectedKey]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const node of data?.nodes ?? []) map.set(node.id, node.label);
    return map;
  }, [data]);

  if (error) {
    return <p className="text-sm font-body text-forest-500">{error}</p>;
  }

  if (loading && !data) {
    return <div className="h-[240px] bg-cream-100 rounded-lg animate-pulse" />;
  }

  const nodes = data?.nodes ?? [];
  const empty = nodes.length < 2 || (data?.cells.length ?? 0) === 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Co-stance actor type"
          className="inline-flex rounded-lg border border-cream-300 bg-white p-0.5"
        >
          {([
            { id: "organization" as const, label: "Organizations" },
            { id: "person" as const, label: "People" },
          ]).map((option) => {
            const active = actor === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onActor(option.id)}
                className={`px-3 py-1.5 text-xs font-body rounded-md transition-colors ${
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
        <label className="flex items-center gap-3 text-xs font-body text-forest-600 flex-1 min-w-[180px]">
          <span className="whitespace-nowrap">Min. shared issues</span>
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={minShared}
            onChange={(e) => onMinShared(Number(e.target.value))}
            className="flex-1 accent-forest-700"
            aria-label="Minimum shared issues for co-stance"
          />
          <span className="tabular-nums w-4 text-right">{minShared}</span>
        </label>
      </div>
      <p className="text-xs font-body text-forest-500">
        {CO_STANCE_LABEL} is the same support or oppose on shared measures.
        {` ${OPPOSED_ON_ISSUES_LABEL}`} is opposite positions. This is not
        overlapping membership and is never labeled allies.
      </p>
      {empty ? (
        <div className="rounded-lg border border-dashed border-cream-300 bg-cream-50 p-4">
          <p className="text-sm font-body text-forest-600">
            No co-stance yet. Pairwise cells need quote-backed stances on the
            same measures — run <code className="text-xs">extract-stances.py</code>{" "}
            (or seed a documented fight). Shared boards are not a clash.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse text-[11px] font-body min-w-full">
            <caption className="sr-only">
              Co-stance matrix. Teal is co-stance, dashed vermillion is opposed
              on issues, gray is below the minimum shared threshold.
            </caption>
            <thead>
              <tr>
                <th className="p-1 sticky left-0 bg-white" />
                {nodes.map((node) => (
                  <th
                    key={node.id}
                    className="p-1 font-heading font-semibold text-forest-700 align-bottom"
                    title={node.label}
                  >
                    <span className="inline-block max-w-[72px] truncate [writing-mode:vertical-rl] rotate-180">
                      {node.label}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nodes.map((row) => (
                <tr key={row.id}>
                  <th
                    className="p-1 pr-2 text-left font-heading font-semibold text-forest-800 sticky left-0 bg-white whitespace-nowrap"
                    title={row.label}
                  >
                    {row.label}
                  </th>
                  {nodes.map((col) => {
                    if (row.id === col.id) {
                      return (
                        <td
                          key={col.id}
                          className="w-7 h-7 border border-cream-200 bg-cream-100"
                        />
                      );
                    }
                    const cell = cellMap.get(`${row.id}|${col.id}`);
                    const key = cell ? `${cell.source}|${cell.target}` : null;
                    const active = key != null && key === selectedKey;
                    let background = "transparent";
                    let boxShadow: string | undefined;
                    if (!cell) {
                      background = "#f3f6f3";
                    } else if (cell.kind === "insufficient") {
                      background = STANCE_INSUFFICIENT;
                    } else if (cell.kind === "co-stance") {
                      background = STANCE_TEAL;
                    } else {
                      background = STANCE_VERMILLION;
                      boxShadow = `inset 0 0 0 1px ${STANCE_VERMILLION}`;
                    }
                    return (
                      <td key={col.id} className="p-0 border border-cream-200">
                        <button
                          type="button"
                          disabled={!cell}
                          onClick={() => cell && setSelectedKey(key)}
                          title={
                            cell
                              ? `${cell.label}: ${cell.co_stance} co-stance, ${cell.opposed} opposed (${cell.shared} shared)`
                              : "No shared issues"
                          }
                          className={`block w-7 h-7 ${
                            active ? "ring-2 ring-forest-800 ring-inset" : ""
                          } ${cell?.kind === "opposed-on-issues" ? "bg-[repeating-linear-gradient(135deg,transparent,transparent_3px,#fff_3px,#fff_5px)]" : ""}`}
                          style={{
                            backgroundColor: background,
                            boxShadow,
                            opacity: cell ? 1 : 0.35,
                          }}
                          aria-label={
                            cell
                              ? `${row.label} and ${col.label}: ${cell.label}`
                              : `${row.label} and ${col.label}: no shared issues`
                          }
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <div className="rounded-lg border border-cream-200 bg-white p-3 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <h4 className="font-heading font-semibold text-sm text-forest-800">
              {selected.label}
            </h4>
            <button
              type="button"
              onClick={() => setSelectedKey(null)}
              className="text-xs font-body text-forest-500 hover:text-forest-800"
            >
              Close
            </button>
          </div>
          <p className="text-xs font-body text-forest-600">
            {names.get(selected.source)} · {names.get(selected.target)}
          </p>
          <p className="text-sm font-body text-forest-700">
            {selected.co_stance} co-stance · {selected.opposed} opposed on
            issues · {selected.shared} shared
            {selected.kind === "insufficient" ? " · below threshold (gray)" : ""}
          </p>
          {selected.shared_subjects.length > 0 && (
            <ul className="text-xs font-body text-forest-600">
              {selected.shared_subjects.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
