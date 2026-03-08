import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const since = searchParams.get("since");
  const until = searchParams.get("until");
  const body = searchParams.get("body");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
  // upcoming=true → soonest first; archive (until) → most recent first
  const ascending = searchParams.get("upcoming") === "true";

  let query = supabase
    .from("agenda_items")
    .select("*")
    .order("date", { ascending })
    .limit(limit);

  if (category) {
    const categories = category.split(",").map((c) => c.trim());
    query = query.in("category", categories);
  }

  if (since) {
    query = query.gte("date", since);
  }

  if (until) {
    query = query.lt("date", until);
  }

  if (body) {
    query = query.ilike("body", `%${body}%`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
