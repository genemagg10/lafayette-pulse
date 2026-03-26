"use client";

interface HeaderProps {
  showMap: boolean;
  onToggleMap: () => void;
  showCalendar: boolean;
  onToggleCalendar: () => void;
}

export default function Header({
  showMap,
  onToggleMap,
  showCalendar,
  onToggleCalendar,
}: HeaderProps) {
  return (
    <header className="bg-forest-800 text-cream-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl" aria-hidden="true">
              🌿
            </span>
            <div>
              <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight">
                Lafayette Pulse
              </h1>
              <p className="text-cream-200 text-xs sm:text-sm font-body tracking-widest uppercase">
                Community Project Tracker
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 text-sm">
            <button
              onClick={onToggleMap}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body transition-all border ${
                showMap
                  ? "bg-cream-50 text-forest-800 border-cream-50"
                  : "bg-forest-700/60 text-cream-200 border-forest-600 hover:bg-forest-700"
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
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-body transition-all border ${
                showCalendar
                  ? "bg-cream-50 text-forest-800 border-cream-50"
                  : "bg-forest-700/60 text-cream-200 border-forest-600 hover:bg-forest-700"
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
            <div className="bg-forest-700/60 rounded-full px-3 py-1 text-cream-200 font-body text-xs">
              Updated Daily
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
