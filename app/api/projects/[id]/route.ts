import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabase();
  const id = params.id;

  // Fetch the project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (projectError) {
    return NextResponse.json(
      { error: projectError.message },
      { status: projectError.code === "PGRST116" ? 404 : 500 }
    );
  }

  // Fetch all updates for this project
  const { data: updates, error: updatesError } = await supabase
    .from("project_updates")
    .select("*")
    .eq("project_id", id)
    .order("source_date", { ascending: false });

  if (updatesError) {
    return NextResponse.json(
      { error: updatesError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ...project, updates });
}
