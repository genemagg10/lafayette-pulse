"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Person } from "@/lib/types";
import type { EgoGraphResponse, SharedBoardOverlap } from "@/lib/civic-graph";
import GraphLegend, { GraphLabelToggle } from "./graph/GraphLegend";
import type { GraphLabelMode } from "@/lib/graph-labels";
import PersonAvatar from "./PersonAvatar";
import OnTheRecord, { type OnTheRecordItem } from "./OnTheRecord";
import FocusPanes, { type MobileStep } from "./FocusPanes";
import FootprintChip from "./FootprintChip";
import WhyLinkedPanel from "./WhyLinkedPanel";
import {
  DetailLink,
  DetailSection,
  IdentityHeader,
  StickyDetailChrome,
} from "./WhoDetailChrome";
import type { RenderableEdge } from "./graph/CivicGraph";
import {
  buildWhyLinkedModel,
  toggleWhyLinkedEdge,
} from "@/lib/why-linked";

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
  onSelectPerson?: (id: string) => void;
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
  const [hasSeat, setHasSeat] = useState<"all" | "seated">("seated");
  const [items, setItems] = useState<Person[]>([]);
  const [total, setTotal] = useState<number | null>(count);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(selectedPersonId ?? null);
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [ego, setEgo] = useState<EgoGraphResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hops, setHops] = useState<1 | 2>(1);
  const [currentOnly, setCurrentOnly] = useState(true);
  const [onTheRecord, setOnTheRecord] = useState<OnTheRecordItem[]>([]);
  const [mobileStep, setMobileStep] = useState<MobileStep>("list");
  const [selectedEdge, setSelectedEdge] = useState<RenderableEdge | null>(null);
  const [labelMode, setLabelMode] = useState<GraphLabelMode>("focus");
  const selectedPersonIdRef = useRef(selectedPersonId);
  selectedPersonIdRef.current = selectedPersonId;

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (selectedPersonId) setSelectedId(selectedPersonId);
  }, [selectedPersonId]);

  const selectPerson = (id: string) => {
    setSelectedId(id);
    onSelectPerson?.(id);
    setMobileStep("detail");
  };

  const selectFromWhyLinked = (id: string, kind: "person" | "organization") => {
    if (kind === "person") {
      selectPerson(id);
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
        setSelectedId((current) => {
          if (selectedPersonIdRef.current) return selectedPersonIdRef.current;
          if (current) return current;
          const preferred =
            nextItems.find((person) => /anduri/i.test(person.full_name)) ||
            nextItems[0] ||
            null;
          return preferred?.id ?? null;
        });
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
      alter_cap: "25",
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
  }, [selectedId, hops, currentOnly]);

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

  const whyLinkedModel = useMemo(() => {
    if (!selectedEdge) return null;
    return buildWhyLinkedModel(selectedEdge, ego?.nodes ?? []);
  }, [selectedEdge, ego]);

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
          Has a formal seat
        </label>
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
          {whyLinkedModel && (
            <WhyLinkedPanel
              model={whyLinkedModel}
              className="hidden lg:block"
              onClose={() => setSelectedEdge(null)}
              onSelectEntity={selectFromWhyLinked}
            />
          )}
        </StickyDetailChrome>
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

  const vizPane = (
    <div className="flex flex-col h-full min-h-[420px] gap-2">
      <div className="flex flex-wrap items-center gap-3 text-xs font-body text-forest-600">
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={hops === 2}
            onChange={(e) => setHops(e.target.checked ? 2 : 1)}
          />
          Two hops (shared boards)
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={currentOnly}
            onChange={(e) => setCurrentOnly(e.target.checked)}
          />
          Current only
        </label>
        <GraphLabelToggle mode={labelMode} onChange={setLabelMode} />
      </div>
      <div className="flex-1 min-h-[420px]">
        {detailLoading && !ego ? (
          <div className="h-full min-h-[420px] bg-surface-muted rounded-md animate-pulse" />
        ) : (
          <CivicGraph
            nodes={ego?.nodes ?? []}
            edges={ego?.edges ?? []}
            centerId={ego?.center.id}
            labelMode={labelMode}
            selectedEdge={selectedEdge}
            heightClassName="h-full min-h-[420px]"
            onNodeClick={(id, kind) => {
              if (kind === "person") selectPerson(id);
              if (kind === "organization") onSelectOrg?.(id);
            }}
            onEdgeClick={(edge) =>
              setSelectedEdge((current) => toggleWhyLinkedEdge(current, edge))
            }
          />
        )}
      </div>
      <GraphLegend nodes={ego?.nodes} />
    </div>
  );

  return (
    <>
      <FocusPanes
        master={master}
        viz={vizPane}
        detail={detailPane}
        vizLabel="Network"
        mobileStep={mobileStep}
        onMobileStep={setMobileStep}
      />
      {whyLinkedModel && (
        <WhyLinkedPanel
          model={whyLinkedModel}
          variant="sheet"
          onClose={() => setSelectedEdge(null)}
          onSelectEntity={selectFromWhyLinked}
        />
      )}
    </>
  );
}
