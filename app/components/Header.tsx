"use client";

interface HeaderProps {
  activeProjectCount: number;
}

export default function Header({ activeProjectCount }: HeaderProps) {
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
                Vibrant Lafayette
              </h1>
              <p className="text-cream-200 text-xs sm:text-sm font-body tracking-widest uppercase">
                Community Project Tracker
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="hidden sm:flex items-center gap-2 bg-forest-700 rounded-full px-4 py-1.5">
              <span className="font-heading font-bold text-lg">
                {activeProjectCount}
              </span>
              <span className="text-cream-200 font-body">Active Projects</span>
            </div>
            <div className="bg-forest-700/60 rounded-full px-3 py-1 text-cream-200 font-body text-xs">
              Updated Weekly
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
