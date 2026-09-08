"use client";

interface BoardTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
  ariaLabel: string;
  fullWidth?: boolean;
}

export default function BoardTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  fullWidth = false,
}: BoardTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`${
        fullWidth ? "flex w-full lg:inline-flex lg:w-auto" : "inline-flex"
      } border border-line bg-surface p-0.5`}
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
            className={`${
              fullWidth ? "flex-1 lg:flex-none" : ""
            } px-3 py-1.5 text-xs font-body transition-colors ${
              active
                ? "bg-forest text-surface"
                : "text-forest-600 hover:bg-canvas"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
