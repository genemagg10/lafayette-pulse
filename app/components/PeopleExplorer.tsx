"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { Person } from "@/lib/types";
import type { EgoGraphResponse } from "@/lib/civic-graph";
import GraphLegend from "./graph/GraphLegend";

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
}

interface PeopleExplorerProps {
  count: number | null;
  unavailable?: boolean;
}

export default function PeopleExplorer({ count, unavailable }: PeopleExplorerProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [hasSeat, setHasSeat] = useState<"all" | "seated">("all");
  const [items, setItems] = useState<Person[]>([]);
  const [total, setTotal] = useState<number | null>(count);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PersonDetail | null>(null);
  const [ego, setEgo] = useState<EgoGraphResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [hops, setHops] = useState<1 | 2>(1);
  const [currentOnly, setCurrentOnly] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams({ limit: "50", offset: "0" });
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
          if (current && nextItems.some((person) => person.id === current)) {
            return current;
          }
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
    ])
      .then(([person, graph]) => {
        setDetail(person);
        setEgo(graph);
      })
      .catch(() => {
        setDetail(null);
        setEgo(null);
      })
      .finally(() => setDetailLoading(false));
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

  if (unavailable && (count == null || count === 0) && items.length === 0 && !listLoading) {
    return (
      <p className="text-sm font-body text-forest-500">
        Who&apos;s Who is temporarily unavailable.
      </p>
    );
  }

  if (trulyEmpty) {
    return (
      <p className="text-sm font-body text-forest-500">
        No people loaded yet. Seat holders, commissioners, and candidates will
        appear here as the civic graph is populated.
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(240px,300px)_1fr]">
      <aside className="space-y-3">
        <div className="flex flex-col gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            className="w-full px-3 py-2 rounded-lg border border-cream-300 bg-white font-body text-sm text-forest-800 placeholder:text-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-500/30 focus:border-forest-500"
          />
          <label className="inline-flex items-center gap-2 text-xs font-body text-forest-600">
            <input
              type="checkbox"
              checked={hasSeat === "seated"}
              onChange={(e) => setHasSeat(e.target.checked ? "seated" : "all")}
            />
            Has a formal seat
          </label>
        </div>
        {listLoading ? (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-cream-100 rounded-lg" />
            ))}
          </div>
        ) : listError ? (
          <p className="text-sm font-body text-forest-500">{listError}</p>
        ) : empty ? (
          <p className="text-sm font-body text-forest-500">
            No people match this search.
          </p>
        ) : (
          <ul className="max-h-[420px] overflow-y-auto divide-y divide-cream-200 rounded-lg border border-cream-200">
            {items.map((person) => {
              const active = person.id === selectedId;
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(person.id)}
                    className={`w-full text-left px-3 py-2.5 transition-colors ${
                      active ? "bg-forest-50" : "hover:bg-cream-50"
                    }`}
                  >
                    <div className="font-heading font-semibold text-sm text-forest-800">
                      {person.full_name}
                    </div>
                    <div className="text-[11px] font-body text-forest-500 mt-0.5 truncate">
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
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      <div className="space-y-3 min-w-0">
        {detailLoading && !detail ? (
          <div className="h-24 bg-cream-100 rounded-lg animate-pulse" />
        ) : selected ? (
          <div className="rounded-lg border border-cream-200 bg-cream-50/60 p-3 space-y-2">
            <h3 className="font-heading font-semibold text-forest-800">
              {selected.full_name}
            </h3>
            {detail?.bio && (
              <p className="text-sm font-body text-forest-600 leading-relaxed">
                {detail.bio}
              </p>
            )}
            {detail?.seats && detail.seats.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-forest-500 font-body mb-1">
                  Formal seats
                </p>
                <ul className="text-sm font-body text-forest-700 space-y-1">
                  {detail.seats.map((row) => (
                    <li key={row.id}>
                      {row.seat?.title}
                      {row.organization ? ` · ${row.organization.name}` : ""}
                      {row.is_current ? "" : " (past)"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {detail?.memberships && detail.memberships.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-forest-500 font-body mb-1">
                  Shared boards
                </p>
                <ul className="text-sm font-body text-forest-700 space-y-1">
                  {detail.memberships.map((row) => (
                    <li key={row.id}>
                      {row.organization?.name}
                      {row.role ? ` · ${row.role}` : ""}
                      {row.is_current ? "" : " (past)"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm font-body text-forest-500">
            Select a person to see overlapping membership and seats.
          </p>
        )}

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
        </div>

        <CivicGraph
          nodes={ego?.nodes ?? []}
          edges={ego?.edges ?? []}
          centerId={ego?.center.id}
        />
        <GraphLegend />
      </div>
    </div>
  );
}
