import type { HealthResponse } from "@/lib/types";

export function formatFreshness(
  health: HealthResponse | null,
  loading: boolean
): { label: string; unavailable: boolean } {
  if (loading && !health) {
    return { label: "Checking data…", unavailable: false };
  }
  if (!health || !health.supabase_reachable) {
    return { label: "Data temporarily unavailable", unavailable: true };
  }
  if (!health.last_scraped_at) {
    return { label: "Connected · no scrape yet", unavailable: false };
  }

  const then = new Date(health.last_scraped_at).getTime();
  if (Number.isNaN(then)) {
    return { label: "Connected", unavailable: false };
  }

  const diffMs = Date.now() - then;
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return { label: "Updated just now", unavailable: false };
  if (diffMin < 60) return { label: `Updated ${diffMin}m ago`, unavailable: false };
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return { label: `Updated ${diffHr}h ago`, unavailable: false };
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return { label: "Updated yesterday", unavailable: false };
  if (diffDay < 14) return { label: `Updated ${diffDay} days ago`, unavailable: false };

  const date = new Date(health.last_scraped_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return { label: `Updated ${date}`, unavailable: false };
}
