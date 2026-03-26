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
  | "manual";

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
