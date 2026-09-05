"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BoardRedirect from "../components/BoardRedirect";
import BoardTabs from "../components/BoardTabs";
import FocusFrame from "../components/FocusFrame";
import CandidatesExplorer from "../components/CandidatesExplorer";
import MeasuresExplorer from "../components/MeasuresExplorer";
import OrganizationExplorer from "../components/OrganizationExplorer";
import PeopleExplorer from "../components/PeopleExplorer";
import {
  WHO_FOOTPRINT_REDIRECT,
  WHO_TABS,
  isRetiredFootprintTab,
  parseWhoTab,
  type WhoTab,
} from "@/lib/layout-ia";
import { useHealth } from "@/lib/use-health";

function WhoWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseWhoTab(searchParams.get("tab"));
  const { health, freshness } = useHealth();
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  useEffect(() => {
    if (!isRetiredFootprintTab(searchParams.get("tab"))) return;
    router.replace(WHO_FOOTPRINT_REDIRECT, { scroll: false });
  }, [router, searchParams]);

  const setTab = useCallback(
    (next: WhoTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      if (next === "people" && !params.get("rank")) {
        params.set("rank", "footprint");
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const goToPerson = useCallback(
    (id: string) => {
      setSelectedPersonId(id);
      setTab("people");
    },
    [setTab]
  );

  const goToOrg = useCallback(
    (id: string) => {
      setSelectedOrgId(id);
      setTab("orgs");
    },
    [setTab]
  );

  const civicCountsDown = freshness.unavailable;
  const peopleCount = health?.counts.people ?? null;
  const orgCount = health?.counts.organizations ?? null;
  const measureCount = health?.counts.measures ?? null;
  const candidateCount = health?.counts.candidacies ?? null;

  return (
    <FocusFrame>
      <BoardRedirect />
      <div className="h-full min-h-0 flex flex-col">
        <div className="flex-shrink-0 px-3 py-2 border-b border-line bg-surface overflow-x-auto">
          <BoardTabs
            value={tab}
            onChange={setTab}
            ariaLabel="Who views"
            options={[...WHO_TABS]}
          />
        </div>
        <div className="flex-1 min-h-0">
          {tab === "people" && (
            <PeopleExplorer
              count={peopleCount}
              unavailable={civicCountsDown}
              selectedPersonId={selectedPersonId}
              onSelectPerson={setSelectedPersonId}
              onSelectOrg={goToOrg}
            />
          )}
          {tab === "orgs" && (
            <OrganizationExplorer
              count={orgCount}
              unavailable={civicCountsDown}
              selectedOrgId={selectedOrgId}
              onSelectOrg={setSelectedOrgId}
              onSelectPerson={goToPerson}
            />
          )}
          {tab === "measures" && (
            <MeasuresExplorer
              count={measureCount}
              unavailable={civicCountsDown}
            />
          )}
          {tab === "candidates" && (
            <CandidatesExplorer
              count={candidateCount}
              unavailable={civicCountsDown}
              onSelectPerson={goToPerson}
              onSelectOrg={goToOrg}
            />
          )}
        </div>
      </div>
    </FocusFrame>
  );
}

export default function WhoPage() {
  return (
    <Suspense
      fallback={
        <FocusFrame>
          <div className="h-full bg-canvas animate-pulse" />
        </FocusFrame>
      }
    >
      <WhoWorkspace />
    </Suspense>
  );
}
