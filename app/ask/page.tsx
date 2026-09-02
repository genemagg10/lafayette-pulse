import ChatWidget from "../components/ChatWidget";

export default function AskPage() {
  return (
    <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-8 space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-wide font-body text-ink-muted">
          More
        </p>
        <h1 className="font-heading text-2xl font-bold text-ink">
          Ask Lafayette AI
        </h1>
        <p className="text-sm font-body text-ink-muted mt-1">
          Secondary tool — not a floating button. Ask about city projects and
          meetings from public records.
        </p>
      </div>
      <ChatWidget />
    </div>
  );
}
