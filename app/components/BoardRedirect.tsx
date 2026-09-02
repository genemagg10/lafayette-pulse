"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { resolveBoardRedirect } from "@/lib/layout-ia";

export default function BoardRedirect() {
  const router = useRouter();

  useEffect(() => {
    const target = resolveBoardRedirect(window.location.hash, window.location.search);
    if (target) router.replace(target);
  }, [router]);

  return null;
}
