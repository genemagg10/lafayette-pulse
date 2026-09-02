import { NextRequest, NextResponse } from "next/server";
import { parseLimit, safeList } from "@/lib/safe-list";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const limit = parseLimit(request);

    return await safeList((supabase) => {
      let query = supabase
        .from("people")
        .select("*")
        .order("full_name", { ascending: true })
        .limit(limit);

      if (search) {
        query = query.or(`full_name.ilike.%${search}%,bio.ilike.%${search}%`);
      }

      return query;
    });
  } catch {
    return NextResponse.json([]);
  }
}
