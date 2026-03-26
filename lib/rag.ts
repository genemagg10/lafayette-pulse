import { getEmbedding } from "./embeddings";
import { getSupabaseAdmin } from "./supabase";

export interface ChatSource {
  title: string;
  sourceTable: string;
  sourceId: number;
  sourceUrl: string | null;
  meetingBody: string | null;
  meetingDate: string | null;
  category: string | null;
  similarity: number;
}

interface RetrievalResult {
  context: string;
  sources: ChatSource[];
}

/**
 * Retrieve relevant document chunks for a user query using vector similarity search.
 * Returns formatted context for the LLM and source metadata for citations.
 */
export async function retrieveContext(
  query: string,
  options?: {
    matchCount?: number;
    filterCategory?: string;
    filterBody?: string;
    filterAfter?: string;
  }
): Promise<RetrievalResult> {
  const supabase = getSupabaseAdmin();
  const queryEmbedding = await getEmbedding(query);

  const { data: chunks, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_count: options?.matchCount ?? 10,
    filter_category: options?.filterCategory ?? null,
    filter_body: options?.filterBody ?? null,
    filter_after: options?.filterAfter ?? null,
  });

  if (error || !chunks || chunks.length === 0) {
    return { context: "", sources: [] };
  }

  const sources: ChatSource[] = chunks.map(
    (chunk: {
      project_title: string;
      source_table: string;
      source_id: number;
      source_url: string | null;
      meeting_body: string | null;
      meeting_date: string | null;
      category: string | null;
      similarity: number;
    }) => ({
      title: chunk.project_title || "Untitled",
      sourceTable: chunk.source_table,
      sourceId: chunk.source_id,
      sourceUrl: chunk.source_url,
      meetingBody: chunk.meeting_body,
      meetingDate: chunk.meeting_date,
      category: chunk.category,
      similarity: chunk.similarity,
    })
  );

  const context = chunks
    .map(
      (chunk: {
        project_title: string;
        meeting_body: string | null;
        meeting_date: string | null;
        category: string | null;
        content: string;
      }) => {
        const header = [
          chunk.project_title,
          chunk.meeting_body,
          chunk.meeting_date,
          chunk.category,
        ]
          .filter(Boolean)
          .join(" | ");
        return `[${header}]\n${chunk.content}`;
      }
    )
    .join("\n\n---\n\n");

  return { context, sources };
}
