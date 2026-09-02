"use client";

import { useEffect, useState } from "react";
import BoardTabs from "./BoardTabs";
import ConflictRibbon from "./ConflictRibbon";
import CoStanceMatrix from "./CoStanceMatrix";
import FocusPanes, { type MobileStep } from "./FocusPanes";
import {
  MEASURE_STATUS_LABELS,
  type CoStanceResponse,
  type MeasureListItem,
  type RibbonEdge,
  type RibbonNode,
} from "@/lib/stances";

type MeasuresTab = "measures" | "co-stance";
type ActorType = "organization" | "person";

interface StancePayload {
  measure: MeasureListItem;
  stances: {
    id: string;
    actor_type: "person" | "organization";
    actor_id: string;
    actor_label: string;
    polarity: "support" | "oppose" | "endorse" | "neutral" | "mixed";
    confidence: number;
    evidence_quote: string | null;
    source_url: string | null;
    as_of: string | null;
    subject_title: string;
  }[];
  ribbon: {
    measureId: string;
    nodes: RibbonNode[];
    edges: RibbonEdge[];
  };
}

interface MeasuresExplorerProps {
  count: number | null;
  unavailable?: boolean;
}

export default function MeasuresExplorer({
  count,
  unavailable,
}: MeasuresExplorerProps) {
  const [tab, setTab] = useState<MeasuresTab>("measures");
  const [items, setItems] = useState<MeasureListItem[]>([]);
  const [total, setTotal] = useState<number | null>(count);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StancePayload | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actor, setActor] = useState<ActorType>("organization");
  const [minShared, setMinShared] = useState(2);
  const [debouncedShared, setDebouncedShared] = useState(2);
  const [matrix, setMatrix] = useState<CoStanceResponse | null>(null);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [mobileStep, setMobileStep] = useState<MobileStep>("list");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedShared(minShared), 150);
    return () => clearTimeout(timer);
  }, [minShared]);

  useEffect(() => {
    setListLoading(true);
    setListError(null);
    fetch("/api/measures?limit=50&offset=0")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data;
      })
      .then((data) => {
        const nextItems: MeasureListItem[] = Array.isArray(data?.items)
          ? data.items
          : [];
        setItems(nextItems);
        setTotal(typeof data?.total === "number" ? data.total : nextItems.length);
        setListLoading(false);
        setSelectedId((current) => {
          if (current && nextItems.some((row) => row.id === current)) return current;
          return nextItems[0]?.id ?? null;
        });
      })
      .catch((err) => {
        setListError(err.message);
        setItems([]);
        setListLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailError(null);
    fetch(`/api/measures/${selectedId}/stances`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data as StancePayload;
      })
      .then(setDetail)
      .catch((err) => {
        setDetail(null);
        setDetailError(err.message);
      });
  }, [selectedId]);

  useEffect(() => {
    if (tab !== "co-stance") return;
    const params = new URLSearchParams({
      actor: actor === "person" ? "person" : "org",
      min_shared: String(debouncedShared),
      limit_actors: "40",
    });
    setMatrixLoading(true);
    fetch(`/api/graph/co-stance?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data as CoStanceResponse;
      })
      .then((data) => {
        setMatrix(data);
        setMatrixError(null);
      })
      .catch((err) => {
        setMatrix(null);
        setMatrixError(err.message);
      })
      .finally(() => setMatrixLoading(false));
  }, [tab, actor, debouncedShared]);

  const trulyEmpty =
    !listLoading && !listError && (count === 0 || total === 0) && items.length === 0;

  if (unavailable && (count == null || count === 0) && items.length === 0 && !listLoading) {
    return (
      <p className="text-sm font-body text-forest-500">
        Measures are temporarily unavailable.
      </p>
    );
  }

  const emptyMeasures =
    <div className="rounded-lg border border-dashed border-cream-300 bg-cream-50 p-6 text-center">
      <p className="font-heading font-semibold text-forest-800">
        No measures extracted yet
      </p>
      <p className="text-sm font-body text-forest-500 mt-2 max-w-lg mx-auto leading-relaxed">
        Ballot measures and attributed support / oppose appear here after{" "}
        <code className="text-xs">extract-stances.py</code> (or a quote-backed
        seed in the SQL editor). Overlapping membership is not a political
        clash — this tile stays empty until stances exist.
      </p>
    </div>;

  const tabs = (
    <BoardTabs
      value={tab}
      onChange={setTab}
      ariaLabel="Measures views"
      options={[
        { id: "measures", label: "Measures" },
        { id: "co-stance", label: "Co-stance" },
      ]}
    />
  );

  if (tab === "co-stance") {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-3 space-y-4">
        {tabs}
        <CoStanceMatrix
          data={matrix}
          loading={matrixLoading}
          error={matrixError}
          minShared={minShared}
          onMinShared={setMinShared}
          actor={actor}
          onActor={setActor}
        />
      </div>
    );
  }

  if (trulyEmpty || (!listLoading && items.length === 0 && !listError)) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-3 space-y-4">
        {tabs}
        {emptyMeasures}
      </div>
    );
  }

  const master = (
    <div className="space-y-3">
      {tabs}
      {listLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-cream-100 rounded-lg" />
          ))}
        </div>
      ) : listError ? (
        <p className="text-sm font-body text-forest-500">{listError}</p>
      ) : (
        <ul className="divide-y divide-cream-200 rounded-lg border border-cream-200">
          {items.map((measure) => {
            const active = measure.id === selectedId;
            return (
              <li key={measure.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(measure.id);
                    setMobileStep("detail");
                  }}
                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                    active ? "bg-forest-50" : "hover:bg-cream-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-heading font-semibold text-sm text-forest-800">
                      {measure.short_code
                        ? `${measure.short_code} · ${measure.title}`
                        : measure.title}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-forest-500 flex-shrink-0">
                      {MEASURE_STATUS_LABELS[measure.status] || measure.status}
                    </span>
                  </div>
                  <p className="text-[11px] font-body text-forest-500 mt-0.5">
                    {measure.support_count} support · {measure.oppose_count}{" "}
                    oppose
                    {measure.election_date ? ` · ${measure.election_date}` : ""}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const detailPane = (
    <div className="space-y-3">
      {detailError && (
        <p className="text-sm font-body text-forest-500">{detailError}</p>
      )}
      {detail ? (
        <>
          <div className="rounded-lg border border-cream-200 bg-cream-50/60 p-3 space-y-1">
            <h3 className="font-heading font-semibold text-forest-800">
              {detail.measure.short_code
                ? `${detail.measure.short_code} · ${detail.measure.title}`
                : detail.measure.title}
            </h3>
            {detail.measure.summary && (
              <p className="text-sm font-body text-forest-600 leading-relaxed">
                {detail.measure.summary}
              </p>
            )}
            <p className="text-xs font-body text-forest-500">
              {MEASURE_STATUS_LABELS[detail.measure.status]}
              {detail.measure.election_date
                ? ` · ${detail.measure.election_date}`
                : ""}
              {` · ${detail.measure.support_count} support · ${detail.measure.oppose_count} oppose`}
              {detail.measure.endorse_count
                ? ` · ${detail.measure.endorse_count} endorse`
                : ""}
            </p>
          </div>
          <ConflictRibbon
            nodes={detail.ribbon.nodes}
            edges={detail.ribbon.edges}
            centerId={detail.ribbon.measureId}
            stances={detail.stances}
            showList
            showGraph={false}
          />
        </>
      ) : (
        !detailError &&
        !listLoading && (
          <p className="text-sm font-body text-forest-500">
            Select a measure to see attributed support and oppose.
          </p>
        )
      )}
    </div>
  );

  const vizPane = (
    <div className="flex flex-col h-full min-h-[420px] gap-2">
      <h3 className="font-heading font-semibold text-forest-800 text-sm">
        Conflict ribbon
      </h3>
      {detail ? (
        <div className="flex-1 min-h-[420px]">
          <ConflictRibbon
            nodes={detail.ribbon.nodes}
            edges={detail.ribbon.edges}
            centerId={detail.ribbon.measureId}
            stances={detail.stances}
            showList={false}
            heightClassName="h-full min-h-[420px]"
          />
        </div>
      ) : (
        <p className="text-sm font-body text-forest-500">
          Select a measure to open the ribbon.
        </p>
      )}
    </div>
  );

  return (
    <FocusPanes
      master={master}
      viz={vizPane}
      detail={detailPane}
      vizLabel="Ribbon"
      mobileStep={mobileStep}
      onMobileStep={setMobileStep}
    />
  );
}

