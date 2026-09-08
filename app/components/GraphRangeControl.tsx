"use client";

import BoardTabs from "./BoardTabs";
import {
  GRAPH_RANGE_LABELS,
  rangeMetaLine,
  resolveGraphRangeStop,
  visibleGraphRangeStops,
  type GraphRangeStop,
} from "@/lib/graph-range";

export default function GraphRangeControl({
  stop,
  onChange,
  connectedCount,
  drawnCount,
}: {
  stop: GraphRangeStop;
  onChange: (stop: GraphRangeStop) => void;
  connectedCount: number;
  drawnCount: number;
}) {
  const options = visibleGraphRangeStops(connectedCount).map((id) => ({
    id,
    label: GRAPH_RANGE_LABELS[id],
  }));
  if (options.length === 0 || connectedCount <= 0) return null;
  const value = resolveGraphRangeStop(stop, connectedCount);

  return (
    <div className="space-y-1">
      <BoardTabs
        fullWidth
        value={value}
        onChange={onChange}
        ariaLabel="How many to show on the graph"
        options={options}
      />
      <p className="text-[11px] font-body text-ink-muted">
        {rangeMetaLine(drawnCount, connectedCount)}
      </p>
    </div>
  );
}
