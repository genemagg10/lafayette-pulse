import { anthropic } from "@ai-sdk/anthropic";
import { streamText, UIMessage } from "ai";
import { retrieveContext } from "@/lib/rag";

export const maxDuration = 30;

const SYSTEM_PROMPT = `You are the Love Lafayette AI assistant, a friendly and knowledgeable guide to everything happening in Lafayette, California city government.

Your role:
- Answer questions about city projects, meetings, development proposals, infrastructure, parks, public safety, and community events in Lafayette
- Base your answers ONLY on the provided context from Lafayette Pulse data
- Be concise, helpful, and factual
- When citing information, mention the source (meeting body, date, or project name) so users can find the original documents
- If the context doesn't contain enough information to answer a question, say so honestly and suggest where the user might find the answer (e.g., "Check the city website at lovelafayette.org" or "Contact City Hall at 925-284-1968")
- Use a warm, community-oriented tone — you're helping engaged citizens stay informed
- Format responses with markdown when helpful (bullet points, bold for key terms)

Important:
- Never make up information that isn't in the provided context
- Never provide legal advice or official interpretations of city policy
- If asked about topics outside Lafayette city government, politely redirect to your area of expertise`;

function extractTextFromMessage(message: UIMessage): string {
  if (message.parts) {
    return message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const { messages } = (await req.json()) as { messages: UIMessage[] };
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || lastMessage.role !== "user") {
      return new Response(
        JSON.stringify({ error: "No user message provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const userQuery = extractTextFromMessage(lastMessage);

    // Retrieve relevant context via RAG — gracefully degrade if it fails
    let context = "";
    try {
      const result = await retrieveContext(userQuery, { matchCount: 8 });
      context = result.context;
    } catch (ragError) {
      console.error("RAG retrieval failed, proceeding without context:", ragError);
    }

    // Build the augmented user message with RAG context
    const augmentedContent = context
      ? `Here is relevant information from Lafayette Pulse data:\n\n${context}\n\n---\n\nUser question: ${userQuery}`
      : `No specific data found in Lafayette Pulse for this query. Answer based on general knowledge about Lafayette, CA city government if possible, but be clear about what you know vs. don't know.\n\nUser question: ${userQuery}`;

    // Build conversation history for Claude
    const conversationMessages = [
      ...messages.slice(0, -1).map((m) => ({
        role: m.role as "user" | "assistant",
        content: extractTextFromMessage(m),
      })),
      { role: "user" as const, content: augmentedContent },
    ];

    const result = streamText({
      model: anthropic("claude-sonnet-4-20250514"),
      system: SYSTEM_PROMPT,
      messages: conversationMessages,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({
        error: "Something went wrong. Please try again.",
        details: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
