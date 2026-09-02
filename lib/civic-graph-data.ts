import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgType, SeatType } from "@/lib/types";
import {
  INVOLVEMENT_METRICS,
  involvementScore,
  isCurrentTenure,
  jaccardSets,
  scaleSize,
  type CivicGraphEdge,
  type CivicGraphNode,
  type EgoGraphResponse,
  type InvolvementEntity,
  type InvolvementItem,
  type InvolvementMetric,
  type InvolvementResponse,
  type OrgAffinityResponse,
} from "@/lib/civic-graph";

export interface PersonRow {
  id: string;
  full_name: string;
  bio: string | null;
  photo_url: string | null;
  email: string | null;
  website: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  org_type: OrgType;
  description: string | null;
  website: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  id: string;
  person_id: string;
  organization_id: string;
  role: string | null;
  is_primary: boolean;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
}

export interface SeatRow {
  id: string;
  organization_id: string | null;
  title: string;
  seat_type: SeatType;
  district: string | null;
}

export interface SeatHolderRow {
  id: string;
  seat_id: string;
  person_id: string;
  start_date: string | null;
  end_date: string | null;
  source_url: string | null;
}

export interface GraphSnapshot {
  people: PersonRow[];
  organizations: OrganizationRow[];
  memberships: MembershipRow[];
  seats: SeatRow[];
  seatHolders: SeatHolderRow[];
}

const PAGE = 1000;

async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns = "*"
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

export async function loadGraphSnapshot(
  supabase: SupabaseClient
): Promise<GraphSnapshot> {
  const [people, organizations, memberships, seats, seatHolders] =
    await Promise.all([
      fetchAll<PersonRow>(supabase, "people"),
      fetchAll<OrganizationRow>(supabase, "organizations"),
      fetchAll<MembershipRow>(
        supabase,
        "memberships",
        "id, person_id, organization_id, role, is_primary, start_date, end_date, source_url"
      ),
      fetchAll<SeatRow>(
        supabase,
        "seats",
        "id, organization_id, title, seat_type, district"
      ),
      fetchAll<SeatHolderRow>(
        supabase,
        "seat_holders",
        "id, seat_id, person_id, start_date, end_date, source_url"
      ),
    ]);
  return { people, organizations, memberships, seats, seatHolders };
}

function indexById<T extends { id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

function tenureOk(endDate: string | null, currentOnly: boolean): boolean {
  return !currentOnly || isCurrentTenure(endDate);
}

export function buildEgoGraph(
  snapshot: GraphSnapshot,
  personId: string,
  options: { hops: 1 | 2; currentOnly: boolean; alterCap: number }
): EgoGraphResponse | null {
  const peopleById = indexById(snapshot.people);
  const orgsById = indexById(snapshot.organizations);
  const seatsById = indexById(snapshot.seats);
  const center = peopleById.get(personId);
  if (!center) return null;

  const { hops, currentOnly, alterCap } = options;
  const nodes = new Map<string, CivicGraphNode>();
  const edges: CivicGraphEdge[] = [];

  const addNode = (node: CivicGraphNode) => {
    const existing = nodes.get(node.id);
    if (!existing || node.size > existing.size) {
      nodes.set(node.id, { ...existing, ...node });
    }
  };

  addNode({
    id: center.id,
    kind: "person",
    label: center.full_name,
    size: 16,
    photo_url: center.photo_url,
  });

  const hop1OrgIds = new Set<string>();

  const addOrg = (orgId: string, size = 11) => {
    const org = orgsById.get(orgId);
    if (!org) return;
    hop1OrgIds.add(org.id);
    addNode({
      id: org.id,
      kind: "organization",
      label: org.name,
      org_type: org.org_type,
      size,
    });
  };

  for (const membership of snapshot.memberships) {
    if (membership.person_id !== center.id) continue;
    if (!tenureOk(membership.end_date, currentOnly)) continue;
    addOrg(membership.organization_id);
    if (!orgsById.has(membership.organization_id)) continue;
    edges.push({
      source: center.id,
      target: membership.organization_id,
      kind: "membership",
      role: membership.role,
      is_primary: membership.is_primary,
      start_date: membership.start_date,
      end_date: membership.end_date,
    });
  }

  for (const holder of snapshot.seatHolders) {
    if (holder.person_id !== center.id) continue;
    if (!tenureOk(holder.end_date, currentOnly)) continue;
    const seat = seatsById.get(holder.seat_id);
    if (!seat) continue;
    addNode({
      id: seat.id,
      kind: "seat",
      label: seat.title,
      seat_type: seat.seat_type,
      size: 9,
    });
    edges.push({
      source: center.id,
      target: seat.id,
      kind: "seat_holder",
      role: seat.title,
      is_primary: true,
      start_date: holder.start_date,
      end_date: holder.end_date,
    });
    if (seat.organization_id) {
      addOrg(seat.organization_id);
      if (
        orgsById.has(seat.organization_id) &&
        !edges.some(
          (edge) =>
            edge.source === center.id &&
            edge.target === seat.organization_id &&
            edge.kind === "membership"
        )
      ) {
        edges.push({
          source: center.id,
          target: seat.organization_id,
          kind: "seat_holder",
          role: seat.title,
          is_primary: true,
          start_date: holder.start_date,
          end_date: holder.end_date,
        });
      }
    }
  }

  if (hops === 2) {
    const sharedCount = new Map<string, number>();
    const hasSeat = new Set<string>();

    for (const membership of snapshot.memberships) {
      if (membership.person_id === center.id) continue;
      if (!hop1OrgIds.has(membership.organization_id)) continue;
      if (!tenureOk(membership.end_date, currentOnly)) continue;
      sharedCount.set(
        membership.person_id,
        (sharedCount.get(membership.person_id) ?? 0) + 1
      );
    }
    for (const holder of snapshot.seatHolders) {
      if (holder.person_id === center.id) continue;
      if (!tenureOk(holder.end_date, currentOnly)) continue;
      const seat = seatsById.get(holder.seat_id);
      if (!seat?.organization_id || !hop1OrgIds.has(seat.organization_id)) {
        continue;
      }
      hasSeat.add(holder.person_id);
      sharedCount.set(
        holder.person_id,
        (sharedCount.get(holder.person_id) ?? 0) + 1
      );
    }

    const alterIds = Array.from(sharedCount.keys())
      .filter((id) => peopleById.has(id))
      .sort((a, b) => {
        const seatDelta = Number(hasSeat.has(b)) - Number(hasSeat.has(a));
        if (seatDelta) return seatDelta;
        const shareDelta = (sharedCount.get(b) ?? 0) - (sharedCount.get(a) ?? 0);
        if (shareDelta) return shareDelta;
        return peopleById.get(a)!.full_name.localeCompare(
          peopleById.get(b)!.full_name
        );
      })
      .slice(0, alterCap);

    const alterSet = new Set(alterIds);
    for (const alterId of alterIds) {
      const person = peopleById.get(alterId)!;
      addNode({
        id: person.id,
        kind: "person",
        label: person.full_name,
        size: 8,
        photo_url: person.photo_url,
      });
    }

    for (const membership of snapshot.memberships) {
      if (!alterSet.has(membership.person_id)) continue;
      if (!hop1OrgIds.has(membership.organization_id)) continue;
      if (!tenureOk(membership.end_date, currentOnly)) continue;
      if (!orgsById.has(membership.organization_id)) continue;
      edges.push({
        source: membership.person_id,
        target: membership.organization_id,
        kind: "membership",
        role: membership.role,
        is_primary: membership.is_primary,
        start_date: membership.start_date,
        end_date: membership.end_date,
      });
    }

    for (const holder of snapshot.seatHolders) {
      if (!alterSet.has(holder.person_id)) continue;
      if (!tenureOk(holder.end_date, currentOnly)) continue;
      const seat = seatsById.get(holder.seat_id);
      if (!seat) continue;
      const orgId = seat.organization_id;
      if (!orgId || !hop1OrgIds.has(orgId)) continue;
      addNode({
        id: seat.id,
        kind: "seat",
        label: seat.title,
        seat_type: seat.seat_type,
        size: 8,
      });
      edges.push({
        source: holder.person_id,
        target: seat.id,
        kind: "seat_holder",
        role: seat.title,
        is_primary: true,
        start_date: holder.start_date,
        end_date: holder.end_date,
      });
    }
  }

  const MAX_NODES = 60;
  if (nodes.size > MAX_NODES) {
    const kept = new Set<string>([center.id, ...Array.from(hop1OrgIds)]);
    Array.from(nodes.values()).forEach((node) => {
      if (kept.size >= MAX_NODES) return;
      kept.add(node.id);
    });
    Array.from(nodes.keys()).forEach((id) => {
      if (!kept.has(id)) nodes.delete(id);
    });
  }

  const nodeIds = new Set(nodes.keys());
  return {
    center: {
      id: center.id,
      full_name: center.full_name,
      photo_url: center.photo_url,
    },
    nodes: Array.from(nodes.values()),
    edges: edges.filter(
      (edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)
    ),
    hops,
    current_only: currentOnly,
    alter_cap: alterCap,
  };
}

export function buildInvolvement(
  snapshot: GraphSnapshot,
  options: {
    entity: InvolvementEntity;
    metric: InvolvementMetric;
    currentOnly: boolean;
    limit: number;
  }
): InvolvementResponse {
  const { entity, metric, currentOnly, limit } = options;
  const spec = INVOLVEMENT_METRICS[metric];
  const peopleById = indexById(snapshot.people);
  const orgsById = indexById(snapshot.organizations);
  const seatsById = indexById(snapshot.seats);

  const membershipsByPerson = new Map<string, MembershipRow[]>();
  const holdersByPerson = new Map<string, SeatHolderRow[]>();
  const membershipsByOrg = new Map<string, MembershipRow[]>();
  const holdersByOrg = new Map<string, SeatHolderRow[]>();

  for (const membership of snapshot.memberships) {
    if (!tenureOk(membership.end_date, currentOnly)) continue;
    const personList = membershipsByPerson.get(membership.person_id) ?? [];
    personList.push(membership);
    membershipsByPerson.set(membership.person_id, personList);
    const orgList = membershipsByOrg.get(membership.organization_id) ?? [];
    orgList.push(membership);
    membershipsByOrg.set(membership.organization_id, orgList);
  }

  for (const holder of snapshot.seatHolders) {
    if (!tenureOk(holder.end_date, currentOnly)) continue;
    const personList = holdersByPerson.get(holder.person_id) ?? [];
    personList.push(holder);
    holdersByPerson.set(holder.person_id, personList);
    const seat = seatsById.get(holder.seat_id);
    if (seat?.organization_id) {
      const orgList = holdersByOrg.get(seat.organization_id) ?? [];
      orgList.push(holder);
      holdersByOrg.set(seat.organization_id, orgList);
    }
  }

  const items: InvolvementItem[] = [];

  if (entity === "person") {
    for (const person of snapshot.people) {
      const boards = membershipsByPerson.get(person.id) ?? [];
      const holders = holdersByPerson.get(person.id) ?? [];
      if (boards.length === 0 && holders.length === 0) continue;
      items.push({
        id: person.id,
        kind: "person",
        label: person.full_name,
        photo_url: person.photo_url,
        score: involvementScore(boards.length, holders.length, metric),
        memberships: boards.length,
        seat_holders: holders.length,
        seats: holders.map((holder) => {
          const seat = seatsById.get(holder.seat_id);
          const org = seat?.organization_id
            ? orgsById.get(seat.organization_id)
            : undefined;
          return {
            id: seat?.id ?? holder.seat_id,
            title: seat?.title ?? "Seat",
            org_name: org?.name ?? null,
          };
        }),
        boards: boards.map((membership) => ({
          id: membership.organization_id,
          name: orgsById.get(membership.organization_id)?.name ?? "Organization",
          role: membership.role,
        })),
      });
    }
  } else {
    for (const org of snapshot.organizations) {
      const boards = membershipsByOrg.get(org.id) ?? [];
      const holders = holdersByOrg.get(org.id) ?? [];
      if (boards.length === 0 && holders.length === 0) continue;
      items.push({
        id: org.id,
        kind: "organization",
        label: org.name,
        org_type: org.org_type,
        score: involvementScore(boards.length, holders.length, metric),
        memberships: boards.length,
        seat_holders: holders.length,
        seats: holders.map((holder) => {
          const seat = seatsById.get(holder.seat_id);
          return {
            id: seat?.id ?? holder.seat_id,
            title: seat?.title ?? "Seat",
            org_name: org.name,
          };
        }),
        boards: boards.map((membership) => ({
          id: membership.person_id,
          name: peopleById.get(membership.person_id)?.full_name ?? "Person",
          role: membership.role,
        })),
      });
    }
  }

  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.label.localeCompare(b.label);
  });

  return {
    entity,
    metric,
    label: spec.label,
    weights: spec.weights,
    current_only: currentOnly,
    items: items.slice(0, limit),
  };
}

export function buildOrgAffinity(
  snapshot: GraphSnapshot,
  options: {
    currentOnly: boolean;
    minJaccard: number;
    minShared: number;
    limitOrgs: number;
  }
): OrgAffinityResponse {
  const { currentOnly, minJaccard, minShared, limitOrgs } = options;
  const peopleById = indexById(snapshot.people);
  const membersByOrg = new Map<string, Set<string>>();

  for (const membership of snapshot.memberships) {
    if (!tenureOk(membership.end_date, currentOnly)) continue;
    const set = membersByOrg.get(membership.organization_id) ?? new Set();
    set.add(membership.person_id);
    membersByOrg.set(membership.organization_id, set);
  }

  const ranked = snapshot.organizations
    .map((org) => ({
      org,
      members: membersByOrg.get(org.id) ?? new Set<string>(),
    }))
    .filter((row) => row.members.size > 0)
    .sort((a, b) => {
      if (b.members.size !== a.members.size) {
        return b.members.size - a.members.size;
      }
      return a.org.name.localeCompare(b.org.name);
    })
    .slice(0, limitOrgs);

  const maxMembers = ranked.reduce(
    (max, row) => Math.max(max, row.members.size),
    0
  );
  const nodes = ranked.map(({ org, members }) => ({
    id: org.id,
    label: org.name,
    org_type: org.org_type,
    member_count: members.size,
    size: scaleSize(members.size, 0, Math.max(maxMembers, 1), 7, 18),
  }));

  const edges: OrgAffinityResponse["edges"] = [];
  for (let i = 0; i < ranked.length; i += 1) {
    for (let j = i + 1; j < ranked.length; j += 1) {
      const left = ranked[i];
      const right = ranked[j];
      const { shared, jaccard } = jaccardSets(left.members, right.members);
      if (shared < minShared || jaccard < minJaccard) continue;
      const sharedNames = Array.from(left.members)
        .filter((id) => right.members.has(id))
        .map((id) => peopleById.get(id)?.full_name ?? "Unknown")
        .sort((a, b) => a.localeCompare(b));
      edges.push({
        source: left.org.id,
        target: right.org.id,
        shared,
        jaccard: Number(jaccard.toFixed(3)),
        shared_names: sharedNames,
      });
    }
  }

  edges.sort((a, b) => b.jaccard - a.jaccard || b.shared - a.shared);

  return {
    label: "Shared membership",
    current_only: currentOnly,
    min_jaccard: minJaccard,
    min_shared: minShared,
    limit_orgs: limitOrgs,
    nodes,
    edges,
  };
}

export function currentMemberCounts(
  snapshot: GraphSnapshot,
  currentOnly = true
): Map<string, number> {
  const counts = new Map<string, Set<string>>();
  for (const membership of snapshot.memberships) {
    if (!tenureOk(membership.end_date, currentOnly)) continue;
    const set = counts.get(membership.organization_id) ?? new Set();
    set.add(membership.person_id);
    counts.set(membership.organization_id, set);
  }
  return new Map(Array.from(counts.entries()).map(([id, set]) => [id, set.size]));
}

export function personRoleSummary(
  snapshot: GraphSnapshot,
  personIds: string[],
  currentOnly = true
): Map<
  string,
  {
    membership_count: number;
    seat_count: number;
    current_roles: { org_name: string; role: string | null; is_seat: boolean }[];
  }
> {
  const idSet = new Set(personIds);
  const orgsById = indexById(snapshot.organizations);
  const seatsById = indexById(snapshot.seats);
  const summary = new Map<
    string,
    {
      membership_count: number;
      seat_count: number;
      current_roles: { org_name: string; role: string | null; is_seat: boolean }[];
    }
  >();

  for (const id of personIds) {
    summary.set(id, { membership_count: 0, seat_count: 0, current_roles: [] });
  }

  for (const membership of snapshot.memberships) {
    if (!idSet.has(membership.person_id)) continue;
    if (!tenureOk(membership.end_date, currentOnly)) continue;
    const row = summary.get(membership.person_id);
    if (!row) continue;
    row.membership_count += 1;
    const orgName = orgsById.get(membership.organization_id)?.name;
    if (orgName) {
      row.current_roles.push({
        org_name: orgName,
        role: membership.role,
        is_seat: false,
      });
    }
  }

  for (const holder of snapshot.seatHolders) {
    if (!idSet.has(holder.person_id)) continue;
    if (!tenureOk(holder.end_date, currentOnly)) continue;
    const row = summary.get(holder.person_id);
    if (!row) continue;
    row.seat_count += 1;
    const seat = seatsById.get(holder.seat_id);
    const orgName = seat?.organization_id
      ? orgsById.get(seat.organization_id)?.name
      : null;
    row.current_roles.push({
      org_name: orgName ?? "Seat",
      role: seat?.title ?? "Seat",
      is_seat: true,
    });
  }

  return summary;
}
