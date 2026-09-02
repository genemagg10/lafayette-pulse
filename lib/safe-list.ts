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

export function parseOffset(request: NextRequest): number {
  const raw = parseInt(request.nextUrl.searchParams.get("offset") || "0", 10);
  if (Number.isNaN(raw) || raw < 0) return 0;
  return raw;
}

export function parseBoolParam(
  request: NextRequest,
  name: string,
  defaultValue = false
): boolean {
  const value = request.nextUrl.searchParams.get(name);
  if (value == null || value === "") return defaultValue;
  return value === "true" || value === "1";
}

export function parseOptionalBool(
  request: NextRequest,
  name: string
): boolean | null {
  const value = request.nextUrl.searchParams.get(name);
  if (value == null || value === "") return null;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return null;
}

export function jsonNoStore(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0, must-revalidate" },
  });
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
