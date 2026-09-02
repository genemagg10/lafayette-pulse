"use client";

interface HeaderProps {
  showMap: boolean;
  onToggleMap: () => void;
  showCalendar: boolean;
  onToggleCalendar: () => void;
  freshnessLabel: string;
  dataUnavailable: boolean;
}

export default function Header({
  showMap,
  onToggleMap,
  showCalendar,
  onToggleCalendar,
  freshnessLabel,
  dataUnavailable,
}: HeaderProps) {
  return (
    <header className="bg-surface text-ink border-b border-line h-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="font-heading text-lg font-bold tracking-tight">
                Lafayette Pulse
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-sm flex-wrap justify-end">
            <button
              onClick={onToggleMap}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors border ${
                showMap
                  ? "bg-canvas text-forest-800 border-line"
                  : "bg-surface text-forest-600 border-line hover:border-accent"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
              {showMap ? "Hide Map" : "Map"}
            </button>
            <button
              onClick={onToggleCalendar}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-body transition-colors border ${
                showCalendar
                  ? "bg-canvas text-forest-800 border-line"
                  : "bg-surface text-forest-600 border-line hover:border-accent"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              {showCalendar ? "Hide Calendar" : "Calendar"}
            </button>
            <div
              className={`px-3 py-1 font-body text-xs border ${
                dataUnavailable
                  ? "bg-amber-50 text-forest-900 border-amber-300"
                  : "bg-canvas text-forest-600 border-line"
              }`}
              title={freshnessLabel}
            >
              {freshnessLabel}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
