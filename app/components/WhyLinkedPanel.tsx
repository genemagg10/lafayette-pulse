"use client";

import { useEffect } from "react";
import {
  selectableWhyLinkedKind,
  type WhyLinkedEntity,
  type WhyLinkedModel,
} from "@/lib/why-linked";

interface WhyLinkedPanelProps {
  model: WhyLinkedModel;
  onClose: () => void;
  onSelectEntity?: (id: string, kind: "person" | "organization") => void;
  variant?: "pane" | "sheet";
  className?: string;
}

function EntityButton({
  entity,
  onSelect,
}: {
  entity: WhyLinkedEntity;
  onSelect?: (id: string, kind: "person" | "organization") => void;
}) {
  const selectable = selectableWhyLinkedKind(entity.kind) && !entity.id.includes(":name:");
  if (!selectable || !onSelect) {
    return <span className="font-heading font-semibold text-ink">{entity.label}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onSelect(entity.id, entity.kind)}
      className="font-heading font-semibold text-forest-700 underline hover:text-forest-900 text-left"
    >
      {entity.label}
    </button>
  );
}

function WhyLinkedBody({
  model,
  onClose,
  onSelectEntity,
  closeLabel,
}: {
  model: WhyLinkedModel;
  onClose: () => void;
  onSelectEntity?: (id: string, kind: "person" | "organization") => void;
  closeLabel: string;
}) {
  const [left, right] = model.endpoints;
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-heading font-semibold text-sm text-ink">Why linked</h4>
          <p className="text-xs font-body text-ink-muted mt-0.5">{model.title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm font-body text-ink-muted hover:text-ink leading-none px-1"
          aria-label="Close Why linked"
        >
          {closeLabel}
        </button>
      </div>
      <p className="text-sm font-body text-forest-700">
        <EntityButton entity={left} onSelect={onSelectEntity} />
        <span className="text-ink-muted"> · </span>
        <EntityButton entity={right} onSelect={onSelectEntity} />
      </p>
      {model.kind === "membership" || model.kind === "seat" ? (
        <div className="text-sm font-body text-forest-700 space-y-1">
          <p>
            {model.relation}
            {model.role ? ` · ${model.role}` : ""}
          </p>
          {model.dates && (
            <p className="text-xs text-ink-muted">{model.dates}</p>
          )}
          {model.source_url && (
            <a
              href={model.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline hover:text-ink"
            >
              Source ↗
            </a>
          )}
        </div>
      ) : null}
      {(model.kind === "org_affinity" || model.kind === "shared_boards") && (
        <div className="space-y-1.5">
          <p className="text-sm font-body text-forest-700">
            {model.shared ?? 0} {model.shared_label}
            {model.jaccard != null ? ` · Jaccard ${model.jaccard.toFixed(2)}` : ""}
          </p>
          {model.shared_items && model.shared_items.length > 0 ? (
            <ul className="text-sm font-body text-forest-700 space-y-0.5">
              {model.shared_items.map((item) => (
                <li key={item.id}>
                  <EntityButton entity={item} onSelect={onSelectEntity} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm font-body text-ink-muted">
              Shared names are not available for this edge.
            </p>
          )}
        </div>
      )}
      {model.kind === "stance" && (
        <div className="space-y-1.5 text-sm font-body text-forest-700">
          <p>{model.polarity_label}</p>
          {model.measure && <p>{model.measure}</p>}
          {(model.co_stance != null || model.opposed != null) && (
            <p className="text-xs text-ink-muted">
              {model.co_stance ?? 0} co-stance · {model.opposed ?? 0} oppose
              {model.shared != null ? ` · ${model.shared} shared issues` : ""}
            </p>
          )}
          {model.subjects && model.subjects.length > 0 && (
            <ul className="text-xs text-forest-600 space-y-0.5">
              {model.subjects.map((subject) => (
                <li key={subject}>{subject}</li>
              ))}
            </ul>
          )}
          {model.quote && (
            <p className="text-xs text-forest-600 leading-relaxed">“{model.quote}”</p>
          )}
          {model.source_url && (
            <a
              href={model.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs underline hover:text-ink"
            >
              Source ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default function WhyLinkedPanel({
  model,
  onClose,
  onSelectEntity,
  variant = "pane",
  className = "",
}: WhyLinkedPanelProps) {
  useEffect(() => {
    if (variant !== "sheet") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [variant, onClose]);

  if (variant === "sheet") {
    return (
      <div
        className="lg:hidden fixed inset-x-0 bottom-chrome z-40 max-h-[55%] bg-surface border-t border-line shadow-sheet flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Why linked"
      >
        <button
          type="button"
          className="flex-shrink-0 py-2 flex justify-center"
          onClick={onClose}
          aria-label="Close Why linked"
        >
          <span className="w-10 h-1 rounded-full bg-line" />
        </button>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
          <WhyLinkedBody
            model={model}
            onClose={onClose}
            onSelectEntity={onSelectEntity}
            closeLabel="✕"
          />
        </div>
      </div>
    );
  }

  return (
    <section
      className={`rounded-md border border-line bg-surface p-3 ${className}`}
      aria-label="Why linked"
    >
      <WhyLinkedBody
        model={model}
        onClose={onClose}
        onSelectEntity={onSelectEntity}
        closeLabel="✕"
      />
    </section>
  );
}
