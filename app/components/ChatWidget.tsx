"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const SUGGESTED_QUESTIONS = [
  "What bike safety projects are planned?",
  "When is the next City Council meeting?",
  "What housing developments are proposed?",
  "What's happening with downtown Lafayette?",
];

const transport = new DefaultChatTransport({ api: "/api/chat" });

function getMessageText(
  message: { parts?: Array<{ type: string; text?: string }> }
): string {
  if (message.parts) {
    return message.parts
      .filter(
        (p): p is { type: "text"; text: string } =>
          p.type === "text" && !!p.text
      )
      .map((p) => p.text)
      .join("\n");
  }
  return "";
}

/** In-page chat. No floating FAB — reachable from More only. */
export default function ChatWidget() {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { messages, sendMessage, status, error } = useChat({
    transport,
    onError(err) {
      console.error("Chat error:", err);
      setErrorMsg("Something went wrong. Please try again.");
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (errorMsg && input) setErrorMsg(null);
  }, [input, errorMsg]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setErrorMsg(null);
    setInput("");
    await sendMessage({ text });
  };

  const handleSuggestionClick = async (question: string) => {
    setErrorMsg(null);
    setInput("");
    await sendMessage({ text: question });
  };

  return (
    <div className="flex h-[min(640px,70dvh)] min-h-[420px] flex-col overflow-hidden border border-line bg-surface">
      <div className="bg-forest text-white px-4 py-3 flex items-center gap-2 shrink-0">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <div>
          <h3 className="font-semibold text-sm">Ask Lafayette AI</h3>
          <p className="text-xs text-white/70">
            Ask about city projects &amp; meetings
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-canvas px-4 py-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col justify-center">
            <div className="text-center mb-6">
              <p className="text-ink font-semibold text-lg mb-1">
                Welcome to Ask Lafayette AI
              </p>
              <p className="text-ink-muted text-sm">
                Ask me anything about Lafayette city projects, meetings, and
                community initiatives.
              </p>
            </div>
            <div className="space-y-2">
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  onClick={() => handleSuggestionClick(question)}
                  className="w-full text-left text-sm px-4 py-2.5 border border-line text-ink hover:bg-surface hover:border-accent transition-colors"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => {
              const text = getMessageText(message);
              const isUser = message.role === "user";
              return (
                <div
                  key={message.id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}
                >
                  <div
                    className={`max-w-[85%] rounded-md px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? "bg-forest text-white"
                        : "bg-surface text-ink border border-line"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{text}</div>
                  </div>
                </div>
              );
            })}
            {(errorMsg || error) && (
              <div className="flex justify-start mb-3">
                <div className="max-w-[85%] rounded-md px-4 py-3 text-sm bg-red-50 text-red-700 border border-red-200">
                  {errorMsg || error?.message || "Something went wrong. Please try again."}
                </div>
              </div>
            )}
            {isLoading &&
              messages.length > 0 &&
              messages[messages.length - 1]?.role === "user" && (
                <div className="flex justify-start mb-3">
                  <div className="bg-surface border border-line rounded-md px-4 py-3">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-ink-faint rounded-full animate-bounce" />
                      <div
                        className="w-2 h-2 bg-ink-faint rounded-full animate-bounce"
                        style={{ animationDelay: "0.15s" }}
                      />
                      <div
                        className="w-2 h-2 bg-ink-faint rounded-full animate-bounce"
                        style={{ animationDelay: "0.3s" }}
                      />
                    </div>
                  </div>
                </div>
              )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="border-t border-line px-4 py-3 shrink-0 bg-surface">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about Lafayette..."
            className="flex-1 text-sm px-4 py-2.5 border border-line focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-colors bg-canvas"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-forest text-white px-4 py-2.5 text-sm font-medium hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            Send
          </button>
        </form>
        <p className="text-xs text-ink-faint mt-2 text-center">
          Powered by Lafayette Pulse data. Responses may not reflect the latest
          city information.
        </p>
      </div>
    </div>
  );
}
