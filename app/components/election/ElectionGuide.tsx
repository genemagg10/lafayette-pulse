import type { ReactNode } from "react";
import Link from "next/link";
import {
  LIST_PREVIEW,
  type DonationBucket,
  type DonationLineView,
  type ElectionModel,
  type GuideContest,
  type GuideMeasure,
  type QuoteGroup,
} from "@/lib/election";
import {
  CAL_ACCESS,
  CAL_ACCESS_AS_OF,
  CAL_ACCESS_WARNING,
  CANDIDATE_SOURCE_NOTE,
  DISTRICT_FACTS,
  LOCAL_CHOICE,
  MEASURE_GUIDE_NOTES,
  WATCH_NOTES,
} from "@/lib/election-static";
import { ExpandableText, PersonList } from "./Expandable";

const JUMP = [
  ["#dates", "Key dates"],
  ["#watch", "Watch"],
  ["#districts", "Districts"],
  ["#measures", "Local measures"],
  ["#propositions", "Propositions"],
  ["#candidates", "Candidates"],
  ["#donations", "Donations"],
];

export default function ElectionGuide({ model }: { model: ElectionModel }) {
  const dates = model.events.filter((event) => event.group === "dates");
  const watch = model.events.filter((event) => event.group === "watch");

  return (
    <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 space-y-10">
      <header className="space-y-3">
        <p className="text-xs font-body font-semibold uppercase tracking-wider text-accent">
          November 3, 2026
        </p>
        <h1 className="font-heading text-3xl font-bold text-ink tracking-tight">
          Lafayette voter guide
        </h1>
        <p className="text-sm font-body text-ink-muted leading-relaxed">
          Nonpartisan. Compiled for Lafayette Pulse from official and public sources.
          Every fact links to its source. This guide does not recommend how to vote.
          Endorsements are listed as reported by the endorsers.
        </p>
        <p className="text-sm font-body text-forest-900 bg-amber-50 border border-amber-300 px-3 py-2">
          Election data is not certified. Nobody on this page is shown as elected.
          Appointment, incumbency, and a database status are not results.
        </p>
      </header>

      <nav aria-label="On this page" className="flex flex-wrap gap-2">
        {JUMP.map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="text-xs font-body px-2.5 py-1 border border-line bg-surface text-ink hover:border-accent"
          >
            {label}
          </a>
        ))}
      </nav>

      <section id="dates" className="space-y-3 scroll-mt-20">
        <h2 className="font-heading text-xl font-bold text-ink border-b border-line pb-1">
          Key dates
        </h2>
        <EventList events={dates} empty="No election dates are on file." />
      </section>

      <section id="watch" className="space-y-3 scroll-mt-20">
        <h2 className="font-heading text-xl font-bold text-ink border-b border-line pb-1">
          How to watch the candidates
        </h2>
        <ul className="space-y-3">
          {WATCH_NOTES.map((note) => (
            <li key={note.title} className="text-sm font-body text-ink">
              <span className="font-semibold">{note.title}. </span>
              {note.text}{" "}
              <External href={note.href}>{note.label}</External>
            </li>
          ))}
        </ul>
        <EventList events={watch} empty="No forums are on file." />
      </section>

      <section id="districts" className="space-y-3 scroll-mt-20">
        <h2 className="font-heading text-xl font-bold text-ink border-b border-line pb-1">
          Which local districts Lafayette is in
        </h2>
        <ul className="space-y-4">
          {DISTRICT_FACTS.map((fact) => (
            <li key={fact.title}>
              <h3 className="font-heading font-semibold text-ink">{fact.title}</h3>
              <p className="text-sm font-body text-ink mt-1">{fact.text}</p>
              {fact.links.length > 0 ? (
                <p className="text-sm mt-1">
                  {fact.links.map((link) => (
                    <External key={link.href} href={link.href}>
                      {link.label}
                    </External>
                  ))}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section id="measures" className="space-y-4 scroll-mt-20">
        <h2 className="font-heading text-xl font-bold text-ink border-b border-line pb-1">
          Local measures
        </h2>
        <StanceLegend />
        {model.localMeasures.map((measure) => (
          <MeasureCard key={measure.id} measure={measure} />
        ))}
      </section>

      <section id="propositions" className="space-y-4 scroll-mt-20">
        <h2 className="font-heading text-xl font-bold text-ink border-b border-line pb-1">
          State propositions
        </h2>
        <p className="text-sm font-body text-ink bg-surface border border-line px-3 py-2">
          {CAL_ACCESS_WARNING} {CAL_ACCESS_AS_OF}
        </p>
        {model.propositions.map((measure) => (
          <MeasureCard key={measure.id} measure={measure} />
        ))}
      </section>

      <section id="candidates" className="space-y-5 scroll-mt-20">
        <h2 className="font-heading text-xl font-bold text-ink border-b border-line pb-1">
          Candidates
        </h2>
        <p className="text-sm font-body text-ink-muted">{CANDIDATE_SOURCE_NOTE}</p>
        {model.contests.map((contest) => (
          <ContestBlock key={contest.key} contest={contest} />
        ))}

        <div className="border border-amber-300 bg-amber-50 p-4 space-y-3">
          <h3 className="font-heading font-semibold text-ink">
            Not a Lafayette contest
          </h3>
          <p className="text-sm font-body text-ink">
            AUHSD Area 1 (Schweppe and Iyengar) is on a ballot, and the candidacy
            notes say it is not a Lafayette contest. Official GIS puts none of
            Lafayette in Area 1. They are kept out of the candidate list above.
          </p>
          {model.outside.length === 0 ? (
            <p className="text-sm font-body text-ink-muted">No Area 1 rows are on file.</p>
          ) : (
            <details>
              <summary className="text-sm font-body font-semibold text-ink cursor-pointer">
                Show the outside-Lafayette candidacies
              </summary>
              <div className="mt-3 space-y-4">
                {model.outside.map((contest) => (
                  <ContestBlock key={contest.key} contest={contest} marked />
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="font-heading font-semibold text-ink">Not on this ballot</h3>
          <p className="text-sm font-body text-ink-muted">
            These November-dated rows are absent from the ballot or were filled by
            appointment. That is not a certified result, and none of them are
            labeled elected.
          </p>
          {model.offBallot.map((contest) => (
            <ContestBlock key={contest.key} contest={contest} />
          ))}
        </div>
      </section>

      <Donations model={model} />

      <footer className="text-xs font-body text-ink-muted border-t border-line pt-4 space-y-1">
        <p>
          Measures, stances, candidacies, and dates are read from Lafayette Pulse
          records. Donations are NetFile Form 497 lines in the contributions table.
          Rows with <code>mirror_of</code> set are left out of every total.
        </p>
        <p>
          If something is wrong, correct it against the linked official source.{" "}
          <Link href="/who?tab=measures" className="underline text-accent">
            Measures in Who
          </Link>
          {" · "}
          <Link href="/who?tab=candidates" className="underline text-accent">
            Candidates in Who
          </Link>
        </p>
      </footer>
    </div>
  );
}

function External({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-accent underline" target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

function StanceLegend() {
  return (
    <ul className="flex flex-wrap gap-2 text-xs font-body">
      <li className="px-2 py-1 text-white" style={{ background: "var(--stance-support)" }}>
        Quoted support
      </li>
      <li className="px-2 py-1 text-white" style={{ background: "var(--stance-oppose)" }}>
        Quoted opposition
      </li>
      <li className="px-2 py-1 text-ink" style={{ background: "var(--stance-endorse)" }}>
        Endorsement
      </li>
      <li
        className="px-2 py-1 border border-dashed"
        style={{ borderColor: "var(--stance-oppose)", color: "var(--stance-oppose)" }}
      >
        Opposition endorsement (no quote)
      </li>
    </ul>
  );
}

function EventList({
  events,
  empty,
}: {
  events: ElectionModel["events"];
  empty: string;
}) {
  if (events.length === 0) {
    return <p className="text-sm font-body text-ink-muted">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-line border border-line bg-surface">
      {events.map((event) => (
        <li key={event.id} className="px-3 py-3">
          <p className="text-xs font-body text-ink-muted">
            {event.when}
            {event.past ? " · Past" : ""}
            {event.outsideLafayette ? " · Outside Lafayette" : ""}
          </p>
          <p className="font-heading font-semibold text-ink">{event.title}</p>
          {event.description ? (
            <p className="text-sm font-body text-ink mt-1">{event.description}</p>
          ) : null}
          {event.location ? (
            <p className="text-xs font-body text-ink-muted mt-1">{event.location}</p>
          ) : null}
          {event.sourceUrl ? (
            <p className="text-xs mt-1">
              <External href={event.sourceUrl}>Source</External>
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function MeasureCard({ measure }: { measure: GuideMeasure }) {
  const choice = LOCAL_CHOICE[measure.shortCode];
  const yes = measure.yes || choice?.yes || null;
  const no = measure.no || choice?.no || null;
  const money = CAL_ACCESS[measure.shortCode];
  const notes = MEASURE_GUIDE_NOTES[measure.shortCode] ?? [];

  return (
    <article id={`measure-${measure.shortCode}`} className="bg-surface border border-line p-4 space-y-4">
      <header>
        <p className="text-xs font-body font-semibold uppercase tracking-wider text-accent">
          {measure.local ? "Local measure" : "State proposition"}
          {measure.jurisdiction ? ` · ${measure.jurisdiction}` : ""}
        </p>
        <h3 className="font-heading text-lg font-bold text-ink mt-1">
          {measure.local ? `${measure.shortCode} · ${measure.title}` : measure.shortCode}
        </h3>
        {measure.local ? null : (
          <p className="text-sm font-body text-ink-muted mt-1">{measure.title}</p>
        )}
      </header>

      {measure.what ? (
        <div>
          <h4 className="text-xs font-body font-semibold uppercase tracking-wider text-ink-muted">
            What it does
          </h4>
          <p className="text-sm font-body text-ink mt-1 leading-relaxed">{measure.what}</p>
        </div>
      ) : null}

      {yes || no ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {yes ? (
            <p className="text-sm font-body border border-line px-3 py-2">
              <span className="font-semibold">Yes. </span>
              {yes}
            </p>
          ) : null}
          {no ? (
            <p className="text-sm font-body border border-line px-3 py-2">
              <span className="font-semibold">No. </span>
              {no}
            </p>
          ) : null}
        </div>
      ) : null}

      {measure.detail ? (
        <div>
          <h4 className="text-xs font-body font-semibold uppercase tracking-wider text-ink-muted">
            Impartial analysis
          </h4>
          <p className="text-sm font-body text-ink mt-1 leading-relaxed">{measure.detail}</p>
        </div>
      ) : null}

      {measure.notes ? (
        <p className="text-sm font-body text-ink-muted leading-relaxed">{measure.notes}</p>
      ) : null}

      {measure.vigSupporters || measure.vigOpponents ? (
        <p className="text-sm font-body text-ink">
          {measure.vigSupporters ? (
            <>
              <span className="font-semibold">Listed supporters (official guide): </span>
              {measure.vigSupporters}.{" "}
            </>
          ) : null}
          {measure.vigOpponents ? (
            <>
              <span className="font-semibold">Listed opponents: </span>
              {measure.vigOpponents}.
            </>
          ) : null}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        <QuoteBlock
          title="Quoted support"
          tone="support"
          groups={measure.quotedSupport}
        />
        <QuoteBlock
          title="Quoted opposition"
          tone="oppose"
          groups={measure.quotedOppose}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <aside className="border border-line p-3 space-y-2" style={{ borderColor: "var(--stance-endorse)" }}>
          <h4 className="font-heading text-sm font-semibold" style={{ color: "#8a6a12" }}>
            Endorsements ({measure.endorsements.length})
          </h4>
          <p className="text-xs font-body text-ink-muted">
            Endorse stances. No quote is required for this list.
          </p>
          <PersonList people={measure.endorsements} limit={LIST_PREVIEW} />
        </aside>
        <aside
          className="border border-dashed p-3 space-y-2"
          style={{ borderColor: "var(--stance-oppose)", background: "#fff7f2" }}
        >
          <h4 className="font-heading text-sm font-semibold" style={{ color: "var(--stance-oppose)" }}>
            Opposition endorsements ({measure.opposeEndorsements.length})
          </h4>
          <p className="text-xs font-body text-ink-muted">
            Oppose stances filed as endorsements, with no quote. They are not
            official ballot arguments and they are not mixed into Quoted opposition.
          </p>
          <PersonList people={measure.opposeEndorsements} limit={LIST_PREVIEW} />
        </aside>
      </div>

      {measure.neutral.length > 0 ? (
        <div className="border border-line p-3 space-y-2">
          <h4 className="font-heading text-sm font-semibold text-ink-muted">
            Neutral ({measure.neutral.length})
          </h4>
          <PersonList people={measure.neutral} />
        </div>
      ) : null}

      {notes.length > 0 ? (
        <ul className="space-y-2">
          {notes.map((note) => (
            <li key={note.text} className="text-sm font-body text-ink">
              {note.text}{" "}
              {note.href && note.label ? <External href={note.href}>{note.label}</External> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {money ? (
        <div className="border border-line bg-canvas p-3 space-y-2">
          <h4 className="font-heading text-sm font-semibold text-ink">
            Cal-Access committees for {measure.shortCode} only
          </h4>
          <p className="text-xs font-body text-ink-muted">{CAL_ACCESS_WARNING}</p>
          <CommitteeList label="Support committees" rows={money.support} />
          <CommitteeList label="Oppose committees" rows={money.oppose} />
        </div>
      ) : null}

      {measure.sourceUrl ? (
        <p className="text-sm">
          <External href={measure.sourceUrl}>Official source</External>
        </p>
      ) : null}
    </article>
  );
}

function CommitteeList({
  label,
  rows,
}: {
  label: string;
  rows: { name: string; href: string; raised: string | null }[];
}) {
  return (
    <div>
      <p className="text-xs font-body font-semibold uppercase tracking-wider text-ink-muted">
        {label}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm font-body text-ink-muted">No committees found in the guide.</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {rows.map((row) => (
            <li key={row.href + row.name} className="text-sm font-body text-ink">
              <External href={row.href}>{row.name}</External>
              {row.raised ? ` (${row.raised} raised)` : " (no Form 460 filed yet)"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuoteBlock({
  title,
  tone,
  groups,
}: {
  title: string;
  tone: "support" | "oppose";
  groups: QuoteGroup[];
}) {
  const color = tone === "support" ? "var(--stance-support)" : "var(--stance-oppose)";
  return (
    <section className="border bg-surface" style={{ borderColor: color }}>
      <h4 className="px-3 py-1.5 text-sm font-heading font-semibold text-white" style={{ background: color }}>
        {title}
      </h4>
      <div className="p-3 space-y-3">
        {groups.length === 0 ? (
          <p className="text-sm font-body text-ink-muted">None on file.</p>
        ) : (
          groups.map((group) => (
            <div key={group.quote || group.signers.map((s) => s.id).join()}>
              {group.quote ? (
                <blockquote className="text-sm font-body text-ink leading-relaxed border-l-2 pl-3" style={{ borderColor: color }}>
                  {group.quote}
                </blockquote>
              ) : (
                <p className="text-xs font-body text-ink-muted">No quote text stored.</p>
              )}
              <div className="mt-2">
                <PersonList people={group.signers} limit={LIST_PREVIEW} />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function ContestBlock({ contest, marked = false }: { contest: GuideContest; marked?: boolean }) {
  return (
    <section className="space-y-3">
      <header>
        <h3 className="font-heading font-semibold text-ink">{contest.office}</h3>
        {contest.jurisdiction ? (
          <p className="text-sm font-body text-ink-muted">{contest.jurisdiction}</p>
        ) : null}
      </header>
      <div className="space-y-3">
        {contest.candidates.map((candidate) => (
          <article
            key={candidate.candidacyId}
            className={`bg-surface border p-4 space-y-2 ${marked ? "border-amber-300" : "border-line"}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-heading font-bold text-ink">{candidate.name}</h4>
              <p className="text-xs font-body px-2 py-0.5 border border-line text-ink-muted">
                {candidate.ballotLabel}
              </p>
            </div>
            {candidate.party ? (
              <p className="text-sm font-body text-ink">{candidate.party}</p>
            ) : null}
            {candidate.designation ? (
              <p className="text-sm font-body text-ink-muted">
                Ballot designation: {candidate.designation}
              </p>
            ) : null}
            {candidate.statement ? (
              <ExpandableText
                text={candidate.statement}
                preview={candidate.statementPreview || candidate.statement}
                truncated={candidate.statementTruncated}
                moreLabel="Show full statement"
              />
            ) : candidate.statementUnavailable ? (
              <p className="text-sm font-body text-ink-muted">No candidate statement on file.</p>
            ) : null}
            {candidate.notes ? (
              <ExpandableText
                text={candidate.notes}
                preview={candidate.notesPreview || candidate.notes}
                truncated={candidate.notesTruncated}
                moreLabel="Show full notes"
              />
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-xs font-body font-semibold uppercase tracking-wider text-ink-muted mb-1">
                  Endorsements ({candidate.endorsements.length})
                </p>
                <PersonList people={candidate.endorsements} limit={6} />
              </div>
              <div
                className="border border-dashed p-2"
                style={{ borderColor: "var(--stance-oppose)", background: "#fff7f2" }}
              >
                <p
                  className="text-xs font-body font-semibold uppercase tracking-wider mb-1"
                  style={{ color: "var(--stance-oppose)" }}
                >
                  Opposition endorsements ({candidate.opposeEndorsements.length})
                </p>
                <PersonList people={candidate.opposeEndorsements} limit={6} />
              </div>
            </div>
            <p className="text-xs font-body space-x-3">
              {candidate.website ? (
                <External href={candidate.website}>Website</External>
              ) : null}
              {candidate.sourceUrl ? (
                <External href={candidate.sourceUrl}>Source</External>
              ) : null}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Donations({ model }: { model: ElectionModel }) {
  const { donations } = model;
  return (
    <section id="donations" className="space-y-4 scroll-mt-20">
      <h2 className="font-heading text-xl font-bold text-ink border-b border-line pb-1">
        Donations
      </h2>
      <div className="text-sm font-body text-ink space-y-2 bg-surface border border-line p-3">
        <p>
          Itemized NetFile Form 497 lines. A row whose <code>mirror_of</code> is set
          is the other report of a transfer already counted, so it is left out of
          every total and out of the itemized lists.
        </p>
        <p>
          Totals are per measure and per candidacy. They are not added together,
          and they are not added to the Cal-Access committee totals above.
        </p>
        {donations.excludedMirrors.length > 0 ? (
          <p>
            {donations.excludedMirrors.length} mirror{" "}
            {donations.excludedMirrors.length === 1 ? "filing is" : "filings are"}{" "}
            excluded.
          </p>
        ) : null}
        {donations.sharedLineCount > 0 ? (
          <p>
            {donations.sharedLineCount}{" "}
            {donations.sharedLineCount === 1 ? "line is" : "lines are"} tagged to both
            a measure and a candidacy, so {donations.sharedLineCount === 1 ? "it appears" : "they appear"} in
            both sections. Those sections are still not added together.
          </p>
        ) : null}
      </div>

      {donations.measures.length === 0 && donations.candidacies.length === 0 ? (
        <p className="text-sm font-body text-ink-muted">No contribution rows are on file.</p>
      ) : null}

      <div className="space-y-3">
        <h3 className="font-heading font-semibold text-ink">By measure</h3>
        {donations.measures.map((bucket) => (
          <DonationCard key={bucket.key} bucket={bucket} />
        ))}
      </div>

      <div className="space-y-3">
        <h3 className="font-heading font-semibold text-ink">By candidacy</h3>
        {donations.candidacies.length === 0 ? (
          <p className="text-sm font-body text-ink-muted">No candidacy-tagged lines.</p>
        ) : (
          donations.candidacies.map((bucket) => (
            <DonationCard key={bucket.key} bucket={bucket} />
          ))
        )}
      </div>

      {donations.untagged ? (
        <div className="space-y-3">
          <h3 className="font-heading font-semibold text-ink">Untagged filings</h3>
          <p className="text-sm font-body text-ink-muted">
            Not included in Measure W or any other measure total. Moraga parent-group
            receipts sit here because they are not tagged to a November Lafayette
            measure.
          </p>
          <DonationCard bucket={donations.untagged} />
        </div>
      ) : null}

      {donations.excludedMirrors.length > 0 ? (
        <details className="border border-line bg-canvas p-3">
          <summary className="text-sm font-body font-semibold cursor-pointer">
            Excluded mirror filings ({donations.excludedMirrors.length})
          </summary>
          <ul className="mt-3 divide-y divide-line">
            {donations.excludedMirrors.map((line) => (
              <DonationRow key={line.id} line={line} />
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function DonationCard({ bucket }: { bucket: DonationBucket }) {
  return (
    <article
      className="bg-surface border border-line p-4 space-y-3"
      data-donation-subject={bucket.key}
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h4 className="font-heading text-lg font-bold text-ink">{bucket.heading}</h4>
          <p className="text-xs font-body text-ink-muted">{bucket.subheading}</p>
        </div>
        <p
          className="font-heading text-kpi text-ink tabular-nums"
          data-donation-total={bucket.totalCents}
        >
          {bucket.totalLabel}
        </p>
      </header>
      <p className="text-xs font-body text-ink-muted">
        {bucket.lines.length} itemized {bucket.lines.length === 1 ? "donor line" : "donor lines"}
        {bucket.lines.some((line) => line.nameOnly)
          ? ". Name only means the counterparty is not linked to an organization or a person."
          : "."}
      </p>
      <ul className="divide-y divide-line">
        {bucket.lines.map((line) => (
          <DonationRow key={line.id} line={line} />
        ))}
      </ul>
    </article>
  );
}

function DonationRow({ line }: { line: DonationLineView }) {
  return (
    <li className="py-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-body font-semibold text-ink">{line.counterpartyName}</p>
        <p className="text-xs font-body text-ink-muted mt-0.5">
          {line.direction === "made" ? "Made" : "Received"} by {line.filerName}
          {" · "}
          {line.txnDateLabel}
          {line.place ? ` · ${line.place}` : ""}
        </p>
        <p className="text-xs font-body mt-1">
          {line.nameOnly ? (
            <span className="text-ink-muted">Name only</span>
          ) : line.linkedOrgId ? (
            <Link href={`/who?tab=orgs&org=${line.linkedOrgId}`} className="text-accent underline">
              Linked organization
            </Link>
          ) : (
            <span className="text-ink-muted">Linked person</span>
          )}
          {line.committeeId ? <span className="text-ink-muted"> · FPPC {line.committeeId}</span> : null}
          {line.sourceUrl ? (
            <>
              {" · "}
              <a href={line.sourceUrl} className="text-accent underline" target="_blank" rel="noreferrer">
                Filing {line.filingId}
              </a>
            </>
          ) : null}
        </p>
      </div>
      <p className="text-sm font-body font-semibold tabular-nums text-ink whitespace-nowrap">
        {line.amountLabel}
      </p>
    </li>
  );
}
