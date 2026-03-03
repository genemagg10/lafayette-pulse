export const CATEGORIES = {
  bike_ped: {
    label: "Bike & Pedestrian Safety",
    color: "#2D9CDB",
    icon: "🚲",
    description:
      "Bike lanes, crosswalks, pedestrian signals, ADA improvements",
  },
  safe_routes: {
    label: "Safe Routes to School",
    color: "#27AE60",
    icon: "🏫",
    description:
      "Walking buses, school zone improvements, crossing guards, SRTS grants",
  },
  street_quieting: {
    label: "Street Quieting / Traffic Calming",
    color: "#F2994A",
    icon: "🛑",
    description:
      "Speed cushions, chicanes, radar signs, traffic circles, bulb-outs",
  },
  city_council: {
    label: "City Council Updates",
    color: "#9B51E0",
    icon: "🏛️",
    description:
      "Resolutions, policy decisions, budget approvals, study sessions",
  },
  infrastructure: {
    label: "Road & Infrastructure",
    color: "#EB5757",
    icon: "🚧",
    description:
      "Repaving, drainage, signals, intersection redesigns",
  },
  parks_trails: {
    label: "Parks & Trails",
    color: "#219653",
    icon: "🌳",
    description:
      "Trail improvements, park renovations, open space projects",
  },
} as const;

export const STATUS_STYLES = {
  proposed: { label: "Proposed", color: "#828282", bg: "#F2F2F2" },
  approved: { label: "Approved", color: "#2D9CDB", bg: "#E8F4FD" },
  in_progress: { label: "In Progress", color: "#F2994A", bg: "#FEF3E5" },
  completed: { label: "Completed", color: "#27AE60", bg: "#E6F7ED" },
  on_hold: { label: "On Hold", color: "#EB5757", bg: "#FDECEC" },
} as const;

export type ProjectCategory = keyof typeof CATEGORIES;
export type ProjectStatus = keyof typeof STATUS_STYLES;
