/** First whitespace-separated token — “Carl Anduri” → “Carl”. */
export function givenName(fullName: string): string {
  const part = fullName.trim().split(/\s+/).find(Boolean);
  return part || fullName.trim();
}

export const NETWORK_PREVIEW_FALLBACK_LABEL = "View Network Map";

/** Mobile list door (unselected). Not the selected-person / selected-org card. */
export const PEOPLE_NETWORK_LIST_LABEL = "People network map";
export const ORGS_NETWORK_LIST_LABEL = "Organizations network map";

/** Person: “Carl Anduri” → “Carl's Network Map”. */
export function personNetworkPreviewLabel(fullName: string): string {
  return `${givenName(fullName)}'s Network Map`;
}

/** Organization: “Lafayette Chamber of Commerce Network Map”. */
export function orgNetworkPreviewLabel(orgName: string): string {
  const name = orgName.trim() || orgName;
  return `${name} Network Map`;
}

/**
 * Named line when it fits the control; otherwise the whole-control fallback.
 * Never ellipsis, never a truncated name.
 */
export function resolveNetworkPreviewLabel(
  preferred: string,
  fits: boolean
): string {
  return fits ? preferred : NETWORK_PREVIEW_FALLBACK_LABEL;
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
