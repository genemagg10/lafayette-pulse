"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ORG_TYPE_LABELS, type Organization, type OrgType } from "@/lib/types";
import type { OrgAffinityResponse } from "@/lib/civic-graph";
import {
  STANCE_TEAL,
  STANCE_VERMILLION,
  type CoStanceResponse,
} from "@/lib/stances";
import BoardTabs from "./BoardTabs";
import CoStanceMatrix from "./CoStanceMatrix";
import GraphLegend from "./graph/GraphLegend";
import FocusPanes, { type MobileStep } from "./FocusPanes";
import type { RenderableEdge } from "./graph/CivicGraph";

const CivicGraph = dynamic(() => import("./graph/CivicGraph"), { ssr: false });

const ORG_TYPES = Object.keys(ORG_TYPE_LABELS) as OrgType[];
const DEFAULT_JACCARD = 0.15;
type OrgTab = "directory" | "co-stance";

interface OrgMember {
  id: string;
  role: string | null;
  is_primary: boolean;
  is_current: boolean;
  person: { id: string; full_name: string; photo_url: string | null; bio: string | null } | null;
}

interface OrgDetail extends Organization {
  members?: OrgMember[];
  seats?: {
    id: string;
    title: string;
    seat_type: string;
    holders: {
      id: string;
      is_current: boolean;
      person: { id: string; full_name: string } | null;
    }[];
  }[];
}

interface OrganizationExplorerProps {
  count: number | null;
  unavailable?: boolean;
}

export default function OrganizationExplorer({
  count,
  unavailable,
}: OrganizationExplorerProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [orgType, setOrgType] = useState<OrgType | "">("");
  const [items, setItems] = useState<Organization[]>([]);
  const [total, setTotal] = useState<number | null>(count);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [affinity, setAffinity] = useState<OrgAffinityResponse | null>(null);
  const [affinityError, setAffinityError] = useState<string | null>(null);
  const [minJaccard, setMinJaccard] = useState(DEFAULT_JACCARD);
  const [debouncedJaccard, setDebouncedJaccard] = useState(DEFAULT_JACCARD);
  const [selectedEdge, setSelectedEdge] = useState<RenderableEdge | null>(null);
  const [tab, setTab] = useState<OrgTab>("directory");
  const [stanceLayer, setStanceLayer] = useState(false);
  const [coActor, setCoActor] = useState<"organization" | "person">("organization");
  const [minShared, setMinShared] = useState(2);
  const [debouncedShared, setDebouncedShared] = useState(2);
  const [coStance, setCoStance] = useState<CoStanceResponse | null>(null);
  const [coStanceError, setCoStanceError] = useState<string | null>(null);
  const [coStanceLoading, setCoStanceLoading] = useState(false);
  const [mobileStep, setMobileStep] = useState<MobileStep>("list");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedJaccard(minJaccard), 150);
    return () => clearTimeout(timer);
  }, [minJaccard]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedShared(minShared), 150);
    return () => clearTimeout(timer);
  }, [minShared]);

  useEffect(() => {
    const params = new URLSearchParams({ limit: "50", offset: "0" });
    if (debounced) params.set("q", debounced);
    if (orgType) params.set("org_type", orgType);
    setListLoading(true);
    setListError(null);
    fetch(`/api/organizations?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data;
      })
      .then((data) => {
        const nextItems: Organization[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : [];
        setItems(nextItems);
        setTotal(typeof data?.total === "number" ? data.total : nextItems.length);
        setListLoading(false);
        setSelectedId((current) => {
          if (current && nextItems.some((org) => org.id === current)) return current;
          const council =
            nextItems.find((org) => /city council/i.test(org.name) || org.slug === "city-council") ||
            nextItems[0] ||
            null;
          return council?.id ?? null;
        });
      })
      .catch((err) => {
        setListError(err.message);
        setItems([]);
        setListLoading(false);
      });
  }, [debounced, orgType]);

  useEffect(() => {
    const params = new URLSearchParams({
      current_only: "true",
      min_jaccard: String(debouncedJaccard),
      min_shared: "1",
      limit_orgs: "40",
    });
    fetch(`/api/graph/org-affinity?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data as OrgAffinityResponse;
      })
      .then((data) => {
        setAffinity(data);
        setAffinityError(null);
      })
      .catch((err) => setAffinityError(err.message));
  }, [debouncedJaccard]);

  useEffect(() => {
    if (tab !== "co-stance" && !stanceLayer) return;
    const params = new URLSearchParams({
      actor: tab === "co-stance" && coActor === "person" ? "person" : "org",
      min_shared: String(debouncedShared),
      limit_actors: "40",
    });
    setCoStanceLoading(true);
    fetch(`/api/graph/co-stance?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data as CoStanceResponse;
      })
      .then((data) => {
        setCoStance(data);
        setCoStanceError(null);
      })
      .catch((err) => setCoStanceError(err.message))
      .finally(() => setCoStanceLoading(false));
  }, [tab, stanceLayer, coActor, debouncedShared]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    fetch(`/api/organizations/${selectedId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data as OrgDetail;
      })
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [selectedId]);

  useEffect(() => {
    if (!selectedEdge || !affinity) return;
    const stillThere = affinity.edges.some(
      (edge) =>
        (edge.source === selectedEdge.source && edge.target === selectedEdge.target) ||
        (edge.source === selectedEdge.target && edge.target === selectedEdge.source)
    );
    if (!stillThere) setSelectedEdge(null);
  }, [affinity, selectedEdge]);

  const { graphNodes, graphEdges, isolates } = useMemo(() => {
    if (!affinity) {
      return {
        graphNodes: [] as OrgAffinityResponse["nodes"],
        graphEdges: [] as RenderableEdge[],
        isolates: [] as OrgAffinityResponse["nodes"],
      };
    }
    const connected = new Set<string>();
    for (const edge of affinity.edges) {
      connected.add(edge.source);
      connected.add(edge.target);
    }
    const graphNodes = affinity.nodes.filter((node) => connected.has(node.id));
    const graphEdges: RenderableEdge[] = affinity.edges.map((edge) => ({
      source: edge.source,
      target: edge.target,
      kind: "membership",
      shared: edge.shared,
      jaccard: edge.jaccard,
      shared_names: edge.shared_names,
    }));
    if (stanceLayer && coStance) {
      const present = new Set(graphNodes.map((node) => node.id));
      for (const cell of coStance.cells) {
        if (!present.has(cell.source) || !present.has(cell.target)) continue;
        if (cell.kind === "insufficient") continue;
        graphEdges.push({
          source: cell.source,
          target: cell.target,
          kind: cell.kind,
          stance_kind: cell.kind,
          co_stance: cell.co_stance,
          opposed: cell.opposed,
          shared: cell.shared,
          color: cell.kind === "co-stance" ? STANCE_TEAL : STANCE_VERMILLION,
          dashed: cell.kind === "opposed-on-issues",
        });
      }
    }
    return {
      graphNodes,
      graphEdges,
      isolates: affinity.nodes.filter((node) => !connected.has(node.id)),
    };
  }, [affinity, stanceLayer, coStance]);

  const trulyEmpty =
    !listLoading && !listError && !debounced && !orgType && (count === 0 || total === 0);

  if (unavailable && (count == null || count === 0) && items.length === 0 && !listLoading) {
    return (
      <p className="text-sm font-body text-ink-muted">
        Organization directory is temporarily unavailable.
      </p>
    );
  }

  if (trulyEmpty) {
    return (
      <p className="text-sm font-body text-ink-muted">
        No organizations loaded yet. Apply the civic graph migrations, or the
        directory API may be unreachable.
      </p>
    );
  }

  const currentMembers = (detail?.members ?? []).filter((row) => row.is_current && row.person);
  const sourceName =
    affinity?.nodes.find((node) => node.id === selectedEdge?.source)?.label ?? "Organization";
  const targetName =
    affinity?.nodes.find((node) => node.id === selectedEdge?.target)?.label ?? "Organization";

  const selectOrg = (id: string) => {
    setSelectedId(id);
    setMobileStep("detail");
  };

  const tabs = (
    <BoardTabs
      value={tab}
      onChange={setTab}
      ariaLabel="Organization views"
      options={[
        { id: "directory", label: "Directory" },
        { id: "co-stance", label: "Co-stance" },
      ]}
    />
  );

  if (tab === "co-stance") {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-3 space-y-4">
        {tabs}
        <CoStanceMatrix
          data={coStance}
          loading={coStanceLoading}
          error={coStanceError}
          minShared={minShared}
          onMinShared={setMinShared}
          actor={coActor}
          onActor={setCoActor}
        />
      </div>
    );
  }

  const master = (
    <div className="space-y-3">
      {tabs}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search organizations…"
        className="w-full px-3 py-2 rounded-md border border-line-strong bg-surface font-body text-sm text-ink placeholder:text-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-500/30 focus:border-forest-500"
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setOrgType("")}
          className={`px-2.5 py-1 rounded-full text-[11px] font-body border transition-colors ${
            orgType === ""
              ? "bg-forest-800 text-cream-50 border-forest-800"
              : "bg-surface text-forest-600 border-line-strong hover:bg-canvas"
          }`}
        >
          All
        </button>
        {ORG_TYPES.map((type) => {
          const active = orgType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setOrgType(active ? "" : type)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-body border transition-colors ${
                active
                  ? "bg-forest-800 text-cream-50 border-forest-800"
                  : "bg-surface text-forest-600 border-line-strong hover:bg-canvas"
              }`}
            >
              {ORG_TYPE_LABELS[type]}
            </button>
          );
        })}
      </div>
      {listLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-surface-muted rounded-md" />
          ))}
        </div>
      ) : listError ? (
        <p className="text-sm font-body text-ink-muted">{listError}</p>
      ) : items.length === 0 ? (
        <p className="text-sm font-body text-ink-muted">
          No organizations match this search.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {items.map((org) => {
            const active = org.id === selectedId;
            return (
              <li key={org.id}>
                <button
                  type="button"
                  onClick={() => selectOrg(org.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors border-l-2 ${
                    active
                      ? "border-forest bg-forest-soft"
                      : "border-transparent hover:bg-canvas"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-heading font-semibold text-sm text-ink">
                      {org.name}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-ink-muted flex-shrink-0">
                      {ORG_TYPE_LABELS[org.org_type as OrgType] || org.org_type}
                    </span>
                  </div>
                  <p className="text-[11px] font-body text-ink-muted mt-0.5">
                    {org.current_member_count ?? org.member_count ?? 0} current members
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
      {detail ? (
        <div className="rounded-md border border-line bg-surface-muted p-3 space-y-2">
          <h3 className="font-heading font-semibold text-ink">{detail.name}</h3>
          {detail.description && (
            <p className="text-sm font-body text-forest-600 leading-relaxed">
              {detail.description}
            </p>
          )}
          <p className="text-xs font-body text-ink-muted">
            {detail.current_member_count ?? currentMembers.length} current members
          </p>
          {currentMembers.length > 0 ? (
            <ul className="text-sm font-body text-forest-700 space-y-1">
              {currentMembers.map((row) => (
                <li key={row.id}>
                  {row.person?.full_name}
                  {row.role ? ` · ${row.role}` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm font-body text-ink-muted">
              No current members recorded for this organization.
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm font-body text-ink-muted">
          Select an organization to see overlapping membership.
        </p>
      )}
      {selectedEdge && (
        <div className="rounded-md border border-line bg-surface p-3 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="font-heading font-semibold text-sm text-ink">
                {selectedEdge.stance_kind === "co-stance"
                  ? "Co-stance"
                  : selectedEdge.stance_kind === "opposed-on-issues"
                    ? "Opposed on issues"
                    : "Shared membership"}
              </h4>
              <p className="text-xs font-body text-ink-muted mt-0.5">
                {sourceName} · {targetName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedEdge(null)}
              className="text-xs font-body text-ink-muted hover:text-ink"
            >
              Close
            </button>
          </div>
          <p className="text-sm font-body text-forest-700">
            {selectedEdge.stance_kind
              ? `${selectedEdge.co_stance ?? 0} co-stance · ${selectedEdge.opposed ?? 0} opposed on issues`
              : `${selectedEdge.shared ?? 0} shared${
                  selectedEdge.jaccard != null
                    ? ` · Jaccard ${selectedEdge.jaccard.toFixed(2)}`
                    : ""
                }`}
          </p>
          {selectedEdge.shared_names && selectedEdge.shared_names.length > 0 ? (
            <ul className="text-sm font-body text-forest-700 space-y-0.5">
              {selectedEdge.shared_names.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          ) : !selectedEdge.stance_kind ? (
            <p className="text-sm font-body text-ink-muted">
              Shared names are not available for this edge.
            </p>
          ) : null}
        </div>
      )}
      {isolates.length > 0 && (
        <aside className="rounded-md border border-line bg-surface-muted p-3">
          <h4 className="font-heading font-semibold text-xs text-ink">
            No overlaps yet
          </h4>
          <p className="text-[11px] font-body text-ink-muted mt-0.5 mb-2">
            Orgs with members but no shared membership at this threshold.
          </p>
          <ul className="space-y-1">
            {isolates.map((org) => (
              <li key={org.id}>
                <button
                  type="button"
                  onClick={() => selectOrg(org.id)}
                  className="w-full text-left text-xs font-body text-forest-700 hover:text-forest-900 hover:underline"
                >
                  {org.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );

  const vizPane = (
    <div className="flex flex-col h-full min-h-[420px] gap-2">
      <h3 className="font-heading font-semibold text-ink text-sm">
        Shared membership
      </h3>
      <p className="text-xs font-body text-ink-muted">
        Organizations connected when they share current members (Jaccard
        overlap). This is overlapping membership, not a political grouping.
      </p>
      <label className="flex items-center gap-3 text-xs font-body text-forest-600">
        <span className="whitespace-nowrap">Min. overlap</span>
        <input
          type="range"
          min={0.05}
          max={0.5}
          step={0.01}
          value={minJaccard}
          onChange={(e) => setMinJaccard(Number(e.target.value))}
          className="flex-1 accent-forest-700"
          aria-valuemin={0.05}
          aria-valuemax={0.5}
          aria-valuenow={minJaccard}
          aria-label="Minimum Jaccard overlap"
        />
        <span className="tabular-nums w-10 text-right">{minJaccard.toFixed(2)}</span>
      </label>
      <label className="inline-flex items-center gap-2 text-xs font-body text-forest-600">
        <input
          type="checkbox"
          checked={stanceLayer}
          onChange={(e) => setStanceLayer(e.target.checked)}
        />
        Show stance layer (co-stance / opposed on issues)
      </label>
      {stanceLayer && coStanceError && (
        <p className="text-sm font-body text-ink-muted">{coStanceError}</p>
      )}
      {stanceLayer && (
        <p className="text-xs font-body text-ink-muted">
          Teal solid = co-stance. Dashed vermillion = opposed on issues.
          Hidden unless both organizations already appear on shared membership.
        </p>
      )}
      {affinityError && (
        <p className="text-sm font-body text-ink-muted">{affinityError}</p>
      )}
      <div className="flex-1 min-h-[420px]">
        {!affinity && !affinityError ? (
          <div className="h-full min-h-[420px] bg-surface-muted rounded-md animate-pulse" />
        ) : (
          <CivicGraph
            nodes={graphNodes.map((node) => ({
              id: node.id,
              kind: "organization" as const,
              label: node.label,
              org_type: node.org_type,
              size: node.size,
            }))}
            edges={graphEdges}
            onNodeClick={(id) => selectOrg(id)}
            onEdgeClick={setSelectedEdge}
            heightClassName="h-full min-h-[420px]"
          />
        )}
      </div>
      <GraphLegend affinity showSeats={false} stance={stanceLayer} />
    </div>
  );

  return (
    <FocusPanes
      master={master}
      viz={vizPane}
      detail={detailPane}
      vizLabel="Affinity"
      mobileStep={mobileStep}
      onMobileStep={setMobileStep}
    />
  );
}

