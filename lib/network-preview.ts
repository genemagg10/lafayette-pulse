/** First whitespace-separated token — “Carl Anduri” → “Carl”. */
export function givenName(fullName: string): string {
  const part = fullName.trim().split(/\s+/).find(Boolean);
  return part || fullName.trim();
}

export const NETWORK_PREVIEW_FALLBACK_LABEL = "View Network Map";

/** Mobile list door (unselected). Same Title Case as the person/org cards. */
export const PEOPLE_NETWORK_LIST_LABEL = "People Network Map";
export const ORGS_NETWORK_LIST_LABEL = "Organizations Network Map";

/** Quiet well on the shared mobile Who card. Label must fit beside it. */
export const WHO_NETWORK_WELL_SIZE = 44;

export type WhoNetworkDoor = "list" | "person" | "org";
export type WhoNetworkSchematic = "overview" | "person" | "org";

/**
 * Same chrome on every door. Only the drawing in the well changes.
 * List doors use the unselected overview (no ego). Person/org keep ego.
 */
export function whoNetworkSchematic(
  door: WhoNetworkDoor
): WhoNetworkSchematic {
  return door === "list" ? "overview" : door;
}

/** UUID / scrape-shaped tokens must never become the visible label. */
export function looksLikeScrapeId(value: string): boolean {
  const token = value.trim();
  if (!token) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    token
  );
}

/** Person: “Carl Anduri” → “Carl's Network Map”. */
export function personNetworkPreviewLabel(fullName: string): string {
  const first = givenName(fullName);
  if (looksLikeScrapeId(first)) return NETWORK_PREVIEW_FALLBACK_LABEL;
  return `${first}'s Network Map`;
}

/** Organization: “Lafayette Chamber of Commerce Network Map”. */
export function orgNetworkPreviewLabel(orgName: string): string {
  const name = orgName.trim();
  if (looksLikeScrapeId(name)) return NETWORK_PREVIEW_FALLBACK_LABEL;
  return `${name} Network Map`;
}

/**
 * Named line when it fits the control; otherwise the whole-control fallback.
 * Never ellipsis, never a truncated name, never a scrape id.
 */
export function resolveNetworkPreviewLabel(
  preferred: string,
  fits: boolean
): string {
  if (!fits || looksLikeScrapeId(preferred)) {
    return NETWORK_PREVIEW_FALLBACK_LABEL;
  }
  return preferred;
}

export function networkPreviewFits(box: {
  availableWidth: number;
  availableHeight: number;
  contentWidth: number;
  contentHeight: number;
}): boolean {
  return (
    box.contentWidth <= box.availableWidth &&
    box.contentHeight <= box.availableHeight
  );
}
