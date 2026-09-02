"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ORG_TYPE_LABELS, type Organization, type OrgType } from "@/lib/types";
import type { OrgAffinityResponse } from "@/lib/civic-graph";
import GraphLegend from "./graph/GraphLegend";

const CivicGraph = dynamic(() => import("./graph/CivicGraph"), { ssr: false });

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
  const [items, setItems] = useState<Organization[]>([]);
  const [total, setTotal] = useState<number | null>(count);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [affinity, setAffinity] = useState<OrgAffinityResponse | null>(null);
  const [affinityError, setAffinityError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams({ limit: "50", offset: "0" });
    if (debounced) params.set("q", debounced);
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
  }, [debounced]);

  useEffect(() => {
    fetch("/api/graph/org-affinity?current_only=true&min_jaccard=0.15&min_shared=1&limit_orgs=40")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data as OrgAffinityResponse;
      })
      .then(setAffinity)
      .catch((err) => setAffinityError(err.message));
  }, []);

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

  const trulyEmpty =
    !listLoading && !listError && !debounced && (count === 0 || total === 0);

  if (unavailable && (count == null || count === 0) && items.length === 0 && !listLoading) {
    return (
      <p className="text-sm font-body text-forest-500">
        Organization directory is temporarily unavailable.
      </p>
    );
  }

  if (trulyEmpty) {
    return (
      <p className="text-sm font-body text-forest-500">
        No organizations loaded yet. Apply the civic graph migrations, or the
        directory API may be unreachable.
      </p>
    );
  }

  const currentMembers = (detail?.members ?? []).filter((row) => row.is_current && row.person);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
        <aside className="space-y-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search organizations…"
            className="w-full px-3 py-2 rounded-lg border border-cream-300 bg-white font-body text-sm text-forest-800 placeholder:text-forest-400 focus:outline-none focus:ring-2 focus:ring-forest-500/30 focus:border-forest-500"
          />
          {listLoading ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 bg-cream-100 rounded-lg" />
              ))}
            </div>
          ) : listError ? (
            <p className="text-sm font-body text-forest-500">{listError}</p>
          ) : items.length === 0 ? (
            <p className="text-sm font-body text-forest-500">
              No organizations match this search.
            </p>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto divide-y divide-cream-200 rounded-lg border border-cream-200">
              {items.map((org) => {
                const active = org.id === selectedId;
                return (
                  <li key={org.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(org.id)}
                      className={`w-full text-left px-3 py-2.5 transition-colors ${
                        active ? "bg-forest-50" : "hover:bg-cream-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-heading font-semibold text-sm text-forest-800">
                          {org.name}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-forest-500 flex-shrink-0">
                          {ORG_TYPE_LABELS[org.org_type as OrgType] || org.org_type}
                        </span>
                      </div>
                      <p className="text-[11px] font-body text-forest-500 mt-0.5">
                        {org.current_member_count ?? org.member_count ?? 0} current members
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <div className="space-y-3 min-w-0">
          {detail ? (
            <div className="rounded-lg border border-cream-200 bg-cream-50/60 p-3 space-y-2">
              <h3 className="font-heading font-semibold text-forest-800">{detail.name}</h3>
              {detail.description && (
                <p className="text-sm font-body text-forest-600 leading-relaxed">
                  {detail.description}
                </p>
              )}
              <p className="text-xs font-body text-forest-500">
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
                <p className="text-sm font-body text-forest-500">
                  No current members recorded for this organization.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm font-body text-forest-500">
              Select an organization to see overlapping membership.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="font-heading font-semibold text-forest-800 text-sm">
          Shared membership
        </h3>
        <p className="text-xs font-body text-forest-500">
          Organizations connected when they share current members (Jaccard
          overlap). This is overlapping membership, not a political grouping.
        </p>
        {affinityError && (
          <p className="text-sm font-body text-forest-500">{affinityError}</p>
        )}
        <CivicGraph
          nodes={(affinity?.nodes ?? []).map((node) => ({
            id: node.id,
            kind: "organization" as const,
            label: node.label,
            org_type: node.org_type,
            size: node.size,
          }))}
          edges={(affinity?.edges ?? []).map((edge) => ({
            source: edge.source,
            target: edge.target,
            kind: "membership",
            shared: edge.shared,
            jaccard: edge.jaccard,
          }))}
          onNodeClick={(id) => setSelectedId(id)}
          heightClassName="h-[300px] sm:h-[360px]"
        />
        <GraphLegend affinity showSeats={false} />
      </div>
    </div>
  );
}
