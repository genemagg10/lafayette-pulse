"use client";

import { useState } from "react";
import type { GuidePerson } from "@/lib/election";

export function ExpandableText({
  text,
  preview,
  truncated,
  moreLabel,
}: {
  text: string;
  preview: string;
  truncated: boolean;
  moreLabel: string;
}) {
  const [open, setOpen] = useState(false);
  if (!truncated) {
    return <p className="text-sm font-body text-ink leading-relaxed">{text}</p>;
  }
  return (
    <div>
      <p className="text-sm font-body text-ink leading-relaxed">{open ? text : preview}</p>
      <button
        type="button"
        className="mt-1 text-xs font-body font-semibold text-accent underline"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Show less" : moreLabel}
      </button>
    </div>
  );
}

export function PersonList({
  people,
  limit = 8,
}: {
  people: GuidePerson[];
  limit?: number;
}) {
  const [open, setOpen] = useState(false);
  if (people.length === 0) {
    return <p className="text-sm font-body text-ink-muted">None on file.</p>;
  }
  const shown = open ? people : people.slice(0, limit);
  const hidden = people.length - shown.length;
  return (
    <div>
      <ul className="space-y-1">
        {shown.map((person) => (
          <li key={person.id} className="text-sm font-body text-ink">
            <span className="font-semibold">{person.name}</span>
            {person.title ? <span className="text-ink-muted"> · {person.title}</span> : null}
            {person.sourceUrl ? (
              <>
                {" "}
                <a
                  href={person.sourceUrl}
                  className="text-xs text-accent underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  source
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
      {people.length > limit ? (
        <button
          type="button"
          className="mt-2 text-xs font-body font-semibold text-accent underline"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Show fewer" : `Show all ${people.length} (${hidden} more)`}
        </button>
      ) : null}
    </div>
  );
}
