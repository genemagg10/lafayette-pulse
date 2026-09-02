"use client";

export default function MeasuresPlaceholder() {
  return (
    <div className="rounded-lg border border-dashed border-cream-300 bg-cream-50 p-6 text-center">
      <p className="font-heading font-semibold text-forest-800">
        Measures &amp; candidates
      </p>
      <p className="text-sm font-body text-forest-500 mt-2 max-w-lg mx-auto leading-relaxed">
        Ballot measures, election dates, and candidacies will appear here as
        election data is collected.
      </p>
    </div>
  );
}
