"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Person } from "@/lib/types";
import type {
  EgoGraphResponse,
  PeopleAffinityResponse,
  SharedBoardOverlap,
} from "@/lib/civic-graph";
import GraphLegend from "./graph/GraphLegend";
import PersonAvatar from "./PersonAvatar";
import OnTheRecord, { type OnTheRecordItem } from "./OnTheRecord";
import FocusPanes, { type MobileStep } from "./FocusPanes";
import FootprintChip from "./FootprintChip";
import WhyLinkedPanel from "./WhyLinkedPanel";
import GraphRangeControl from "./GraphRangeControl";
import {
  DetailLink,
  DetailSection,
  IdentityHeader,
  StickyDetailChrome,
} from "./WhoDetailChrome";
import NetworkPreviewCard from "./NetworkPreviewCard";
import { personNetworkPreviewLabel } from "@/lib/network-preview";
import type { RenderableEdge } from "./graph/CivicGraph";
import {
  MIXED_BOARDS_LABEL,
  clusterCauseOnStop,
  type ClusterCause,
} from "@/lib/cluster-cause";
import {
  buildWhyLinkedModel,
  toggleWhyLinkedEdge,
} from "@/lib/why-linked";
import {
  resolveGraphRangeStop,
  sliceConnectedByFootprint,
  type GraphRangeStop,
} from "@/lib/graph-range";

const CivicGraph = dynamic(() => import("./graph/CivicGraph"), { ssr: false });

interface PersonDetail extends Person {
  memberships?: {
    id: string;
    role: string | null;
    is_primary: boolean;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
    organization: { id: string; name: string; slug: string; org_type: string } | null;
  }[];
  seats?: {
    id: string;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
    seat: { id: string; title: string; seat_type: string; district: string | null } | null;
    organization: { id: string; name: string; slug: string; org_type: string } | null;
  }[];
  shared_boards?: SharedBoardOverlap[];
}

interface PeopleExplorerProps {
  count: number | null;
  unavailable?: boolean;
  selectedPersonId?: string | null;
  onSelectPerson?: (id: string | null) => void;
  onSelectOrg?: (id: string) => void;
}

export default function PeopleExplorer({
  count,
  unavailable,
  selectedPersonId,
  onSelectPerson,
  onSelectOrg,
}: PeopleExplorerProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [hasSeat, setHasSeat] = useState<"all" | "seated">("all");
  const [items, setItems] = useState<Person[]>([]);
  const [total, setTotal] = useState<number | null>(count);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(selectedPersonId ?? null);
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [ego, setEgo] = useState<EgoGraphResponse | null>(null);
  const [overview, setOverview] = useState<PeopleAffinityResponse | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hops, setHops] = useState<1 | 2>(1);
  const [currentOnly, setCurrentOnly] = useState(true);
  const [onTheRecord, setOnTheRecord] = useState<OnTheRecordItem[]>([]);
  const [mobileStep, setMobileStep] = useState<MobileStep>("list");
  const [selectedEdge, setSelectedEdge] = useState<RenderableEdge | null>(null);
  const [mixedCause, setMixedCause] = useState<ClusterCause | null>(null);
  const [rangeStop, setRangeStop] = useState<GraphRangeStop>("most");
  const selectedPersonIdRef = useRef(selectedPersonId);
  selectedPersonIdRef.current = selectedPersonId;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (selectedPersonId) setSelectedId(selectedPersonId);
  }, [selectedPersonId]);

  const clearPerson = () => {
    setSelectedId(null);
    setDetail(null);
    setEgo(null);
    setOnTheRecord([]);
    setSelectedEdge(null);
    setMixedCause(null);
    onSelectPerson?.(null);
  };

  const focusPerson = (id: string) => {
    setSelectedId(id);
    onSelectPerson?.(id);
    setMobileStep("detail");
  };

  const selectPerson = (id: string) => {
    setMixedCause(null);
    if (selectedId === id) {
      clearPerson();
      return;
    }
    focusPerson(id);
  };

  const selectFromWhyLinked = (id: string, kind: "person" | "organization") => {
    if (kind === "person") {
      focusPerson(id);
      return;
    }
    onSelectOrg?.(id);
  };

  useEffect(() => {
    const params = new URLSearchParams({
      limit: "50",
      offset: "0",
      sort: "footprint",
    });
    if (debounced) params.set("q", debounced);
    if (hasSeat === "seated") params.set("has_seat", "true");
    setListLoading(true);
    setListError(null);
    fetch(`/api/people?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        return data;
      })
      .then((data) => {
        const nextItems: Person[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
            ? data.items
            : [];
        setItems(nextItems);
        setTotal(typeof data?.total === "number" ? data.total : nextItems.length);
        setListLoading(false);
        const fromParent = selectedPersonIdRef.current;
        const current = selectedIdRef.current;
        const keep =
          fromParent && nextItems.some((person) => person.id === fromParent)
            ? fromParent
            : current && nextItems.some((person) => person.id === current)
              ? current
              : null;
        setSelectedId(keep);
        if (!keep && fromParent) onSelectPerson?.(null);
      })
      .catch((err) => {
        setListError(err.message);
        setItems([]);
        setListLoading(false);
      });
  }, [debounced, hasSeat]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setEgo(null);
      setOnTheRecord([]);
      return;
    }
    const egoParams = new URLSearchParams({
      hops: String(hops),
      current_only: String(currentOnly),
      // Keep the graph legible: cap peers shown; the full set is in the
      // "Shared boards" list in the detail pane.
      alter_cap: "12",
    });
    setDetailLoading(true);
    Promise.all([
      fetch(`/api/people/${selectedId}`).then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data as PersonDetail;
      }),
      fetch(`/api/people/${selectedId}/ego?${egoParams.toString()}`).then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data as EgoGraphResponse;
      }),
      fetch(`/api/people/${selectedId}/stances`).then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) return [] as OnTheRecordItem[];
        return Array.isArray(data?.items) ? (data.items as OnTheRecordItem[]) : [];
      }),
    ])
      .then(([person, graph, stances]) => {
        setDetail(person);
        setEgo(graph);
        setOnTheRecord(stances);
      })
      .catch(() => {
        setDetail(null);
        setEgo(null);
        setOnTheRecord([]);
      })
      .finally(() => setDetailLoading(false));
    setSelectedEdge(null);
    setMixedCause(null);
  }, [selectedId, hops, currentOnly]);

  useEffect(() => {
    if (selectedId) return;
    const params = new URLSearchParams({
      current_only: String(currentOnly),
      min_shared: "1",
      limit_people: "200",
    });
    if (hasSeat === "seated") params.set("has_seat", "true");
    fetch(`/api/graph/people-affinity?${params.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data as PeopleAffinityResponse;
      })
      .then((data) => {
        setOverview(data);
        setOverviewError(null);
      })
      .catch((err) => setOverviewError(err.message));
  }, [selectedId, currentOnly, hasSeat]);

  const empty = !listLoading && !listError && items.length === 0;
  const trulyEmpty =
    !listLoading &&
    !listError &&
    !debounced &&
    hasSeat === "all" &&
    (count === 0 || total === 0);

  const selected = useMemo(
    () => items.find((person) => person.id === selectedId) || detail,
    [items, selectedId, detail]
  );

  const connectedPeople = overview?.nodes ?? [];
  const connectedPeopleCount =
    overview?.connected_count ?? connectedPeople.length;
  const activePeopleStop = resolveGraphRangeStop(
    rangeStop,
    connectedPeopleCount
  );
  const rangedPeople = useMemo(
    () =>
      sliceConnectedByFootprint(
        connectedPeople,
        overview?.edges ?? [],
        activePeopleStop
      ),
    [connectedPeople, overview, activePeopleStop]
  );

  useEffect(() => {
    if (!selectedEdge || selectedId) return;
    const ids = new Set(rangedPeople.nodes.map((node) => node.id));
    if (!ids.has(selectedEdge.source) || !ids.has(selectedEdge.target)) {
      setSelectedEdge(null);
    }
  }, [rangedPeople, selectedEdge, selectedId]);

  useEffect(() => {
    if (!mixedCause || selectedId) return;
    if (!clusterCauseOnStop(activePeopleStop)) {
      setMixedCause(null);
      return;
    }
    const ids = new Set(rangedPeople.nodes.map((node) => node.id));
    if (mixedCause.memberIds.some((id) => !ids.has(id))) {
      setMixedCause(null);
    }
  }, [rangedPeople, mixedCause, selectedId, activePeopleStop]);

  const whyLinkedModel = useMemo(() => {
    if (!selectedEdge) return null;
    const entities = selectedId
      ? (ego?.nodes ?? [])
      : rangedPeople.nodes.map((node) => ({
          id: node.id,
          label: node.label,
          kind: "person" as const,
        }));
    return buildWhyLinkedModel(selectedEdge, [
      ...entities,
      ...(selectedEdge.shared_entities ?? []),
    ]);
  }, [selectedEdge, selectedId, ego, rangedPeople]);

  if (unavailable && (count == null || count === 0) && items.length === 0 && !listLoading) {
    return (
      <p className="text-sm font-body text-ink-muted">
        Who&apos;s Who is temporarily unavailable.
      </p>
    );
  }

  if (trulyEmpty) {
    return (
      <p className="text-sm font-body text-ink-muted">
        No people loaded yet. Seat holders, commissioners, and candidates will
        appear here as the civic graph is populated.
      </p>
    );
  }

  const master = (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className="w-full px-3 py-2 rounded-md border border-line-strong bg-surface font-body text-sm text-ink placeholder:text-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-500/30 focus:border-forest-500"
        />
        <label className="inline-flex items-center gap-2 text-xs font-body text-forest-600">
          <input
            type="checkbox"
            checked={hasSeat === "seated"}
            onChange={(e) => setHasSeat(e.target.checked ? "seated" : "all")}
          />
          Current seat holder
        </label>
        <p className="text-[11px] font-body text-ink-muted">
          Recorded seats only — not commission memberships.
        </p>
        <p className="text-[11px] font-body text-ink-muted">
          Ranked by board footprint
        </p>
      </div>
      {listLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-surface-muted rounded-md" />
          ))}
        </div>
      ) : listError ? (
        <p className="text-sm font-body text-ink-muted">{listError}</p>
      ) : empty ? (
        <p className="text-sm font-body text-ink-muted">
          No people match these filters.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {items.map((person) => {
            const active = person.id === selectedId;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  onClick={() => selectPerson(person.id)}
                  className={`w-full text-left px-3 py-2.5 transition-colors flex items-center gap-2.5 border-l-2 ${
                    active
                      ? "border-forest bg-forest-soft"
                      : "border-transparent hover:bg-canvas"
                  }`}
                >
                  <PersonAvatar
                    name={person.full_name}
                    photoUrl={person.photo_url}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-heading font-semibold text-sm text-ink">
                      {person.full_name}
                    </div>
                    <div className="text-[11px] font-body text-ink-muted mt-0.5 truncate">
                      {person.current_roles && person.current_roles.length > 0
                        ? person.current_roles
                            .map((role) =>
                              role.role
                                ? `${role.role}, ${role.org_name}`
                                : role.org_name
                            )
                            .join(" · ")
                        : "No current boards"}
                    </div>
                  </div>
                  <FootprintChip
                    score={
                      person.footprint_score ??
                      (person.membership_count ?? 0) + (person.seat_count ?? 0)
                    }
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const roleLine =
    selected?.current_roles && selected.current_roles.length > 0
      ? selected.current_roles
          .map((role) =>
            role.role ? `${role.role}, ${role.org_name}` : role.org_name
          )
          .join(" · ")
      : null;

  const personDetail =
    detailLoading && !detail ? (
      <div className="h-24 bg-surface-muted rounded-md animate-pulse" />
    ) : selected ? (
      <>
        <StickyDetailChrome>
          <IdentityHeader
            name={selected.full_name}
            subtitle={roleLine}
            footprint={
              selected.footprint_score ??
              ((selected.membership_count ?? 0) + (selected.seat_count ?? 0) ||
                null)
            }
            email={detail?.email}
            website={detail?.website}
            photoUrl={selected.photo_url}
          />
        </StickyDetailChrome>
        <NetworkPreviewCard
          label={personNetworkPreviewLabel(selected.full_name)}
          onOpen={() => setMobileStep("viz")}
        />
        <div className="space-y-3">
          {detail?.bio && (
            <p className="text-[13px] font-body text-forest-600 leading-snug">
              {detail.bio}
            </p>
          )}
          <DetailSection
            title="Formal seats"
            items={detail?.seats ?? []}
            getKey={(row) => row.id}
            renderItem={(row) => (
              <>
                {row.seat?.title}
                {row.organization ? (
                  <>
                    {" · "}
                    <DetailLink
                      onClick={
                        row.organization
                          ? () => onSelectOrg?.(row.organization!.id)
                          : undefined
                      }
                    >
                      {row.organization.name}
                    </DetailLink>
                  </>
                ) : null}
                {row.is_current ? "" : " (past)"}
              </>
            )}
          />
          <DetailSection
            title="Memberships"
            items={detail?.memberships ?? []}
            getKey={(row) => row.id}
            renderItem={(row) => (
              <>
                <DetailLink
                  onClick={
                    row.organization
                      ? () => onSelectOrg?.(row.organization!.id)
                      : undefined
                  }
                >
                  {row.organization?.name ?? "Organization"}
                </DetailLink>
                {row.role ? ` · ${row.role}` : ""}
                {row.is_current ? "" : " (past)"}
              </>
            )}
          />
          <DetailSection
            title="Shared boards"
            items={detail?.shared_boards ?? []}
            getKey={(row) => row.person.id}
            renderItem={(row) => (
              <>
                <DetailLink onClick={() => selectPerson(row.person.id)}>
                  {row.person.full_name}
                </DetailLink>
                {row.organizations.length > 0
                  ? ` · ${row.organizations.map((org) => org.name).join(", ")}`
                  : ""}
              </>
            )}
          />
          <OnTheRecord items={onTheRecord} bare />
        </div>
      </>
    ) : (
      <p className="text-sm font-body text-ink-muted">
        Select a person to see overlapping membership and seats.
      </p>
    );

  const detailPane = <div className="space-y-3">{personDetail}</div>;

  const overviewNodes = rangedPeople.nodes.map((node) => ({
    id: node.id,
    kind: "person" as const,
    label: node.label,
    size: node.size,
    photo_url: node.photo_url,
    footprint: node.footprint,
  }));
  const overviewEdges = rangedPeople.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    kind: "shared_board" as const,
    shared: edge.shared,
    shared_names: edge.shared_names,
    shared_entities: edge.shared_entities,
  }));
  const graphNodes = selectedId ? (ego?.nodes ?? []) : overviewNodes;
  const graphEdges = selectedId ? (ego?.edges ?? []) : overviewEdges;
  const graphLoading = selectedId
    ? detailLoading && !ego
    : !overview && !overviewError;

  const vizPane = (
    <div className="flex flex-col h-full min-h-[420px] gap-2">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-heading font-semibold text-ink text-sm">
          {selectedId ? "Network" : "Shared boards"}
        </h3>
        {selectedId && (
          <button
            type="button"
            onClick={clearPerson}
            className="text-[11px] font-body text-forest-700 underline hover:text-forest-900"
          >
            Clear focus
          </button>
        )}
      </div>
      <p className="text-xs font-body text-ink-muted">
        {selectedId
          ? `Focused on ${selected?.full_name ?? "this person"} and the boards they sit on.`
          : "People who sit on the same boards. Circle size is board footprint — current memberships and seats, as area. Select a person to focus. This is not a political grouping."}
      </p>
      {!selectedId && overview && (
        <GraphRangeControl
          stop={rangeStop}
          onChange={setRangeStop}
          connectedCount={connectedPeopleCount}
          drawnCount={rangedPeople.nodes.length}
        />
      )}
      {selectedId && (
        <div className="flex flex-wrap items-center gap-3 text-xs font-body text-forest-600">
          <label
            className="inline-flex items-center gap-1.5"
            title="Add the other people who currently sit on this person's boards, clustered under the board they share."
          >
            <input
              type="checkbox"
              checked={hops === 2}
              onChange={(e) => setHops(e.target.checked ? 2 : 1)}
            />
            Show shared boards
          </label>
          <label className="inline-flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={currentOnly}
              onChange={(e) => setCurrentOnly(e.target.checked)}
            />
            Current only
          </label>
        </div>
      )}
      {overviewError && !selectedId && (
        <p className="text-sm font-body text-ink-muted">{overviewError}</p>
      )}
      <div className="relative flex-1 min-h-[420px]">
        {graphLoading ? (
          <div className="h-full min-h-[420px] bg-surface-muted rounded-md animate-pulse" />
        ) : (
          <CivicGraph
            nodes={graphNodes}
            edges={graphEdges}
            centerId={selectedId ? ego?.center.id : null}
            layout={selectedId ? "ego" : "force"}
            nameEveryNode
            selectedEdge={selectedEdge}
            showClusterCause={!selectedId && clusterCauseOnStop(activePeopleStop)}
            heightClassName="h-full min-h-[420px]"
            onClusterCauseClick={(cause) => {
              setSelectedEdge(null);
              if (cause.kind === "org") {
                setMixedCause(null);
                onSelectOrg?.(cause.orgId);
                return;
              }
              setMixedCause(cause);
            }}
            onNodeClick={(id, kind) => {
              setSelectedEdge(null);
              setMixedCause(null);
              if (kind === "person") selectPerson(id);
              if (kind === "organization") onSelectOrg?.(id);
            }}
            onEdgeClick={(edge) => {
              setMixedCause(null);
              setSelectedEdge((current) => toggleWhyLinkedEdge(current, edge));
            }}
            onStageClick={() => {
              setSelectedEdge(null);
              setMixedCause(null);
            }}
          />
        )}
        {whyLinkedModel && (
          <div className="absolute inset-x-3 bottom-3 z-20 max-h-[55%] lg:inset-x-auto lg:left-3 lg:top-3 lg:bottom-auto lg:w-[22rem] lg:max-h-[min(70%,24rem)]">
            <WhyLinkedPanel
              model={whyLinkedModel}
              variant="overlay"
              onClose={() => setSelectedEdge(null)}
              onSelectEntity={selectFromWhyLinked}
            />
          </div>
        )}
        {mixedCause && !selectedId && clusterCauseOnStop(activePeopleStop) && (
          <div className="absolute inset-x-3 bottom-3 z-20 max-h-[55%] lg:inset-x-auto lg:right-3 lg:left-auto lg:top-3 lg:bottom-auto lg:w-[18rem] lg:max-h-[min(70%,20rem)]">
            <div className="rounded-md border border-line bg-surface p-3 shadow-[0_8px_24px_rgba(26,36,32,0.1)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-heading font-semibold text-sm text-ink">
                    {MIXED_BOARDS_LABEL}
                  </h4>
                  <p className="text-xs font-body text-ink-muted mt-0.5">
                    Shared organizations
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMixedCause(null)}
                  className="text-sm font-body text-ink-muted hover:text-ink leading-none px-1"
                  aria-label="Close mixed boards"
                >
                  Close
                </button>
              </div>
              {mixedCause.topOrgs.length === 0 ? (
                <p className="text-sm font-body text-ink-muted mt-2">
                  No shared organization stands out.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {mixedCause.topOrgs.map((org) => {
                    const selectable = Boolean(org.id) && !org.id.startsWith("name:");
                    return (
                      <li key={org.id}>
                        {selectable ? (
                          <button
                            type="button"
                            onClick={() => {
                              setMixedCause(null);
                              onSelectOrg?.(org.id);
                            }}
                            className="font-heading font-semibold text-sm text-forest-700 underline hover:text-forest-900 text-left"
                          >
                            {org.label}
                          </button>
                        ) : (
                          <span className="font-heading font-semibold text-sm text-ink">
                            {org.label}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
      {selectedId && hops === 2 && (
        <p className="text-[11px] font-body text-ink-muted">
          Each spoke is a board this person sits on; the people fanned beside it
          also sit on that board. Full list under “Shared boards”.
        </p>
      )}
      <GraphLegend
        peopleAffinity={!selectedId}
        showSeats={Boolean(selectedId)}
        nodes={graphNodes}
      />
    </div>
  );

  return (
    <FocusPanes
      master={master}
      viz={vizPane}
      detail={detailPane}
      vizLabel="Network"
      mobileStep={mobileStep}
      onMobileStep={setMobileStep}
      showOpenControl={false}
    />
  );
}
