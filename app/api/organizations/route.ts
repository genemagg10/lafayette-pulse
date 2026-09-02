import { NextRequest, NextResponse } from "next/server";
import { parseLimit, safeList } from "@/lib/safe-list";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const orgType = searchParams.get("org_type")?.trim();
    const limit = parseLimit(request);

    return await safeList((supabase) => {
      let query = supabase
        .from("organizations")
        .select("*")
        .order("name", { ascending: true })
        .limit(limit);

      if (orgType) {
        query = query.eq("org_type", orgType);
      }
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,description.ilike.%${search}%,slug.ilike.%${search}%`
        );
      }

      return query;
    });
  } catch {
    return NextResponse.json([]);
  }
}
