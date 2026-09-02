import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryGetSupabase } from "@/lib/supabase";

export function parseLimit(
  request: NextRequest,
  fallback = 50,
  max = 100
): number {
  const raw = parseInt(request.nextUrl.searchParams.get("limit") || String(fallback), 10);
  if (Number.isNaN(raw) || raw < 1) return fallback;
  return Math.min(raw, max);
}

/**
 * Run a Supabase list query and always return a JSON array.
 * Missing tables, bad credentials, and network errors become [].
 */
export async function safeList(
  run: (
    supabase: SupabaseClient
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<NextResponse> {
  try {
    const supabase = tryGetSupabase();
    if (!supabase) return NextResponse.json([]);
    const { data, error } = await run(supabase);
    if (error || !Array.isArray(data)) return NextResponse.json([]);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json([]);
  }
}
