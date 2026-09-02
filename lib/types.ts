export type ProjectCategory =
  | "transportation"
  | "government"
  | "development"
  | "parks_environment"
  | "public_safety"
  | "community"
  | "jobs"
  | "news";

export type ProjectStatus =
  | "proposed"
  | "approved"
  | "in_progress"
  | "completed"
  | "on_hold";

export type SourceType =
  | "agenda"
  | "minutes"
  | "committee"
  | "budget"
  | "report"
  | "news"
  | "manual"
  | "calendar";

export interface Project {
  id: number;
  title: string;
  description: string | null;
  category: ProjectCategory;
  status: ProjectStatus;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  start_date: string | null;
  end_date: string | null;
  timeline_text: string | null;
  funding_source: string | null;
  estimated_cost: number | null;
  source_url: string | null;
  source_type: SourceType;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Joined fields
  latest_update?: string;
}

export interface ProjectUpdate {
  id: number;
  project_id: number;
  update_text: string;
  source_url: string | null;
  source_type: SourceType;
  source_date: string | null;
  extracted_at: string;
  created_at: string;
  // Joined fields
  project_title?: string;
  project_category?: ProjectCategory;
}

export interface AgendaItem {
  id: number;
  date: string;
  body: string;
  title: string;
  description: string | null;
  category: ProjectCategory | null;
  linked_project: number | null;
  source_url: string | null;
  tags: string[];
  created_at: string;
}

export interface ScrapedSource {
  id: number;
  url: string;
  filename: string | null;
  body: string | null;
  meeting_date: string | null;
  scraped_at: string;
  items_extracted: number;
  status: string;
}

export interface ProjectsApiParams {
  category?: string;
  status?: string;
  search?: string;
  bbox?: string;
}

export interface ChatSource {
  title: string;
  sourceUrl: string | null;
  meetingBody: string | null;
  meetingDate: string | null;
  category: string | null;
}

export interface HealthCounts {
  projects: number | null;
  agenda_items: number | null;
  document_chunks: number | null;
  people: number | null;
  organizations: number | null;
  memberships: number | null;
  seat_holders: number | null;
  measures: number | null;
  stances: number | null;
}

export interface HealthResponse {
  ok: boolean;
  supabase_reachable: boolean;
  counts: HealthCounts;
  last_scraped_at: string | null;
  checked_at: string;
}

export type OrgType =
  | "civic"
  | "interest"
  | "city_body"
  | "campaign"
  | "foundation"
  | "other";

export type SeatType = "elected" | "appointed" | "staff" | "other";

export type EventType =
  | "meeting"
  | "community"
  | "election"
  | "deadline"
  | "other";

export type MeasureStatus =
  | "proposed"
  | "qualified"
  | "on_ballot"
  | "passed"
  | "failed"
  | "withdrawn";

export type CandidacyStatus =
  | "exploring"
  | "declared"
  | "qualified"
  | "elected"
  | "lost"
  | "withdrawn";

export interface Organization {
  id: string;
  name: string;
  slug: string;
  org_type: OrgType;
  description: string | null;
  website: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  member_count?: number;
  current_member_count?: number;
}

export interface PersonRoleSummary {
  org_name: string;
  role: string | null;
  is_seat: boolean;
}

export interface Person {
  id: string;
  full_name: string;
  bio: string | null;
  photo_url: string | null;
  email: string | null;
  website: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  membership_count?: number;
  seat_count?: number;
  current_roles?: PersonRoleSummary[];
}

export interface CivicEvent {
  id: string;
  title: string;
  description: string | null;
  event_type: EventType;
  body: string | null;
  organization_id: string | null;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  source_url: string | null;
  linked_project_id: number | null;
  category: ProjectCategory | null;
  created_at: string;
  updated_at: string;
}

export interface Measure {
  id: string;
  title: string;
  short_code: string | null;
  summary: string | null;
  status: MeasureStatus;
  election_date: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
  support_count?: number;
  oppose_count?: number;
  endorse_count?: number;
  stance_count?: number;
}

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  civic: "Civic Group",
  interest: "Interest Group",
  city_body: "City Body",
  campaign: "Campaign",
  foundation: "Foundation",
  other: "Other",
};
