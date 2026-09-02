"use client";

interface BoardTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
  ariaLabel: string;
}

export default function BoardTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: BoardTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg border border-cream-300 bg-white p-0.5"
    >
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={`px-3 py-1.5 text-xs font-body rounded-md transition-colors ${
              active
                ? "bg-forest-800 text-cream-50"
                : "text-forest-600 hover:bg-cream-50"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
