// ─── Top-level categories ──────────────────────────────────────────
// These map to the City of Lafayette email subscription topics, grouped
// into broader buckets.  Each category can have subcategories (below)
// that provide finer-grained nesting inside the GroupedProjectList.

export const CATEGORIES = {
  transportation: {
    label: "Transportation & Circulation",
    color: "#2D9CDB",
    icon: "🚦",
    description:
      "Bike lanes, pedestrian safety, traffic calming, safe routes to school, transit",
  },
  government: {
    label: "City Government",
    color: "#9B51E0",
    icon: "🏛️",
    description:
      "City Council, commissions, boards, planning, zoning, public meetings",
  },
  development: {
    label: "Development & Housing",
    color: "#EB5757",
    icon: "🏗️",
    description:
      "Capital projects, affordable housing, General Plan, building & design review",
  },
  parks_environment: {
    label: "Parks & Environment",
    color: "#219653",
    icon: "🌳",
    description:
      "Parks, trails, recreation, creeks, environmental initiatives, open space",
  },
  public_safety: {
    label: "Public Safety",
    color: "#F2994A",
    icon: "🛡️",
    description:
      "Crime prevention, emergency preparedness, code enforcement",
  },
  community: {
    label: "Community & Culture",
    color: "#E91E8C",
    icon: "🎭",
    description:
      "Arts, public events, youth & senior services, community programs",
  },
  jobs: {
    label: "Jobs & Volunteering",
    color: "#6B7280",
    icon: "💼",
    description:
      "City jobs, internships, volunteer opportunities",
  },
  news: {
    label: "News & Updates",
    color: "#0EA5E9",
    icon: "📰",
    description:
      "City briefings, newsletters, fiscal updates, general announcements",
  },
} as const;

export type ProjectCategory = keyof typeof CATEGORIES;

// ─── Subcategories ─────────────────────────────────────────────────
// Used for nested grouping inside the project list.  The classifier
// includes these as the first element of the `tags` array so the UI
// can group related-but-not-identical topics under the same category.

export interface Subcategory {
  key: string;
  label: string;
}

export const SUBCATEGORIES: Record<ProjectCategory, Subcategory[]> = {
  transportation: [
    { key: "bike_ped", label: "Bike & Pedestrian" },
    { key: "safe_routes", label: "Safe Routes to School" },
    { key: "traffic_calming", label: "Traffic Calming & Street Quieting" },
    { key: "transit", label: "Transit & BART" },
    { key: "school_bus", label: "Lamorinda School Bus" },
  ],
  government: [
    { key: "city_council", label: "City Council" },
    { key: "planning", label: "Planning Commission" },
    { key: "design_review", label: "Design Review Commission" },
    { key: "commissions", label: "Other Commissions & Boards" },
    { key: "public_meetings", label: "Public Meetings" },
  ],
  development: [
    { key: "housing", label: "Affordable Housing (BMR)" },
    { key: "capital_projects", label: "Capital Projects" },
    { key: "general_plan", label: "General Plan Update" },
    { key: "zoning", label: "Zoning & SB 9" },
  ],
  parks_environment: [
    { key: "parks_trails", label: "Parks & Trails" },
    { key: "creeks", label: "Creeks & Waterways" },
    { key: "environment", label: "Environmental" },
    { key: "recreation", label: "Recreation" },
  ],
  public_safety: [
    { key: "crime_prevention", label: "Crime Prevention" },
    { key: "emergency_prep", label: "Emergency Preparedness" },
    { key: "code_enforcement", label: "Code Enforcement" },
  ],
  community: [
    { key: "arts_culture", label: "Arts & Culture" },
    { key: "events", label: "Public Events" },
    { key: "youth", label: "Youth Services" },
    { key: "seniors", label: "Senior Services" },
  ],
  jobs: [
    { key: "city_jobs", label: "City Jobs" },
    { key: "internships", label: "Internships" },
    { key: "volunteer", label: "Volunteer Opportunities" },
  ],
  news: [
    { key: "briefing", label: "Daily Briefing" },
    { key: "newsletter", label: "Newsletters" },
    { key: "general_news", label: "General News" },
  ],
};

// ─── Status styles ─────────────────────────────────────────────────

export const STATUS_STYLES = {
  proposed: { label: "Proposed", color: "#828282", bg: "#F2F2F2" },
  approved: { label: "Approved", color: "#2D9CDB", bg: "#E8F4FD" },
  in_progress: { label: "In Progress", color: "#F2994A", bg: "#FEF3E5" },
  completed: { label: "Completed", color: "#27AE60", bg: "#E6F7ED" },
  on_hold: { label: "On Hold", color: "#EB5757", bg: "#FDECEC" },
} as const;

export type ProjectStatus = keyof typeof STATUS_STYLES;
