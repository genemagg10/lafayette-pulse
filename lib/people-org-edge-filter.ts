import {
  MIXED_BOARDS_LABEL,
  buildClusterCauses,
  clusterCauseOnStop,
  type ClusterEdge,
  type ClusterOrg,
} from "./cluster-cause.ts";
import type { GraphRangeStop } from "./graph-range.ts";

/** Same gate as the Wider/All cluster pills. Not Most involved. */
export function peopleOrgEdgeFilterOnStop(stop: GraphRangeStop): boolean {
  return clusterCauseOnStop(stop);
}

export type OrgEdgeFilterChip =
  | { kind: "org"; id: string; label: string }
  | {
      kind: "mixed";
      id: "mixed";
      label: typeof MIXED_BOARDS_LABEL;
      orgs: ClusterOrg[];
    };

function orgsOnEdge(
  edge: Pick<ClusterEdge, "shared_entities" | "shared_names">
): Array<{ id: string; label: string }> {
  if (edge.shared_entities && edge.shared_entities.length > 0) {
    return edge.shared_entities
      .filter(
        (entity) => entity.kind === "organization" || entity.kind == null
      )
      .map((entity) => ({ id: entity.id, label: entity.label }));
  }
  return (edge.shared_names ?? []).map((label, index) => ({
    id: `name:${label}:${index}`,
    label,
  }));
}

export function isSelectableOrgId(id: string): boolean {
  return Boolean(id) && !id.startsWith("name:");
}

export type OrgFilterEdge = Pick<ClusterEdge, "shared_entities" | "shared_names">;

export function edgeSharesOrg(
  edge: OrgFilterEdge,
  orgId: string | null | undefined
): boolean {
  if (!orgId) return false;
  return orgsOnEdge(edge).some((org) => org.id === orgId);
}

/** Hide the line. Do not drop the people. */
export function edgeHiddenByOrgFilter(
  edge: OrgFilterEdge,
  orgId: string | null | undefined
): boolean {
  if (!orgId) return false;
  return !edgeSharesOrg(edge, orgId);
}

export function chipContainsOrg(
  chips: readonly OrgEdgeFilterChip[],
  orgId: string | null | undefined
): boolean {
  if (!orgId) return false;
  return chips.some((chip) =>
    chip.kind === "org"
      ? chip.id === orgId
      : chip.orgs.some((org) => org.id === orgId)
  );
}

/**
 * Quiet chips for the orgs already on this Wider/All drawing.
 * Named cluster orgs first. Smaller groups stay under Mixed boards.
 * Does not change cluster min-size or the cause rule.
 */
export function orgEdgeFilterChips(
  nodeIds: readonly string[],
  edges: readonly ClusterEdge[]
): OrgEdgeFilterChip[] {
  const causes = buildClusterCauses(nodeIds, edges);
  const named: OrgEdgeFilterChip[] = [];
  const seenNamed = new Set<string>();
  const mixedOrgs = new Map<string, ClusterOrg>();

  for (const cause of causes) {
    if (cause.kind !== "org" || !cause.orgId) continue;
    if (!isSelectableOrgId(cause.orgId) || seenNamed.has(cause.orgId)) continue;
    seenNamed.add(cause.orgId);
    named.push({ kind: "org", id: cause.orgId, label: cause.label });
  }

  for (const cause of causes) {
    if (cause.kind !== "mixed") continue;
    for (const org of cause.topOrgs) {
      if (!isSelectableOrgId(org.id) || seenNamed.has(org.id)) continue;
      if (!mixedOrgs.has(org.id)) mixedOrgs.set(org.id, org);
    }
  }

  const chips: OrgEdgeFilterChip[] = named.slice();
  if (mixedOrgs.size > 0) {
    const orgs = Array.from(mixedOrgs.values()).sort((a, b) => {
      if (b.people !== a.people) return b.people - a.people;
      if (b.edges !== a.edges) return b.edges - a.edges;
      return a.label.localeCompare(b.label) || a.id.localeCompare(b.id);
    });
    chips.push({
      kind: "mixed",
      id: "mixed",
      label: MIXED_BOARDS_LABEL,
      orgs,
    });
  }
  return chips;
}
