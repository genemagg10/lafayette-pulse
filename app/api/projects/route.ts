import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const bbox = searchParams.get("bbox");

  let query = supabase
    .from("projects")
    .select("*")
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  // Filter by categories (comma-separated)
  if (category) {
    const categories = category.split(",").map((c) => c.trim());
    query = query.in("category", categories);
  }

  // Filter by status
  if (status) {
    query = query.eq("status", status);
  }

  // Full-text search
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,description.ilike.%${search}%,location_name.ilike.%${search}%`
    );
  }

  // Bounding box filter (minLng,minLat,maxLng,maxLat)
  if (bbox) {
    const [minLng, minLat, maxLng, maxLat] = bbox.split(",").map(Number);
    if ([minLng, minLat, maxLng, maxLat].every((n) => !isNaN(n))) {
      query = query
        .gte("longitude", minLng)
        .lte("longitude", maxLng)
        .gte("latitude", minLat)
        .lte("latitude", maxLat);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
