"use client";

import { useState } from "react";
import { MIXED_BOARDS_LABEL } from "@/lib/cluster-cause";
import type { OrgEdgeFilterChip } from "@/lib/people-org-edge-filter";

export default function PeopleOrgEdgeFilter({
  chips,
  selectedOrgId,
  onSelectOrg,
  onClear,
}: {
  chips: OrgEdgeFilterChip[];
  selectedOrgId: string | null;
  onSelectOrg: (orgId: string) => void;
  onClear: () => void;
}) {
  const [mixedOpen, setMixedOpen] = useState(false);
  const mixed = chips.find((chip) => chip.kind === "mixed");
  const mixedSelected =
    mixed?.kind === "mixed" &&
    Boolean(selectedOrgId) &&
    mixed.orgs.some((org) => org.id === selectedOrgId);
  const listOpen = mixedOpen || mixedSelected;

  if (chips.length === 0) return null;

  const chipClass = (active: boolean) =>
    `px-2 py-0.5 rounded-full text-[11px] font-body border transition-colors ${
      active
        ? "border-line-strong bg-forest-soft text-forest-800"
        : "border-line bg-surface text-ink-muted hover:text-ink hover:border-line-strong"
    }`;

  return (
    <div className="space-y-1.5">
      <div
        role="group"
        aria-label="Show links for one organization"
        className="flex flex-wrap items-center gap-1.5"
      >
        {chips.map((chip) => {
          if (chip.kind === "org") {
            const active = selectedOrgId === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setMixedOpen(false);
                  if (active) onClear();
                  else onSelectOrg(chip.id);
                }}
                className={chipClass(active)}
              >
                {chip.label}
              </button>
            );
          }
          return (
            <button
              key={chip.id}
              type="button"
              aria-expanded={listOpen}
              aria-controls="people-mixed-board-orgs"
              onClick={() => setMixedOpen((open) => !open)}
              className={chipClass(mixedSelected || mixedOpen)}
            >
              {MIXED_BOARDS_LABEL}
            </button>
          );
        })}
        {selectedOrgId && (
          <button
            type="button"
            onClick={() => {
              setMixedOpen(false);
              onClear();
            }}
            className="text-[11px] font-body text-forest-700 underline hover:text-forest-900 px-1"
          >
            Clear
          </button>
        )}
      </div>
      {mixed && mixed.kind === "mixed" && listOpen && (
        <ul
          id="people-mixed-board-orgs"
          className="flex flex-wrap items-center gap-1.5"
        >
          {mixed.orgs.map((org) => {
            const active = selectedOrgId === org.id;
            return (
              <li key={org.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    if (active) onClear();
                    else onSelectOrg(org.id);
                  }}
                  className={chipClass(active)}
                >
                  {org.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
