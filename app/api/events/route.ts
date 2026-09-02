import { NextRequest, NextResponse } from "next/server";
import { parseLimit, safeList } from "@/lib/safe-list";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const eventType = searchParams.get("event_type")?.trim();
    const organizationId = searchParams.get("organization_id")?.trim();
    const since = searchParams.get("since")?.trim();
    const until = searchParams.get("until")?.trim();
    const search = searchParams.get("search")?.trim();
    const upcoming = searchParams.get("upcoming") === "true";
    const limit = parseLimit(request);

    return await safeList((supabase) => {
      let query = supabase
        .from("events")
        .select("*")
        .order("starts_at", { ascending: upcoming })
        .limit(limit);

      if (eventType) {
        query = query.eq("event_type", eventType);
      }
      if (organizationId) {
        query = query.eq("organization_id", organizationId);
      }
      if (since) {
        query = query.gte("starts_at", since);
      }
      if (until) {
        query = query.lt("starts_at", until);
      }
      if (search) {
        query = query.or(
          `title.ilike.%${search}%,description.ilike.%${search}%,body.ilike.%${search}%`
        );
      }

      return query;
    });
  } catch {
    return NextResponse.json([]);
  }
}
