/** Mirrors `formatTenureRange` so node tests can import this file without path aliases. */
function formatTenureRange(
  startDate?: string | null,
  endDate?: string | null
): string {
  const from = startDate ? startDate.slice(0, 10) : null;
  const to = endDate ? endDate.slice(0, 10) : null;
  if (!from && !to) return "Current";
  if (!from) return `until ${to}`;
  if (!to) return `${from} – present`;
  return `${from} – ${to}`;
}

export type WhyLinkedKind =
  | "membership"
  | "seat"
  | "org_affinity"
  | "shared_boards"
  | "stance";

export type WhyLinkedEntityKind = "person" | "organization" | "seat";

export interface WhyLinkedEntity {
  id: string;
  label: string;
  kind: WhyLinkedEntityKind;
}

export interface WhyLinkedEdge {
  source: string;
  target: string;
  kind?: string;
  role?: string | null;
  is_primary?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  source_url?: string | null;
  organization_id?: string | null;
  org_name?: string | null;
  shared?: number;
  jaccard?: number;
  shared_names?: string[];
  shared_entities?: WhyLinkedEntity[];
  shared_subjects?: string[];
  polarity?: string;
  stance_kind?: string;
  co_stance?: number;
  opposed?: number;
  evidence_quote?: string | null;
  measure_title?: string | null;
}

export interface WhyLinkedModel {
  kind: WhyLinkedKind;
  title: string;
  endpoints: [WhyLinkedEntity, WhyLinkedEntity];
  role?: string | null;
  relation?: string;
  dates?: string;
  source_url?: string | null;
  shared?: number;
  jaccard?: number;
  shared_label?: string;
  shared_items?: WhyLinkedEntity[];
  polarity_label?: string;
  measure?: string | null;
  quote?: string | null;
  subjects?: string[];
  co_stance?: number;
  opposed?: number;
}

function endpoint(
  id: string,
  nodes: Iterable<{ id: string; label: string; kind?: string }>,
  fallbackKind: WhyLinkedEntityKind = "organization"
): WhyLinkedEntity {
  for (const node of nodes) {
    if (node.id !== id) continue;
    const kind =
      node.kind === "person" || node.kind === "organization" || node.kind === "seat"
        ? node.kind
        : fallbackKind;
    return { id, label: node.label, kind };
  }
  return { id, label: "Unknown", kind: fallbackKind };
}

export function isStanceEdge(edge: WhyLinkedEdge): boolean {
  return Boolean(
    edge.stance_kind ||
      edge.polarity ||
      edge.kind === "stance" ||
      edge.co_stance != null ||
      edge.opposed != null
  );
}

export function isSharedBoardsEdge(edge: WhyLinkedEdge): boolean {
  return edge.kind === "shared_board" || edge.kind === "shared_boards";
}

export function isOrgAffinityEdge(edge: WhyLinkedEdge): boolean {
  if (isStanceEdge(edge) || isSharedBoardsEdge(edge)) return false;
  return edge.jaccard != null || (edge.shared != null && edge.kind !== "seat_holder");
}

export function stanceHoverLabel(edge: WhyLinkedEdge): string {
  if (edge.stance_kind === "co-stance") return "Co-stance";
  if (edge.stance_kind === "opposed-on-issues") return "Oppose";
  if (edge.polarity === "support") return "Support";
  if (edge.polarity === "oppose") return "Oppose";
  if (edge.polarity === "endorse") return "Endorse";
  if (edge.co_stance != null && (edge.opposed ?? 0) <= edge.co_stance) {
    return "Co-stance";
  }
  if ((edge.opposed ?? 0) > 0) return "Oppose";
  return "Co-stance";
}

/** Hover copy — at most two lines. Never “allies”. */
export function whyLinkedTooltipLines(edge: WhyLinkedEdge): string[] {
  if (isStanceEdge(edge)) {
    return [stanceHoverLabel(edge)];
  }
  if (isSharedBoardsEdge(edge)) {
    const n = edge.shared ?? edge.shared_names?.length ?? 0;
    return [`${n} shared board${n === 1 ? "" : "s"}`];
  }
  if (edge.jaccard != null || (edge.shared != null && edge.kind !== "seat_holder")) {
    const n = edge.shared ?? edge.shared_names?.length ?? 0;
    const members = `${n} shared member${n === 1 ? "" : "s"}`;
    if (edge.jaccard != null) {
      return [`${members} · Jaccard ${edge.jaccard.toFixed(2)}`];
    }
    return [members];
  }
  const role =
    edge.role || (edge.kind === "seat_holder" ? "Seat" : "Member");
  const dates = formatTenureRange(edge.start_date, edge.end_date);
  return [`${role} · ${dates}`];
}

export function buildWhyLinkedModel(
  edge: WhyLinkedEdge,
  nodes: Iterable<{ id: string; label: string; kind?: string }>
): WhyLinkedModel {
  const source = endpoint(edge.source, nodes, "person");
  const target = endpoint(edge.target, nodes, "organization");
  const sharedItems =
    edge.shared_entities && edge.shared_entities.length > 0
      ? edge.shared_entities
      : (edge.shared_names ?? []).map((label, index) => ({
          id: `${edge.source}:${edge.target}:name:${index}`,
          label,
          kind: "person" as const,
        }));

  if (isStanceEdge(edge)) {
    const polarity = stanceHoverLabel(edge);
    return {
      kind: "stance",
      title: polarity,
      endpoints: [source, target],
      polarity_label: polarity,
      measure: edge.measure_title ?? null,
      quote: edge.evidence_quote ?? null,
      source_url: edge.source_url ?? null,
      subjects: edge.shared_subjects ?? [],
      co_stance: edge.co_stance,
      opposed: edge.opposed,
      shared: edge.shared,
    };
  }

  if (isSharedBoardsEdge(edge)) {
    const n = edge.shared ?? sharedItems.length;
    return {
      kind: "shared_boards",
      title: "Shared boards",
      endpoints: [source, target],
      shared: n,
      shared_label: n === 1 ? "shared board" : "shared boards",
      shared_items: sharedItems.map((item) => ({
        ...item,
        kind: item.kind === "seat" ? "organization" : item.kind,
      })),
    };
  }

  if (edge.jaccard != null || (edge.shared != null && edge.kind !== "seat_holder")) {
    const n = edge.shared ?? sharedItems.length;
    return {
      kind: "org_affinity",
      title: "Shared membership",
      endpoints: [source, target],
      shared: n,
      jaccard: edge.jaccard,
      shared_label: n === 1 ? "shared member" : "shared members",
      shared_items: sharedItems,
    };
  }

  const seat = edge.kind === "seat_holder";
  return {
    kind: seat ? "seat" : "membership",
    title: seat ? "Formal seat" : "Membership",
    endpoints: [source, target],
    role: edge.role || (seat ? "Seat" : "Member"),
    relation: seat ? "Formal seat" : "Membership",
    dates: formatTenureRange(edge.start_date, edge.end_date),
    source_url: edge.source_url ?? null,
  };
}

export function sameWhyLinkedEdge(
  a: WhyLinkedEdge | null | undefined,
  b: WhyLinkedEdge | null | undefined
): boolean {
  if (!a || !b) return false;
  const pair = (source: string, target: string) =>
    source < target ? `${source}|${target}` : `${target}|${source}`;
  return (
    pair(a.source, a.target) === pair(b.source, b.target) &&
    (a.kind ?? "") === (b.kind ?? "") &&
    (a.stance_kind ?? "") === (b.stance_kind ?? "")
  );
}

export function toggleWhyLinkedEdge<T extends WhyLinkedEdge>(
  current: T | null,
  next: T
): T | null {
  return sameWhyLinkedEdge(current, next) ? null : next;
}

export function selectableWhyLinkedKind(
  kind: WhyLinkedEntityKind
): kind is "person" | "organization" {
  return kind === "person" || kind === "organization";
}
