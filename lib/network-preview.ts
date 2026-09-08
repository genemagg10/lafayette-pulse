/** First whitespace-separated token — “Carl Anduri” → “Carl”. */
export function givenName(fullName: string): string {
  const part = fullName.trim().split(/\s+/).find(Boolean);
  return part || fullName.trim();
}

export function personNetworkPreviewLabel(fullName: string): string {
  return `See who sits with ${givenName(fullName)}`;
}

export function orgNetworkPreviewLabel(orgName: string): string {
  return `See who overlaps ${orgName}`;
}
