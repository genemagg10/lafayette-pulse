"use client";

import type { Person } from "@/lib/types";

interface PeopleListProps {
  people: Person[];
  loading: boolean;
}

export default function PeopleList({ people, loading }: PeopleListProps) {
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-cream-100 rounded-lg" />
        ))}
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <p className="text-sm font-body text-forest-500">
        No people loaded yet. Seat holders, commissioners, and candidates will
        appear here as the civic graph is populated.
      </p>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {people.map((person) => (
        <li
          key={person.id}
          className="rounded-lg border border-cream-200 bg-cream-50/60 p-3"
        >
          <h3 className="font-heading font-semibold text-forest-800 text-sm">
            {person.full_name}
          </h3>
          {person.bio && (
            <p className="text-sm font-body text-forest-600 mt-1 leading-relaxed">
              {person.bio}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs font-body text-forest-500">
            {person.email && (
              <a href={`mailto:${person.email}`} className="underline hover:text-forest-800">
                {person.email}
              </a>
            )}
            {person.website && (
              <a
                href={person.website}
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
