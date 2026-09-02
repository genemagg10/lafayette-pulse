import { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/safe-list";
import { tryGetSupabase } from "@/lib/supabase";
import { isCurrentTenure, isUuid } from "@/lib/civic-graph";
import {
  loadGraphSnapshot,
  type OrganizationRow,
} from "@/lib/civic-graph-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    if (!isUuid(id)) return jsonNoStore({ error: "Invalid organization id" }, 400);

    const supabase = tryGetSupabase();
    if (!supabase) return jsonNoStore({ error: "Database unavailable" }, 503);

    const { data, error } = await supabase
      .from("organizations")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return jsonNoStore({ error: error.message }, 500);
    if (!data) return jsonNoStore({ error: "Organization not found" }, 404);

    const org = data as OrganizationRow;
    const snapshot = await loadGraphSnapshot(supabase);
    const people = new Map(snapshot.people.map((person) => [person.id, person]));
    const orgSeats = snapshot.seats.filter((seat) => seat.organization_id === id);

    const members = snapshot.memberships
      .filter((row) => row.organization_id === id)
      .map((row) => {
        const person = people.get(row.person_id);
        return {
          id: row.id,
          role: row.role,
          is_primary: row.is_primary,
          start_date: row.start_date,
          end_date: row.end_date,
          is_current: isCurrentTenure(row.end_date),
          person: person
            ? {
                id: person.id,
                full_name: person.full_name,
                photo_url: person.photo_url,
                bio: person.bio,
              }
            : null,
        };
      })
      .sort((a, b) => {
        if (a.is_current !== b.is_current) return a.is_current ? -1 : 1;
        const nameA = a.person?.full_name ?? "";
        const nameB = b.person?.full_name ?? "";
        return nameA.localeCompare(nameB);
      });

    const seats = orgSeats.map((seat) => {
      const holders = snapshot.seatHolders
        .filter((row) => row.seat_id === seat.id)
        .map((row) => {
          const person = people.get(row.person_id);
          return {
            id: row.id,
            start_date: row.start_date,
            end_date: row.end_date,
            is_current: isCurrentTenure(row.end_date),
            person: person
              ? { id: person.id, full_name: person.full_name, photo_url: person.photo_url }
              : null,
          };
        });
      return {
        id: seat.id,
        title: seat.title,
        seat_type: seat.seat_type,
        district: seat.district,
        holders,
      };
    });

    const currentMembers = members.filter((row) => row.is_current && row.person);

    return jsonNoStore({
      ...org,
      current_member_count: new Set(currentMembers.map((row) => row.person!.id)).size,
      member_count: new Set(
        members.filter((row) => row.person).map((row) => row.person!.id)
      ).size,
      members,
      seats,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to load organization";
    return jsonNoStore({ error: message }, 500);
  }
}
