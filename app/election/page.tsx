import type { Metadata } from "next";
import ElectionGuide from "../components/election/ElectionGuide";
import { loadElectionPage } from "@/lib/election-data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "November 3, 2026 voter guide",
  description:
    "Nonpartisan Lafayette voter guide for the November 3, 2026 election: measures, stances, candidates, dates, and itemized donations. Results are not certified.",
};

export default async function ElectionPage() {
  const result = await loadElectionPage();
  return (
    <main>
      {result.ok ? (
        <ElectionGuide model={result.model} />
      ) : (
        <div className="max-w-3xl mx-auto px-4 py-10">
          <h1 className="font-heading text-2xl font-bold text-ink">
            November 3, 2026 voter guide
          </h1>
          <p className="mt-3 text-sm font-body text-ink-muted">{result.error}</p>
        </div>
      )}
    </main>
  );
}
