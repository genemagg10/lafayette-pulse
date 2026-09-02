"use client";

import { ORG_TYPE_LABELS, type Organization } from "@/lib/types";

interface OrganizationListProps {
  organizations: Organization[];
  loading: boolean;
}

export default function OrganizationList({
  organizations,
  loading,
}: OrganizationListProps) {
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-cream-100 rounded-lg" />
        ))}
      </div>
    );
  }

  if (organizations.length === 0) {
    return (
      <p className="text-sm font-body text-forest-500">
        No organizations loaded yet. Apply the civic graph migrations, or the
        directory API may be unreachable.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {organizations.map((org) => (
        <li
          key={org.id}
          className="rounded-lg border border-cream-200 bg-cream-50/60 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-heading font-semibold text-forest-800 text-sm">
              {org.name}
            </h3>
            <span className="text-[11px] font-body uppercase tracking-wide text-forest-500 bg-white border border-cream-200 rounded-full px-2 py-0.5 flex-shrink-0">
              {ORG_TYPE_LABELS[org.org_type] || org.org_type}
            </span>
          </div>
          {org.description && (
            <p className="text-sm font-body text-forest-600 mt-1.5 leading-relaxed">
              {org.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs font-body text-forest-500">
            {org.location_name && <span>{org.location_name}</span>}
            {org.website && (
              <a
                href={org.website}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-forest-800"
              >
                Website ↗
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
