/**
 * November 3, 2026 voter guide model.
 * Totals never cross measures. Mirror filings stay out of every total.
 * Ballot labels never call anyone elected — results are not certified.
 */

export const ELECTION_DATE = "2026-11-03";
export const STATEMENT_PREVIEW_CHARS = 280;
export const LIST_PREVIEW = 8;

export type DonationDirection = "received" | "made";

export type StanceBucket =
  | "quoted-support"
  | "quoted-oppose"
  | "endorsement"
  | "oppose-endorsement"
  | "neutral"
  | "other";

export interface ElectionMeasureRow {
  id: string;
  title: string;
  short_code: string | null;
  summary: string | null;
  election_date: string | null;
  source_url: string | null;
  status: string;
}

export interface ElectionStanceRow {
  id: string;
  actor_type: "person" | "organization";
  actor_id: string;
  subject_type: string;
  subject_id: string | null;
  polarity: string;
  evidence_quote: string | null;
  source_url: string | null;
  metadata: Record<string, unknown> | null;
}

export interface ElectionCandidacyRow {
  id: string;
  person_id: string;
  election_date: string | null;
  party_or_slate: string | null;
  status: string;
  source_url: string | null;
}

export interface ElectionPersonRow {
  id: string;
  full_name: string;
  website: string | null;
}

export interface ElectionOrgRow {
  id: string;
  name: string;
}

export interface ElectionContributionRow {
  id: string;
  filing_id: string;
  direction: string;
  counterparty_name: string;
  counterparty_org_id: string | null;
  counterparty_person_id: string | null;
  counterparty_city: string | null;
  counterparty_zip: string | null;
  counterparty_committee_id: string | null;
  amount: string | number;
  txn_date: string;
  measure_id: string | null;
  candidacy_id: string | null;
  mirror_of: string | null;
  source_url: string | null;
  filer_org_id: string;
}

export interface ElectionEventRow {
  id: string;
  title: string;
  description: string | null;
  event_type: string;
  starts_at: string;
  location_name: string | null;
  source_url: string | null;
  status: string | null;
}

export interface GuidePerson {
  id: string;
  name: string;
  title: string | null;
  sourceUrl: string | null;
}

export interface QuoteGroup {
  quote: string;
  signers: GuidePerson[];
}

export interface GuideMeasure {
  id: string;
  shortCode: string;
  title: string;
  sourceUrl: string | null;
  jurisdiction: string | null;
  what: string;
  yes: string | null;
  no: string | null;
  notes: string | null;
  detail: string | null;
  vigSupporters: string | null;
  vigOpponents: string | null;
  local: boolean;
  quotedSupport: QuoteGroup[];
  quotedOppose: QuoteGroup[];
  endorsements: GuidePerson[];
  opposeEndorsements: GuidePerson[];
  neutral: GuidePerson[];
}

export interface GuideCandidate {
  candidacyId: string;
  personId: string;
  name: string;
  office: string;
  jurisdiction: string;
  party: string;
  designation: string | null;
  ballotLabel: string;
  statement: string | null;
  statementPreview: string | null;
  statementTruncated: boolean;
  statementUnavailable: boolean;
  notes: string | null;
  notesPreview: string | null;
  notesTruncated: boolean;
  sourceUrl: string | null;
  website: string | null;
  endorsements: GuidePerson[];
  opposeEndorsements: GuidePerson[];
  neutral: GuidePerson[];
  outsideLafayette: boolean;
}

export interface GuideContest {
  key: string;
  office: string;
  jurisdiction: string;
  candidates: GuideCandidate[];
}

export interface GuideEvent {
  id: string;
  title: string;
  when: string;
  description: string;
  sourceUrl: string | null;
  location: string | null;
  past: boolean;
  outsideLafayette: boolean;
  group: "dates" | "watch";
}

export interface DonationLineView {
  id: string;
  filerName: string;
  direction: DonationDirection;
  counterpartyName: string;
  place: string | null;
  committeeId: string | null;
  amountLabel: string;
  amountCents: number;
  txnDate: string;
  txnDateLabel: string;
  nameOnly: boolean;
  linkedOrgId: string | null;
  linkedPersonId: string | null;
  sourceUrl: string | null;
  filingId: string;
}

export interface DonationBucket {
  key: string;
  heading: string;
  subheading: string;
  totalLabel: string;
  totalCents: number;
  lines: DonationLineView[];
}

export interface DonationModel {
  measures: DonationBucket[];
  candidacies: DonationBucket[];
  untagged: DonationBucket | null;
  excludedMirrors: DonationLineView[];
  /** Lines tagged to both a measure and a candidacy. Sections are not added. */
  sharedLineCount: number;
}

export interface ElectionModel {
  events: GuideEvent[];
  localMeasures: GuideMeasure[];
  propositions: GuideMeasure[];
  contests: GuideContest[];
  outside: GuideContest[];
  offBallot: GuideContest[];
  donations: DonationModel;
}

export interface ElectionBuildInput {
  nowIso: string;
  measures: ElectionMeasureRow[];
  stances: ElectionStanceRow[];
  candidacies: ElectionCandidacyRow[];
  people: ElectionPersonRow[];
  organizations: ElectionOrgRow[];
  contributions: ElectionContributionRow[];
  events: ElectionEventRow[];
}

export function toCents(amount: string | number | null | undefined): number {
  if (amount == null) return 0;
  if (typeof amount === "number") {
    if (!Number.isFinite(amount)) return 0;
    return toCents(amount.toFixed(2));
  }
  const raw = amount.trim();
  if (!raw) return 0;
  const neg = raw.startsWith("-");
  const unsigned = neg ? raw.slice(1) : raw;
  if (!/^\d+(\.\d+)?$/.test(unsigned)) return 0;
  const [whole, frac = ""] = unsigned.split(".");
  const cents = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return neg ? -cents : cents;
}

export function formatUsdFromCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${neg ? "-" : ""}$${dollars.toLocaleString("en-US")}.${String(rem).padStart(2, "0")}`;
}

export function previewText(
  text: string,
  max = STATEMENT_PREVIEW_CHARS
): { preview: string; truncated: boolean } {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return { preview: clean, truncated: false };
  const slice = clean.slice(0, max);
  const cut = slice.lastIndexOf(" ");
  const preview = `${(cut > max * 0.6 ? slice.slice(0, cut) : slice).trimEnd()}…`;
  return { preview, truncated: true };
}

export function stanceBucket(input: {
  polarity: string;
  kind: string | null;
  quote: string | null;
}): StanceBucket {
  const quote = (input.quote || "").trim();
  if (input.polarity === "neutral") return "neutral";
  if (input.polarity === "endorse") return "endorsement";
  if (input.polarity === "oppose") {
    if (input.kind === "endorsement" && !quote) return "oppose-endorsement";
    return "quoted-oppose";
  }
  if (input.polarity === "support") return "quoted-support";
  return "other";
}

/** Status text for this page. Never the word "elected". */
export function ballotLabel(input: {
  outsideLafayette: boolean;
  notOnBallot: boolean;
  status: string;
}): string {
  if (input.outsideLafayette) return "On a ballot outside Lafayette";
  if (input.notOnBallot || input.status === "elected") return "Not on this ballot";
  if (input.status === "withdrawn") return "Withdrawn";
  if (input.status === "lost") return "Did not win";
  return "On the ballot";
}

export function isOutsideLafayette(slate: string | null): boolean {
  return /NOT A LAFAYETTE CONTEST/i.test(slate || "");
}

export function isNotOnBallot(slate: string | null, status: string): boolean {
  if (isOutsideLafayette(slate)) return false;
  if (status === "elected" || status === "withdrawn") return true;
  return /NOT ON BALLOT|ABSENT from|not_on_ballot|NOT on \d/i.test(slate || "");
}

export function stripElectedParenthetical(text: string): string {
  return text
    .replace(/\s*\(elected\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+;/g, ";")
    .trim();
}

export function parseMeasureSummary(summary: string | null): {
  jurisdiction: string | null;
  what: string;
  notes: string | null;
  yes: string | null;
  no: string | null;
  vigSupporters: string | null;
  vigOpponents: string | null;
  detail: string | null;
} {
  const empty = {
    jurisdiction: null,
    what: "",
    notes: null,
    yes: null,
    no: null,
    vigSupporters: null,
    vigOpponents: null,
    detail: null,
  };
  if (!summary?.trim()) return empty;
  const parts = summary.split(/\s+\|\s+/);
  const head = parts[0] ?? "";
  let jurisdiction: string | null = null;
  let body = head;
  const jur = /^Jurisdiction:\s*([^.]+)\.\s*/.exec(head);
  if (jur) {
    jurisdiction = jur[1].trim();
    body = head.slice(jur[0].length);
  }
  let what = body.trim();
  let notes: string | null = null;
  const notesIdx = body.search(/\sNotes:\s/);
  if (notesIdx >= 0) {
    what = body.slice(0, notesIdx).trim();
    notes = body.slice(notesIdx).replace(/^\s*Notes:\s*/, "").trim() || null;
  }
  const field = (label: string) => {
    const part = parts.find((item) => item.toLowerCase().startsWith(label.toLowerCase()));
    if (!part) return null;
    const value = part.slice(label.length).trim();
    return value || null;
  };
  const detailPart = parts.find((item) => /detail \(impartial analysis\)/i.test(item));
  const detail = detailPart
    ? detailPart.replace(/^.*?detail \(impartial analysis\):\s*/i, "").trim() || null
    : null;
  return {
    jurisdiction,
    what,
    notes,
    yes: field("YES means:"),
    no: field("NO means:"),
    vigSupporters: field("Supporters listed in VIG:"),
    vigOpponents: field("Opponents listed in VIG:"),
    detail,
  };
}

export function extractStatement(slate: string | null): {
  text: string | null;
  unavailable: boolean;
} {
  const raw = slate || "";
  const marker = raw.toLowerCase().indexOf("candidate statement");
  if (marker < 0) {
    return {
      text: null,
      unavailable: /no candidate statement/i.test(raw),
    };
  }
  const rest = raw.slice(marker);
  if (/candidate statement:\s*NONE/i.test(rest) || /UNAVAILABLE/i.test(rest)) {
    return { text: null, unavailable: true };
  }
  const start = rest.search(/:\s*"/);
  if (start < 0) {
    return { text: null, unavailable: /no candidate statement/i.test(rest) };
  }
  const after = rest.slice(start).replace(/^:\s*"/, "");
  const close = after.search(/"\s*(\||$)/);
  const text = (close < 0 ? after.replace(/"\s*$/, "") : after.slice(0, close)).trim();
  return { text: text || null, unavailable: !text && /no candidate statement/i.test(rest) };
}

export function cleanEventDescription(description: string | null): string {
  if (!description) return "";
  return description
    .replace(/\s*\[confidence=[^\]]+\]\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatDateOnly(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatEventWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
  const clock = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  if (clock === "00:00") return day;
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${day} · ${time} PT`;
}

function metaString(metadata: Record<string, unknown> | null, key: string): string | null {
  if (!metadata) return null;
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function measureRank(shortCode: string): number {
  if (shortCode === "W") return 0;
  if (shortCode === "RTM") return 1;
  const prop = /^Prop\s+(\d+)$/.exec(shortCode);
  if (prop) return 100 + Number(prop[1]);
  return 1000;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name);
}

function groupQuotes(rows: GuidePerson[], quotes: Map<string, string>): QuoteGroup[] {
  const groups = new Map<string, QuoteGroup>();
  for (const person of rows) {
    const quote = quotes.get(person.id) || "";
    const key = quote.replace(/\s+/g, " ").trim();
    const group = groups.get(key) ?? { quote: key, signers: [] };
    group.signers.push(person);
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .map((group) => ({ ...group, signers: group.signers.sort(byName) }))
    .sort((a, b) => b.signers.length - a.signers.length || a.quote.localeCompare(b.quote));
}

function contestRank(office: string, jurisdiction: string): number {
  const o = office.toLowerCase();
  const j = jurisdiction.toLowerCase();
  if (o === "governor") return 10;
  if (o.startsWith("lieutenant")) return 20;
  if (o.startsWith("secretary")) return 30;
  if (o === "controller") return 40;
  if (o === "treasurer") return 50;
  if (o.startsWith("attorney")) return 60;
  if (o.startsWith("insurance")) return 70;
  if (o.startsWith("superintendent")) return 80;
  if (o.includes("equalization")) return 90;
  if (o.includes("representative")) return 100;
  if (o.includes("assembly")) return 110;
  if (j.includes("county board of education")) return 120;
  if (j.includes("sanitary") || o.includes("division 2")) return 130;
  if (/retention|justice/i.test(o)) return 140;
  if (j.includes("lafayette school")) return 200;
  if (j.includes("acalanes")) return 210;
  if (j.includes("ebmud") || j.includes("municipal utility")) return 220;
  if (o.includes("city council")) return 230;
  return 400;
}

function lineView(
  row: ElectionContributionRow,
  orgs: Map<string, string>
): DonationLineView {
  const city = row.counterparty_city?.trim() || "";
  const zip = row.counterparty_zip?.trim() || "";
  const place = [city, zip].filter(Boolean).join(" ") || null;
  const cents = toCents(row.amount);
  const direction: DonationDirection = row.direction === "made" ? "made" : "received";
  return {
    id: row.id,
    filerName: orgs.get(row.filer_org_id) || "Committee",
    direction,
    counterpartyName: row.counterparty_name,
    place,
    committeeId: row.counterparty_committee_id,
    amountLabel: formatUsdFromCents(cents),
    amountCents: cents,
    txnDate: row.txn_date,
    txnDateLabel: formatDateOnly(row.txn_date),
    nameOnly: !row.counterparty_org_id && !row.counterparty_person_id,
    linkedOrgId: row.counterparty_org_id,
    linkedPersonId: row.counterparty_person_id,
    sourceUrl: row.source_url,
    filingId: row.filing_id,
  };
}

function sortLines(lines: DonationLineView[]): DonationLineView[] {
  return [...lines].sort((a, b) => {
    if (b.amountCents !== a.amountCents) return b.amountCents - a.amountCents;
    if (a.txnDate !== b.txnDate) return b.txnDate.localeCompare(a.txnDate);
    return a.counterpartyName.localeCompare(b.counterpartyName);
  });
}

function bucketFrom(
  key: string,
  heading: string,
  subheading: string,
  lines: DonationLineView[]
): DonationBucket {
  const totalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  return {
    key,
    heading,
    subheading,
    totalLabel: formatUsdFromCents(totalCents),
    totalCents,
    lines: sortLines(lines),
  };
}

export function buildElectionModel(input: ElectionBuildInput): ElectionModel {
  const people = new Map(input.people.map((row) => [row.id, row]));
  const orgs = new Map(input.organizations.map((row) => [row.id, row.name]));
  const now = new Date(input.nowIso).getTime();

  const measures = input.measures
    .filter((row) => row.election_date === ELECTION_DATE && row.status === "on_ballot")
    .sort((a, b) => measureRank(a.short_code || "") - measureRank(b.short_code || "") || a.title.localeCompare(b.title));

  const measureIds = new Set(measures.map((row) => row.id));
  const candidacyRows = input.candidacies.filter((row) => row.election_date === ELECTION_DATE);
  const candidacyIds = new Set(candidacyRows.map((row) => row.id));

  function personFromStance(row: ElectionStanceRow): GuidePerson {
    const name =
      row.actor_type === "organization"
        ? orgs.get(row.actor_id) || "Unknown organization"
        : people.get(row.actor_id)?.full_name || "Unknown person";
    return {
      id: row.id,
      name,
      title: metaString(row.metadata, "endorser_title"),
      sourceUrl: row.source_url,
    };
  }

  function stancesFor(subjectType: string, subjectId: string): ElectionStanceRow[] {
    return input.stances.filter(
      (row) => row.subject_type === subjectType && row.subject_id === subjectId
    );
  }

  function splitStances(rows: ElectionStanceRow[]): {
    quotedSupport: QuoteGroup[];
    quotedOppose: QuoteGroup[];
    endorsements: GuidePerson[];
    opposeEndorsements: GuidePerson[];
    neutral: GuidePerson[];
  } {
    const support: GuidePerson[] = [];
    const supportQuotes = new Map<string, string>();
    const oppose: GuidePerson[] = [];
    const opposeQuotes = new Map<string, string>();
    const endorsements: GuidePerson[] = [];
    const opposeEndorsements: GuidePerson[] = [];
    const neutral: GuidePerson[] = [];
    for (const row of rows) {
      const person = personFromStance(row);
      const bucket = stanceBucket({
        polarity: row.polarity,
        kind: metaString(row.metadata, "kind"),
        quote: row.evidence_quote,
      });
      if (bucket === "quoted-support") {
        support.push(person);
        supportQuotes.set(person.id, (row.evidence_quote || "").trim());
      } else if (bucket === "quoted-oppose") {
        oppose.push(person);
        opposeQuotes.set(person.id, (row.evidence_quote || "").trim());
      } else if (bucket === "endorsement") {
        endorsements.push(person);
      } else if (bucket === "oppose-endorsement") {
        opposeEndorsements.push(person);
      } else if (bucket === "neutral") {
        neutral.push(person);
      }
    }
    return {
      quotedSupport: groupQuotes(support, supportQuotes),
      quotedOppose: groupQuotes(oppose, opposeQuotes),
      endorsements: endorsements.sort(byName),
      opposeEndorsements: opposeEndorsements.sort(byName),
      neutral: neutral.sort(byName),
    };
  }

  const guideMeasures: GuideMeasure[] = measures.map((measure) => {
    const parsed = parseMeasureSummary(measure.summary);
    const shortCode = measure.short_code || measure.title;
    return {
      id: measure.id,
      shortCode,
      title: measure.title,
      sourceUrl: measure.source_url,
      jurisdiction: parsed.jurisdiction,
      what: parsed.what,
      yes: parsed.yes,
      no: parsed.no,
      notes: parsed.notes,
      detail: parsed.detail,
      vigSupporters: parsed.vigSupporters,
      vigOpponents: parsed.vigOpponents,
      local: shortCode === "W" || shortCode === "RTM",
      ...splitStances(stancesFor("measure", measure.id)),
    };
  });

  const candidates: GuideCandidate[] = candidacyRows.map((row) => {
    const person = people.get(row.person_id);
    const slate = row.party_or_slate || "";
    const parts = slate.split(/\s+\|\s+/);
    const office = (parts[0] || "Contest").trim();
    const jurisdiction = (parts[1] || "").trim();
    const party = stripElectedParenthetical(parts[2] || "");
    const outsideLafayette = isOutsideLafayette(slate);
    const notOnBallot = isNotOnBallot(slate, row.status);
    const statement = extractStatement(slate);
    const statementPreview = statement.text ? previewText(statement.text) : null;
    const extra = parts
      .slice(3)
      .filter((part) => !/candidate statement/i.test(part))
      .map((part) => stripElectedParenthetical(part))
      .filter(Boolean);
    const notes = extra.join(" · ") || null;
    const notesPreview = notes ? previewText(notes) : null;
    const designation = /Ballot designation:\s*([^.]*)/i.exec(slate)?.[1]?.trim() || null;
    const websiteFromSlate = /website:\s*([^;)]+)/i.exec(slate)?.[1]?.trim() || null;
    const split = splitStances(stancesFor("candidacy", row.id));
    return {
      candidacyId: row.id,
      personId: row.person_id,
      name: person?.full_name || "Candidate",
      office,
      jurisdiction,
      party,
      designation,
      ballotLabel: ballotLabel({ outsideLafayette, notOnBallot, status: row.status }),
      statement: statement.text,
      statementPreview: statementPreview?.preview ?? null,
      statementTruncated: statementPreview?.truncated ?? false,
      statementUnavailable: statement.unavailable,
      notes,
      notesPreview: notesPreview?.preview ?? null,
      notesTruncated: notesPreview?.truncated ?? false,
      sourceUrl: row.source_url,
      website: person?.website || websiteFromSlate,
      endorsements: split.endorsements,
      opposeEndorsements: split.opposeEndorsements,
      neutral: split.neutral,
      outsideLafayette,
    };
  });

  function groupContests(rows: GuideCandidate[], judicialTogether: boolean): GuideContest[] {
    const groups = new Map<string, GuideContest>();
    for (const candidate of rows) {
      const judicial = judicialTogether && /retention/i.test(`${candidate.office} ${candidate.party}`);
      const key = judicial ? "judicial-retention" : `${candidate.office}||${candidate.jurisdiction}`;
      const existing = groups.get(key);
      if (existing) {
        existing.candidates.push(candidate);
        continue;
      }
      groups.set(key, {
        key,
        office: judicial ? "Judicial retention" : candidate.office,
        jurisdiction: judicial
          ? "Yes or no on each justice. This is not a winner-take-all race."
          : candidate.jurisdiction,
        candidates: [candidate],
      });
    }
    return Array.from(groups.values())
      .map((contest) => ({
        ...contest,
        candidates: [...contest.candidates].sort(byName),
      }))
      .sort(
        (a, b) =>
          contestRank(a.office, a.jurisdiction) - contestRank(b.office, b.jurisdiction) ||
          a.office.localeCompare(b.office)
      );
  }

  const onBallot = candidates.filter(
    (row) => row.ballotLabel === "On the ballot" && !row.outsideLafayette
  );
  const outside = candidates.filter((row) => row.outsideLafayette);
  const offBallot = candidates.filter(
    (row) => !row.outsideLafayette && row.ballotLabel !== "On the ballot"
  );

  const eventsChrono = [...input.events]
    .filter((row) => row.status !== "cancelled")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const eventViews = eventsChrono.map((row) => {
    const description = cleanEventDescription(row.description);
    const blob = `${row.title} ${description}`;
    const starts = new Date(row.starts_at).getTime();
    return {
      id: row.id,
      title: row.title,
      when: formatEventWhen(row.starts_at),
      description,
      sourceUrl: row.source_url,
      location: row.location_name,
      past: Number.isFinite(starts) && starts < now,
      outsideLafayette: /Area 1|Schweppe|Iyengar/i.test(blob),
      group: (row.event_type === "deadline" || row.event_type === "election"
        ? "dates"
        : "watch") as GuideEvent["group"],
    };
  });

  const counted = input.contributions.filter((row) => !row.mirror_of);
  const mirrors = input.contributions.filter((row) => Boolean(row.mirror_of));
  const measureBuckets = new Map<string, DonationLineView[]>();
  const candidacyBuckets = new Map<string, DonationLineView[]>();
  const untagged: DonationLineView[] = [];
  let sharedLineCount = 0;
  for (const row of counted) {
    const view = lineView(row, orgs);
    const onMeasure = Boolean(row.measure_id && measureIds.has(row.measure_id));
    const onCandidacy = Boolean(row.candidacy_id && candidacyIds.has(row.candidacy_id));
    if (onMeasure && onCandidacy) sharedLineCount += 1;
    if (onMeasure && row.measure_id) {
      const list = measureBuckets.get(row.measure_id) ?? [];
      list.push(view);
      measureBuckets.set(row.measure_id, list);
    }
    if (onCandidacy && row.candidacy_id) {
      const list = candidacyBuckets.get(row.candidacy_id) ?? [];
      list.push(view);
      candidacyBuckets.set(row.candidacy_id, list);
    }
    if (!onMeasure && !onCandidacy) untagged.push(view);
  }

  const donationMeasures = measures
    .filter((measure) => measureBuckets.has(measure.id))
    .map((measure) =>
      bucketFrom(
        `measure:${measure.short_code || measure.id}`,
        measure.short_code ? `Measure ${measure.short_code}` : measure.title,
        measure.title,
        measureBuckets.get(measure.id) ?? []
      )
    );

  const candidateById = new Map(candidates.map((row) => [row.candidacyId, row]));
  const donationCandidacies = Array.from(candidacyBuckets.entries())
    .map(([id, lines]) => {
      const candidate = candidateById.get(id);
      return bucketFrom(
        `candidacy:${candidate?.name || id}`,
        candidate?.name || "Candidate",
        candidate ? `${candidate.office} · ${candidate.jurisdiction}` : "Candidacy",
        lines
      );
    })
    .sort((a, b) => b.totalCents - a.totalCents || a.heading.localeCompare(b.heading));

  return {
    events: eventViews,
    localMeasures: guideMeasures.filter((row) => row.local),
    propositions: guideMeasures.filter((row) => !row.local),
    contests: groupContests(onBallot, true),
    outside: groupContests(outside, false),
    offBallot: groupContests(offBallot, false),
    donations: {
      measures: donationMeasures,
      candidacies: donationCandidacies,
      untagged: untagged.length
        ? bucketFrom(
            "untagged",
            "Not tagged to a measure or candidacy",
            "These filings are not added to any measure or candidate total.",
            untagged
          )
        : null,
      excludedMirrors: sortLines(mirrors.map((row) => lineView(row, orgs))),
      sharedLineCount,
    },
  };
}
