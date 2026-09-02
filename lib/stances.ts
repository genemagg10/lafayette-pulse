export type MeasureStatus =
  | "proposed"
  | "qualified"
  | "on_ballot"
  | "passed"
  | "failed"
  | "withdrawn";

function scaleSize(value: number, min: number, max: number, lo = 6, hi = 18): number {
  if (max <= min) return (lo + hi) / 2;
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return lo + t * (hi - lo);
}

/** Paul Tol / Wong — colorblind-safe. Do not use red/green alone. */
export const STANCE_TEAL = "#009E73";
export const STANCE_VERMILLION = "#D55E00";
export const STANCE_GOLD = "#E69F00";
export const STANCE_INSUFFICIENT = "#9A9A9A";
export const STANCE_MEASURE_COLOR = "#2C3E2D";

export type StancePolarity =
  | "support"
  | "oppose"
  | "endorse"
  | "neutral"
  | "mixed";

export type StanceActorType = "person" | "organization";
export type StanceSubjectType = "measure" | "candidacy" | "project" | "policy";

export type CoStanceKind = "co-stance" | "opposed-on-issues" | "insufficient";
export type PolaritySide = "support" | "oppose";
export type RibbonColumn = "support" | "oppose" | "endorse" | "measure";

export const STANCE_POLARITY_LABELS: Record<StancePolarity, string> = {
  support: "Support",
  oppose: "Oppose",
  endorse: "Endorse",
  neutral: "Neutral",
  mixed: "Mixed",
};

export const MEASURE_STATUS_LABELS: Record<MeasureStatus, string> = {
  proposed: "Proposed",
  qualified: "Qualified",
  on_ballot: "On the ballot",
  passed: "Passed",
  failed: "Failed",
  withdrawn: "Withdrawn",
};

export const CO_STANCE_LABEL = "Co-stance";
export const OPPOSED_ON_ISSUES_LABEL = "Opposed on issues";

export interface StanceRecord {
  id: string;
  actor_type: StanceActorType;
  actor_id: string;
  subject_type: StanceSubjectType;
  subject_id: string | null;
  subject_label: string | null;
  polarity: StancePolarity;
  confidence: number;
  evidence_quote: string | null;
  source_url: string | null;
  as_of: string | null;
}

export interface LabeledStance extends StanceRecord {
  actor_label: string;
  subject_title: string;
}

export interface StanceCounts {
  support: number;
  oppose: number;
  endorse: number;
  total: number;
}

export interface MeasureListItem {
  id: string;
  title: string;
  short_code: string | null;
  summary: string | null;
  status: MeasureStatus;
  election_date: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  support_count: number;
  oppose_count: number;
  endorse_count: number;
  stance_count: number;
}

export interface CoStanceActor {
  id: string;
  label: string;
  kind: StanceActorType;
  size: number;
  stance_count: number;
}

export interface CoStanceCell {
  source: string;
  target: string;
  shared: number;
  co_stance: number;
  opposed: number;
  kind: CoStanceKind;
  label: typeof CO_STANCE_LABEL | typeof OPPOSED_ON_ISSUES_LABEL | "Insufficient overlap";
  shared_subjects: string[];
}

export interface CoStanceResponse {
  label: typeof CO_STANCE_LABEL;
  opposed_label: typeof OPPOSED_ON_ISSUES_LABEL;
  actor: StanceActorType;
  min_shared: number;
  nodes: CoStanceActor[];
  cells: CoStanceCell[];
}

export interface RibbonNode {
  id: string;
  kind: "person" | "organization";
  label: string;
  size: number;
  color: string;
  column: RibbonColumn;
  polarity?: StancePolarity;
}

export interface RibbonEdge {
  source: string;
  target: string;
  kind: "stance";
  polarity: StancePolarity;
  color: string;
  dashed: boolean;
  stance_kind: "support" | "oppose" | "endorse";
}

export interface ConflictRibbon {
  measureId: string;
  nodes: RibbonNode[];
  edges: RibbonEdge[];
}

export function subjectKey(row: {
  subject_type: StanceSubjectType;
  subject_id: string | null;
  subject_label: string | null;
}): string {
  const id =
    row.subject_id ||
    `label:${(row.subject_label || "").trim().toLowerCase()}`;
  return `${row.subject_type}:${id}`;
}

/** Support-like vs oppose-like. Neutral/mixed are not issue positions. */
export function polaritySide(polarity: StancePolarity): PolaritySide | null {
  if (polarity === "support" || polarity === "endorse") return "support";
  if (polarity === "oppose") return "oppose";
  return null;
}

export function polarityColor(polarity: StancePolarity): string {
  if (polarity === "oppose") return STANCE_VERMILLION;
  if (polarity === "endorse") return STANCE_GOLD;
  if (polarity === "support") return STANCE_TEAL;
  return STANCE_INSUFFICIENT;
}

export function polarityDashed(polarity: StancePolarity): boolean {
  return polarity === "oppose";
}

export function countPolarities(rows: { polarity: StancePolarity }[]): StanceCounts {
  const counts: StanceCounts = { support: 0, oppose: 0, endorse: 0, total: 0 };
  for (const row of rows) {
    counts.total += 1;
    if (row.polarity === "support") counts.support += 1;
    else if (row.polarity === "oppose") counts.oppose += 1;
    else if (row.polarity === "endorse") counts.endorse += 1;
  }
  return counts;
}

/** Size encodes confidence, with a small boost when a quote is present. */
export function stanceNodeSize(
  confidence: number,
  evidenceQuote?: string | null
): number {
  const quote = (evidenceQuote || "").trim();
  const evidenceBoost = quote.length >= 40 ? 0.15 : quote.length > 0 ? 0.06 : 0;
  const value = Math.max(0, Math.min(1, confidence)) + evidenceBoost;
  return scaleSize(value, 0, 1.15, 7, 18);
}

function pickActorPolarity(
  rows: StanceRecord[]
): { polarity: StancePolarity; confidence: number } | null {
  let best: StanceRecord | null = null;
  for (const row of rows) {
    if (!polaritySide(row.polarity)) continue;
    if (!best || row.confidence > best.confidence) best = row;
  }
  return best
    ? { polarity: best.polarity, confidence: best.confidence }
    : null;
}

export function buildCoStanceMatrix(
  stances: LabeledStance[],
  options: {
    actor: StanceActorType;
    minShared?: number;
    limitActors?: number;
  }
): CoStanceResponse {
  const minShared = options.minShared ?? 2;
  const limitActors = options.limitActors ?? 40;
  const ofType = stances.filter((row) => row.actor_type === options.actor);

  const byActor = new Map<string, LabeledStance[]>();
  const labels = new Map<string, string>();
  for (const row of ofType) {
    const list = byActor.get(row.actor_id) ?? [];
    list.push(row);
    byActor.set(row.actor_id, list);
    if (!labels.has(row.actor_id)) labels.set(row.actor_id, row.actor_label);
  }

  const ranked = Array.from(byActor.entries())
    .map(([id, rows]) => ({ id, rows, count: rows.length }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (labels.get(a.id) || "").localeCompare(labels.get(b.id) || "");
    })
    .slice(0, limitActors);

  const actorIds = ranked.map((row) => row.id);
  const actorSet = new Set(actorIds);

  const position = new Map<string, Map<string, PolaritySide>>();
  const subjectTitles = new Map<string, string>();
  for (const { id, rows } of ranked) {
    const grouped = new Map<string, StanceRecord[]>();
    for (const row of rows) {
      const key = subjectKey(row);
      const list = grouped.get(key) ?? [];
      list.push(row);
      grouped.set(key, list);
      if (!subjectTitles.has(key)) subjectTitles.set(key, row.subject_title);
    }
    const sides = new Map<string, PolaritySide>();
    grouped.forEach((list, key) => {
      const picked = pickActorPolarity(list);
      const side = picked ? polaritySide(picked.polarity) : null;
      if (side) sides.set(key, side);
    });
    position.set(id, sides);
  }

  const cells: CoStanceCell[] = [];
  for (let i = 0; i < actorIds.length; i += 1) {
    for (let j = i + 1; j < actorIds.length; j += 1) {
      const a = actorIds[i];
      const b = actorIds[j];
      const aSides = position.get(a) ?? new Map();
      const bSides = position.get(b) ?? new Map();
      let co = 0;
      let opposed = 0;
      const sharedNames: string[] = [];
      aSides.forEach((sideA, key) => {
        const sideB = bSides.get(key);
        if (!sideB) return;
        sharedNames.push(subjectTitles.get(key) || key);
        if (sideA === sideB) co += 1;
        else opposed += 1;
      });
      const shared = co + opposed;
      if (shared === 0) continue;
      const insufficient = shared < minShared;
      const opposedDominant = opposed > co;
      const kind: CoStanceKind = insufficient
        ? "insufficient"
        : opposedDominant
          ? "opposed-on-issues"
          : "co-stance";
      const label = insufficient
        ? "Insufficient overlap"
        : opposedDominant
          ? OPPOSED_ON_ISSUES_LABEL
          : CO_STANCE_LABEL;
      cells.push({
        source: a,
        target: b,
        shared,
        co_stance: co,
        opposed,
        kind,
        label,
        shared_subjects: sharedNames.sort((x, y) => x.localeCompare(y)),
      });
    }
  }

  const connected = new Set<string>();
  for (const cell of cells) {
    if (!actorSet.has(cell.source) || !actorSet.has(cell.target)) continue;
    connected.add(cell.source);
    connected.add(cell.target);
  }

  const counts = ranked.map((row) => row.count);
  const minCount = counts.length ? Math.min(...counts) : 0;
  const maxCount = counts.length ? Math.max(...counts) : 1;

  const nodes: CoStanceActor[] = ranked
    .filter((row) => connected.has(row.id) || ranked.length <= 1)
    .map((row) => ({
      id: row.id,
      label: labels.get(row.id) || row.id,
      kind: options.actor,
      stance_count: row.count,
      size: scaleSize(row.count, minCount, maxCount, 8, 16),
    }));

  return {
    label: CO_STANCE_LABEL,
    opposed_label: OPPOSED_ON_ISSUES_LABEL,
    actor: options.actor,
    min_shared: minShared,
    nodes,
    cells,
  };
}

export function buildConflictRibbon(
  measure: { id: string; title: string; short_code?: string | null },
  stances: LabeledStance[]
): ConflictRibbon {
  const measureId = `measure:${measure.id}`;
  const measureLabel = measure.short_code
    ? `${measure.short_code} · ${measure.title}`
    : measure.title;
  const nodes: RibbonNode[] = [
    {
      id: measureId,
      kind: "organization",
      label: measureLabel,
      size: 16,
      color: STANCE_MEASURE_COLOR,
      column: "measure",
    },
  ];
  const edges: RibbonEdge[] = [];
  const seen = new Set<string>();

  for (const row of stances) {
    if (row.polarity !== "support" && row.polarity !== "oppose" && row.polarity !== "endorse") {
      continue;
    }
    const nodeId = `${row.actor_type}:${row.actor_id}`;
    if (!seen.has(nodeId)) {
      seen.add(nodeId);
      nodes.push({
        id: nodeId,
        kind: row.actor_type === "organization" ? "organization" : "person",
        label: row.actor_label,
        size: stanceNodeSize(row.confidence, row.evidence_quote),
        color: polarityColor(row.polarity),
        column: row.polarity,
        polarity: row.polarity,
      });
    }
    edges.push({
      source: nodeId,
      target: measureId,
      kind: "stance",
      polarity: row.polarity,
      color: polarityColor(row.polarity),
      dashed: polarityDashed(row.polarity),
      stance_kind: row.polarity,
    });
  }

  return { measureId, nodes, edges };
}
