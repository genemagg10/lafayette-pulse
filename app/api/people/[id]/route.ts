import { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { isUuid } from "@/lib/civic-graph";
import {
  buildSharedBoardOverlaps,
  loadGraphSnapshot,
  type MembershipRow,
  type PersonRow,
  type SeatHolderRow,
} from "@/lib/civic-graph-data";
import { isCurrentTenure } from "@/lib/civic-graph";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!isUuid(id)) return jsonNoStore({ error: "Invalid person id" }, 400);

    const supabase = tryGetSupabase();
    if (!supabase) return jsonNoStore({ error: "Database unavailable" }, 503);

    const { data, error } = await supabase
      .from("people")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return jsonNoStore({ error: error.message }, 500);
    if (!data) return jsonNoStore({ error: "Person not found" }, 404);

    const person = data as PersonRow;
    const snapshot = await loadGraphSnapshot(supabase);
    const orgs = new Map(snapshot.organizations.map((org) => [org.id, org]));
    const seats = new Map(snapshot.seats.map((seat) => [seat.id, seat]));

    const memberships = snapshot.memberships
      .filter((row: MembershipRow) => row.person_id === id)
      .map((row) => {
        const org = orgs.get(row.organization_id);
        return {
          id: row.id,
          role: row.role,
          is_primary: row.is_primary,
          start_date: row.start_date,
          end_date: row.end_date,
          is_current: isCurrentTenure(row.end_date),
          organization: org
            ? {
                id: org.id,
                name: org.name,
                slug: org.slug,
                org_type: org.org_type,
              }
            : null,
        };
      });

    const seatsHeld = snapshot.seatHolders
      .filter((row: SeatHolderRow) => row.person_id === id)
      .map((row) => {
        const seat = seats.get(row.seat_id);
        const org = seat?.organization_id ? orgs.get(seat.organization_id) : null;
        return {
          id: row.id,
          start_date: row.start_date,
          end_date: row.end_date,
          is_current: isCurrentTenure(row.end_date),
          seat: seat
            ? {
                id: seat.id,
                title: seat.title,
                seat_type: seat.seat_type,
                district: seat.district,
              }
            : null,
          organization: org
            ? {
                id: org.id,
                name: org.name,
                slug: org.slug,
                org_type: org.org_type,
              }
            : null,
        };
      });

    return jsonNoStore({
      ...person,
      memberships,
      seats: seatsHeld,
      shared_boards: buildSharedBoardOverlaps(snapshot, id, {
        currentOnly: true,
        limit: 25,
      }),
      membership_count: memberships.filter((row) => row.is_current).length,
      seat_count: seatsHeld.filter((row) => row.is_current).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load person";
    return jsonNoStore({ error: message }, 500);
  }
}
