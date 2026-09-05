"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import BoardTabs from "./BoardTabs";
import FocusPanes, { type MobileStep } from "./FocusPanes";
import GraphLegend, { GraphLabelToggle } from "./graph/GraphLegend";
import OnTheRecord, { type OnTheRecordItem } from "./OnTheRecord";
import PersonAvatar from "./PersonAvatar";
import {
  DetailLink,
  DetailSection,
  IdentityHeader,
  StickyDetailChrome,
} from "./WhoDetailChrome";
import type { GraphLabelMode } from "@/lib/graph-labels";
import type { EgoGraphResponse } from "@/lib/civic-graph";
import {
  CANDIDACY_STATUS_LABELS,
  type CandidateItem,
} from "@/lib/candidates-data";

const CivicGraph = dynamic(() => import("./graph/CivicGraph"), { ssr: false });

interface CandidatesExplorerProps {
  count: number | null;
  unavailable?: boolean;
  onSelectPerson?: (id: string) => void;
  onSelectOrg?: (id: string) => void;
}

function officeLine(candidate: CandidateItem): string {
  const office = candidate.office_org_name || candidate.office;
  const parts: string[] = [];
  if (office) parts.push(office);
  if (candidate.election_date) parts.push(candidate.election_date);
  return parts.join(" · ");
}

export default function CandidatesExplorer({
  count,
  unavailable,
  onSelectPerson,
  onSelectOrg,
}: CandidatesExplorerProps) {
  const [items, setItems] = useState<CandidateItem[]>([]);
  const [total, setTotal] = useState<number | null>(count);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ego, setEgo] = useState<EgoGraphResponse | null>(null);
  const [egoLoading, setEgoLoading] = useState(false);
  const [labelMode, setLabelMode] = useState<GraphLabelMode>("focus");
  const [mobileStep, setMobileStep] = useState<MobileStep>("list");

  useEffect(() => {
    setListLoading(true);
    setListError(null);
    fetch("/api/candidates?limit=50&offset=0")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data;
      })
      .then((data) => {
        const next: CandidateItem[] = Array.isArray(data?.items)
          ? data.items
          : [];
        setItems(next);
        setTotal(typeof data?.total === "number" ? data.total : next.length);
        setListLoading(false);
        setSelectedId((current) => {
          if (current && next.some((row) => row.person_id === current)) {
            return current;
          }
          return next[0]?.person_id ?? null;
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
      setEgo(null);
      return;
    }
    setEgoLoading(true);
    fetch(`/api/people/${selectedId}/ego?hops=1&current_only=false&alter_cap=25`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data as EgoGraphResponse;
      })
      .then((data) => setEgo(data))
      .catch(() => setEgo(null))
      .finally(() => setEgoLoading(false));
  }, [selectedId]);

  const tabsUnavailable =
    unavailable && (count == null || count === 0) && items.length === 0 && !listLoading;

  if (tabsUnavailable) {
    return (
      <p className="text-sm font-body text-ink-muted p-3">
        Candidates are temporarily unavailable.
      </p>
    );
  }

  const selected = items.find((row) => row.person_id === selectedId) ?? null;

  const trulyEmpty =
    !listLoading && !listError && (total === 0 || items.length === 0);

  const header = (
    <BoardTabs
      value="candidates"
      onChange={() => {}}
      ariaLabel="Candidates view"
      options={[{ id: "candidates", label: "Candidates" }]}
    />
  );

  if (trulyEmpty) {
    return (
      <div className="h-full min-h-0 overflow-y-auto p-3 space-y-4">
        {header}
        <div className="rounded-md border border-dashed border-line-strong bg-canvas p-6 text-center">
          <p className="font-heading font-semibold text-ink">
            No candidates yet
          </p>
          <p className="text-sm font-body text-ink-muted mt-2 max-w-lg mx-auto leading-relaxed">
            People running for local office appear here with their office,
            organizational affinities, and quote-backed positions. Seed them with
            migration <code className="text-xs">010_seed_candidates_measures.sql</code>{" "}
            or the civic-graph extractor.
          </p>
        </div>
      </div>
    );
  }

  const master = (
    <div className="space-y-3">
      {header}
      <p className="text-[11px] font-body text-ink-muted">
        Who is running — office, affinities, and positions on the record.
      </p>
      {listLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-surface-muted rounded-md" />
          ))}
        </div>
      ) : listError ? (
        <p className="text-sm font-body text-ink-muted">{listError}</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {items.map((candidate) => {
            const active = candidate.person_id === selectedId;
            return (
              <li key={candidate.candidacy_id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(candidate.person_id);
                    setMobileStep("detail");
                  }}
                  className={`w-full text-left px-3 py-2.5 transition-colors flex items-center gap-2.5 border-l-2 ${
                    active
                      ? "border-forest bg-forest-soft"
                      : "border-transparent hover:bg-canvas"
                  }`}
                >
                  <PersonAvatar
                    name={candidate.full_name}
                    photoUrl={candidate.photo_url}
                    size={32}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-heading font-semibold text-sm text-ink">
                      {candidate.full_name}
                    </div>
                    <div className="text-[11px] font-body text-ink-muted mt-0.5 truncate">
                      {officeLine(candidate) || "Candidate"}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide text-ink-muted flex-shrink-0">
                    {CANDIDACY_STATUS_LABELS[candidate.status] || candidate.status}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const positions: OnTheRecordItem[] = (selected?.positions ?? []).map((p) => ({
    id: p.id,
    polarity: p.polarity,
    confidence: p.confidence,
    evidence_quote: p.evidence_quote,
    source_url: p.source_url,
    as_of: p.as_of,
    subject_title: p.subject_title,
  }));

  const detailPane = (
    <div className="space-y-3">
      {selected ? (
        <>
          <StickyDetailChrome>
            <IdentityHeader
              name={selected.full_name}
              subtitle={officeLine(selected) || null}
              website={selected.website}
              photoUrl={selected.photo_url}
            />
          </StickyDetailChrome>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <span className="text-[11px] font-body px-2 py-0.5 rounded-full bg-surface-muted border border-line text-forest-700">
                {CANDIDACY_STATUS_LABELS[selected.status] || selected.status}
              </span>
              {selected.party_or_slate && (
                <span className="text-[11px] font-body px-2 py-0.5 rounded-full bg-surface-muted border border-line text-forest-700">
                  {selected.party_or_slate}
                </span>
              )}
            </div>
            {selected.bio && (
              <p className="text-[13px] font-body text-forest-600 leading-snug">
                {selected.bio}
              </p>
            )}
            <DetailSection
              title="Organizational affinities"
              items={selected.affinities}
              getKey={(row) => `${row.organization_id}-${row.role ?? ""}`}
              renderItem={(row) => (
                <>
                  <DetailLink
                    onClick={
                      onSelectOrg
                        ? () => onSelectOrg(row.organization_id)
                        : undefined
                    }
                  >
                    {row.organization_name}
                  </DetailLink>
                  {row.role ? ` · ${row.role}` : ""}
                  {row.is_current ? "" : " (past)"}
                </>
              )}
              empty={
                <p className="text-xs font-body text-ink-muted">
                  No memberships recorded.
                </p>
              }
            />
            {positions.length > 0 ? (
              <OnTheRecord items={positions} bare />
            ) : (
              <section className="space-y-1">
                <h4 className="text-[11px] uppercase tracking-wide text-ink-muted font-body">
                  On the record
                </h4>
                <p className="text-xs font-body text-ink-muted">
                  No quote-backed positions recorded yet. Positions are never
                  inferred from board membership.
                </p>
              </section>
            )}
            {selected.source_url && (
              <a
                href={selected.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-[11px] font-body underline text-forest-600 hover:text-ink"
              >
                Candidacy source ↗
              </a>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm font-body text-ink-muted">
          Select a candidate to see their office, affinities, and positions.
        </p>
      )}
    </div>
  );

  const vizPane = (
    <div className="flex flex-col h-full min-h-[420px] gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading font-semibold text-ink text-sm">
          Affinity network
        </h3>
        <GraphLabelToggle mode={labelMode} onChange={setLabelMode} />
      </div>
      <div className="flex-1 min-h-[420px]">
        {egoLoading && !ego ? (
          <div className="h-full min-h-[420px] bg-surface-muted rounded-md animate-pulse" />
        ) : (
          <CivicGraph
            nodes={ego?.nodes ?? []}
            edges={ego?.edges ?? []}
            centerId={ego?.center.id}
            layout="ego"
            labelMode={labelMode}
            heightClassName="h-full min-h-[420px]"
            onNodeClick={(id, kind) => {
              if (kind === "person") onSelectPerson?.(id);
              if (kind === "organization") onSelectOrg?.(id);
            }}
          />
        )}
      </div>
      <GraphLegend nodes={ego?.nodes} />
    </div>
  );

  return (
    <FocusPanes
      master={master}
      viz={vizPane}
      detail={detailPane}
      vizLabel="Affinity network"
      mobileStep={mobileStep}
      onMobileStep={setMobileStep}
    />
  );
}
