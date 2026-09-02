export default function BackendBanner({
  message,
  error,
}: {
  message?: string;
  error?: string | null;
}) {
  return (
    <div
      role="alert"
      className="bg-amber-50 border border-amber-300 text-forest-900 px-4 py-4"
    >
      <p className="font-heading font-semibold text-base">
        Backend data is currently unavailable
      </p>
      <p className="text-sm font-body mt-1 leading-relaxed">
        {message ||
          "The Pulse shell is up, but civic data could not be loaded from the database. This is usually a backend configuration issue (missing or expired Supabase credentials), not a problem with this page."}
      </p>
      {error && (
        <p className="text-xs font-body text-forest-600 mt-2">{error}</p>
      )}
      <p className="text-sm font-body mt-3">
        <a href="/api/health" className="underline font-medium hover:text-forest-700">
          Check /api/health
        </a>
        <span className="mx-1.5 text-forest-400">·</span>
        Data temporarily unavailable
      </p>
    </div>
  );
}
