"use client";

import { useEffect, useState } from "react";
import { formatFreshness } from "@/lib/freshness";
import type { HealthResponse } from "@/lib/types";

export function useHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/health")
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!cancelled && data && typeof data === "object") {
          setHealth(data as HealthResponse);
        } else if (!cancelled) {
          setHealth(null);
        }
      })
      .catch(() => {
        if (!cancelled) setHealth(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const freshness = formatFreshness(health, loading);
  const backendDown = health !== null && health.supabase_reachable === false;

  return { health, loading, freshness, backendDown };
}
