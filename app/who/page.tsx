"use client";

import { Suspense, useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BoardTabs from "../components/BoardTabs";
import FocusFrame from "../components/FocusFrame";
import InvolvementBoard from "../components/InvolvementBoard";
import MeasuresExplorer from "../components/MeasuresExplorer";
import OrganizationExplorer from "../components/OrganizationExplorer";
import PeopleExplorer from "../components/PeopleExplorer";
import { WHO_TABS, parseWhoTab, type WhoTab } from "@/lib/layout-ia";
import { useHealth } from "@/lib/use-health";

function WhoWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseWhoTab(searchParams.get("tab"));
  const { health, freshness } = useHealth();
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);

  const setTab = useCallback(
    (next: WhoTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const civicCountsDown = freshness.unavailable;
  const peopleCount = health?.counts.people ?? null;
  const orgCount = health?.counts.organizations ?? null;
  const membershipCount = health?.counts.memberships ?? null;
  const seatHolderCount = health?.counts.seat_holders ?? null;
  const measureCount = health?.counts.measures ?? null;

  return (
    <FocusFrame>
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
            />
          )}
          {tab === "orgs" && (
            <OrganizationExplorer
              count={orgCount}
              unavailable={civicCountsDown}
            />
          )}
          {tab === "measures" && (
            <MeasuresExplorer
              count={measureCount}
              unavailable={civicCountsDown}
            />
          )}
          {tab === "footprint" && (
            <InvolvementBoard
              memberships={membershipCount}
              seatHolders={seatHolderCount}
              unavailable={civicCountsDown}
              onSelectPerson={(id) => {
                setSelectedPersonId(id);
                setTab("people");
              }}
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
