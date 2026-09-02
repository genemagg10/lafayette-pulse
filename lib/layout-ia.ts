export const NAV_HEIGHT_PX = 56;

export const PRIMARY_NAV = [
  { href: "/", label: "Pulse", id: "pulse" },
  { href: "/map", label: "Map", id: "map" },
  { href: "/calendar", label: "Calendar", id: "calendar" },
  { href: "/who", label: "Who", id: "who" },
] as const;

export type PrimaryNavId = (typeof PRIMARY_NAV)[number]["id"];

export const WHO_TABS = [
  { id: "people", label: "People" },
  { id: "orgs", label: "Organizations" },
  { id: "measures", label: "Measures" },
] as const;

export type WhoTab = (typeof WHO_TABS)[number]["id"];

export const FOOTPRINT_RANK_QUERY = "footprint";
export const WHO_FOOTPRINT_REDIRECT = "/who?tab=people&rank=footprint";

export const MORE_LINKS = [
  { href: "/projects", label: "Project archive", description: "City projects by category" },
  {
    href: "/ask",
    label: "Ask Lafayette AI",
    description: "Questions about projects and meetings",
  },
  { href: "/more", label: "Health & freshness", description: "Backend status and last scrape" },
] as const;

/** Old Pulse Board accordion hashes / query values → Layout IA v2 routes. */
export const BOARD_REDIRECTS: Record<string, string> = {
  map: "/map",
  "tile-map": "/map",
  calendar: "/calendar",
  "tile-calendar": "/calendar",
  people: "/who?tab=people",
  "tile-people": "/who?tab=people",
  organizations: "/who?tab=orgs",
  orgs: "/who?tab=orgs",
  "tile-organizations": "/who?tab=orgs",
  measures: "/who?tab=measures",
  "tile-measures": "/who?tab=measures",
  footprint: WHO_FOOTPRINT_REDIRECT,
  projects: "/projects",
  "tile-projects": "/projects",
};

export function parseWhoTab(value: string | null | undefined): WhoTab {
  if (value === "orgs" || value === "organizations") return "orgs";
  if (value === "measures") return "measures";
  return "people";
}

export function isRetiredFootprintTab(value: string | null | undefined): boolean {
  return value === "footprint";
}

export function isFocusPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname === "/map" ||
    pathname === "/calendar" ||
    pathname === "/who" ||
    pathname.startsWith("/who/")
  );
}

export function resolveBoardRedirect(
  hash: string,
  search: string
): string | null {
  const hashKey = hash.replace(/^#/, "").trim().toLowerCase();
  if (hashKey && BOARD_REDIRECTS[hashKey]) return BOARD_REDIRECTS[hashKey];

  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const tile = (params.get("tile") || params.get("board") || "").toLowerCase();
  if (tile && BOARD_REDIRECTS[tile]) return BOARD_REDIRECTS[tile];
  if ((params.get("tab") || "").toLowerCase() === "footprint") {
    return WHO_FOOTPRINT_REDIRECT;
  }
  return null;
}
