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

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Clear error when user types
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
    <>
      {/* Floating chat button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 bg-forest-800 text-white rounded-full px-5 py-3 shadow-lg hover:bg-forest-700 transition-all hover:scale-105 flex items-center gap-2 text-sm font-medium"
          aria-label="Open Love Lafayette AI chat"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Ask Lafayette AI
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-14 right-0 sm:bottom-6 sm:right-6 z-50 w-full sm:w-[420px] h-[calc(100dvh-3.5rem)] sm:h-[600px] sm:max-h-[80vh] bg-white sm:rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-forest-800 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
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
                <h3 className="font-semibold text-sm">Love Lafayette AI</h3>
                <p className="text-xs text-white/70">
                  Ask about city projects &amp; meetings
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white p-1"
              aria-label="Close chat"
            >
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col justify-center">
                <div className="text-center mb-6">
                  <p className="text-forest-800 font-semibold text-lg mb-1">
                    Welcome to Love Lafayette AI
                  </p>
                  <p className="text-gray-500 text-sm">
                    Ask me anything about Lafayette city projects, meetings, and
                    community initiatives.
                  </p>
                </div>
                <div className="space-y-2">
                  {SUGGESTED_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      onClick={() => handleSuggestionClick(question)}
                      className="w-full text-left text-sm px-4 py-2.5 rounded-xl border border-gray-200 text-forest-800 hover:bg-cream-50 hover:border-forest-800/30 transition-colors"
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
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          isUser
                            ? "bg-forest-800 text-white rounded-br-md"
                            : "bg-white text-forest-800 border border-gray-200 rounded-bl-md"
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">
                          {text}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {(errorMsg || error) && (
                  <div className="flex justify-start mb-3">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md px-4 py-3 text-sm bg-red-50 text-red-700 border border-red-200">
                      {errorMsg || error?.message || "Something went wrong. Please try again."}
                    </div>
                  </div>
                )}
                {isLoading &&
                  messages.length > 0 &&
                  messages[messages.length - 1]?.role === "user" && (
                    <div className="flex justify-start mb-3">
                      <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                          <div
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                            style={{ animationDelay: "0.15s" }}
                          />
                          <div
                            className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
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

          {/* Input area */}
          <div className="border-t border-gray-200 px-4 py-3 shrink-0">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about Lafayette..."
                className="flex-1 text-sm px-4 py-2.5 rounded-xl border border-gray-200 focus:border-forest-800 focus:ring-1 focus:ring-forest-800 outline-none transition-colors bg-cream-50"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-forest-800 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-forest-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                Send
              </button>
            </form>
            <p className="text-xs text-gray-400 mt-2 text-center">
              Powered by Lafayette Pulse data. Responses may not reflect the
              latest city information.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
