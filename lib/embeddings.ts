import OpenAI from "openai";

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

/**
 * Generate an embedding vector for the given text using OpenAI text-embedding-3-small.
 * Server-side only — requires OPENAI_API_KEY env var.
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text.slice(0, 8000), // ~8K chars ≈ 2K tokens, well within model limits
  });
  return response.data[0].embedding;
}
