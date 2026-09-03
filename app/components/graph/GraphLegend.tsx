"use client";

import {
  CURRENT_EDGE_COLOR,
  ORG_TYPE_COLORS,
  PAST_EDGE_COLOR,
  PERSON_COLOR,
  PRIMARY_EDGE_COLOR,
  SEAT_COLOR,
} from "@/lib/civic-graph";
import {
  presentOrgTypesFromNodes,
  type GraphLabelMode,
} from "@/lib/graph-labels";
import {
  STANCE_GOLD,
  STANCE_TEAL,
  STANCE_VERMILLION,
} from "@/lib/stances";
import { ORG_TYPE_LABELS, type OrgType } from "@/lib/types";

export function GraphLabelToggle({
  mode,
  onChange,
}: {
  mode: GraphLabelMode;
  onChange: (mode: GraphLabelMode) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-body text-forest-600">
      <span>Labels:</span>
      <button
        type="button"
        onClick={() => onChange("focus")}
        className={
          mode === "focus"
            ? "font-semibold text-ink underline"
            : "underline hover:text-ink"
        }
        aria-pressed={mode === "focus"}
      >
        Focus
      </button>
      <span aria-hidden="true">·</span>
      <button
        type="button"
        onClick={() => onChange("all")}
        className={
          mode === "all"
            ? "font-semibold text-ink underline"
            : "underline hover:text-ink"
        }
        aria-pressed={mode === "all"}
      >
        All
      </button>
    </span>
  );
}

function ShapeSwatch({
  shape,
  color,
  label,
}: {
  shape: "circle" | "square" | "diamond";
  color: string;
  label: string;
}) {
  const className =
    shape === "circle"
      ? "inline-block w-2.5 h-2.5 rounded-full"
      : shape === "square"
        ? "inline-block w-2.5 h-2.5 rounded-[2px]"
        : "inline-block w-2.5 h-2.5 rotate-45";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={className} style={{ background: color }} />
      {label}
    </span>
  );
}

function LineSwatch({
  color,
  dashed,
  label,
}: {
  color: string;
  dashed?: boolean;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`w-6 border-t-2 ${dashed ? "border-dashed" : ""}`}
        style={{ borderColor: color }}
      />
      {label}
    </span>
  );
}

function StanceShortLine() {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <LineSwatch color={STANCE_TEAL} label="Support" />
      <LineSwatch color={STANCE_VERMILLION} dashed label="Oppose" />
      <LineSwatch color={STANCE_GOLD} label="Endorse" />
    </span>
  );
}

export default function GraphLegend({
  showSeats = true,
  affinity = false,
  stance = false,
  nodes,
  orgTypes,
}: {
  showSeats?: boolean;
  affinity?: boolean;
  stance?: boolean;
  nodes?: Array<{ org_type?: OrgType | null }>;
  orgTypes?: OrgType[];
}) {
  const present =
    orgTypes ?? (nodes ? presentOrgTypesFromNodes(nodes) : []);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-body text-forest-600">
      {!affinity && (
        <ShapeSwatch shape="circle" color={PERSON_COLOR} label="Person" />
      )}
      <ShapeSwatch
        shape="square"
        color={ORG_TYPE_COLORS.city_body}
        label="Organization"
      />
      {showSeats && !affinity && (
        <ShapeSwatch shape="diamond" color={SEAT_COLOR} label="Seat" />
      )}
      {affinity ? (
        <span>Line weight = overlapping membership</span>
      ) : !stance ? (
        <>
          <LineSwatch color={CURRENT_EDGE_COLOR} label="Current" />
          <LineSwatch color={PAST_EDGE_COLOR} dashed label="Past" />
          <LineSwatch color={PRIMARY_EDGE_COLOR} label="Seated" />
        </>
      ) : null}
      {stance && <StanceShortLine />}
      {present.length > 0 && (
        <details className="inline-block">
          <summary className="cursor-pointer list-none inline-flex items-center gap-1 underline decoration-line-strong hover:text-ink [&::-webkit-details-marker]:hidden">
            Org types ▾
          </summary>
          <span className="ml-2 inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {present.map((type) => (
              <span key={type} className="inline-flex items-center gap-1">
                <span
                  className="inline-block w-2 h-2 rounded-[3px]"
                  style={{ background: ORG_TYPE_COLORS[type] }}
                />
                {ORG_TYPE_LABELS[type]}
              </span>
            ))}
          </span>
        </details>
      )}
    </div>
  );
}
