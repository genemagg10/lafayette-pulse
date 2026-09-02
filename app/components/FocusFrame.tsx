export default function FocusFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`h-[calc(100dvh-var(--pulse-shell-offset))] overflow-hidden ${className}`}
    >
      {children}
    </div>
  );
}
