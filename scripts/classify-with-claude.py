"""
Classify extracted text using the Claude API.
Reads texts saved by scrape-agendas.py (from agendas, calendars, and news),
sends them to Claude for structured extraction, and stores results in Supabase.

Only extracts upcoming/future-relevant items.

Uses direct Supabase REST API (PostgREST) to avoid heavy SDK dependencies.
"""

import os
import sys
import json
import glob
from datetime import datetime, date

import anthropic
import requests

from geocode import geocode

# Configuration — accept multiple env var naming conventions
SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    or ""
)
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or ""
)
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

CLAUDE_MODEL = "claude-sonnet-4-20250514"

SYSTEM_PROMPT = f"""You are analyzing city government documents, meeting calendars, and news for Lafayette, California.
Today's date is {date.today().isoformat()}.

IMPORTANT: Only extract items that are UPCOMING, CURRENT, or IN-PROGRESS. Skip anything that has already concluded or is purely historical. Focus on what is happening now or in the future.

The content you receive is extracted from emails sent by the City of Lafayette. The emails often contain links to city web pages, agendas, meeting details, and project information. Pay attention to these links.

The emails come from these City of Lafayette subscription topics:
  Affordable Housing (BMR), All Public Meetings, Arts & Culture, Banner Advisory Board,
  Capital Projects Assessment Committee, City Council, City Council Subcommittees,
  Code Enforcement Appeals Board, Community Center Foundation, Creeks Committee,
  Crime Prevention Commission, Design Review Commission, DSIMPIC,
  Emergency Preparedness Commission, Environmental Task Force, General Plan Update,
  Lamorinda Fee & Finance Authority, Lamorinda Program Management Committee,
  Lamorinda School Bus, Parks Trails & Recreation Commission, Planning Commission,
  Project - Terraces of Lafayette, Public Art Committee, Public Events,
  SB 9 Objective Standards, Senior Services Commission,
  Transportation & Circulation Commission, Youth Services Commission,
  Zoning Administrator, City Jobs, Internships, Volunteer Opportunities,
  Almost Daily Briefing, BART Bike Station/Pathway Project, Fiscal Sustainability,
  General News, The Weekly Roundup, Vistas Newsletter.

Classify every item into ONE of these categories:
- transportation: Bike lanes, crosswalks, pedestrian safety, traffic calming, safe routes to school, speed cushions, radar signs, cut-through traffic, BART pathway, school buses, transit, ADA improvements, complete streets
- government: City Council meetings, resolutions, policy decisions, budget items, public hearings, Planning Commission, Design Review Commission, Zoning Administrator, commissions & boards, Lamorinda committees, DSIMPIC
- development: Capital projects, affordable housing (BMR), General Plan Update, SB 9, building permits, Terraces of Lafayette, intersection redesigns, road repaving, drainage, fiscal sustainability
- parks_environment: Trail improvements, park renovations, open space, recreation facilities, Creeks Committee, Environmental Task Force, environmental initiatives
- public_safety: Crime Prevention Commission, Emergency Preparedness Commission, code enforcement, public safety programs
- community: Arts & culture, public art, public events, youth services, senior services, community center, Banner Advisory Board
- jobs: City jobs, internships, volunteer opportunities
- news: Almost Daily Briefing, Weekly Roundup, Vistas Newsletter, general news, city announcements

For each item, also assign a subcategory tag as the FIRST tag in the tags array.
Known subcategory tags by category:
- transportation: bike_ped, safe_routes, traffic_calming, transit, school_bus
- government: city_council, planning, design_review, commissions, public_meetings
- development: housing, capital_projects, general_plan, zoning
- parks_environment: parks_trails, creeks, environment, recreation
- public_safety: crime_prevention, emergency_prep, code_enforcement
- community: arts_culture, events, youth, seniors
- jobs: city_jobs, internships, volunteer
- news: briefing, newsletter, general_news

For each item, return JSON:
{{
  "items": [
    {{
      "title": "Short descriptive title",
      "description": "2-3 sentence summary of what this item involves and when it is happening",
      "category": "transportation|government|development|parks_environment|public_safety|community|jobs|news",
      "location": "Street names or area mentioned, if any",
      "funding": "Dollar amounts or funding sources mentioned, if any",
      "timeline": "Any dates or timeline mentioned (meetings, deadlines, construction dates)",
      "status": "proposed|approved|in_progress|completed based on context",
      "tags": ["subcategory_tag", "other", "relevant", "tags"],
      "source_type": "agenda|news|calendar|report",
      "source_url": "The most relevant http/https URL from the document for this specific item, or null if none found"
    }}
  ]
}}

Guidelines:
- Extract ALL noteworthy items — not just infrastructure.  Include meetings, events, job postings, news summaries, and community programs.
- For calendar/meeting entries, extract the meeting purpose, date, and any agenda topics
- For news items, extract project announcements, construction updates, public notices
- If a document mentions an upcoming public hearing or community meeting, include it
- The FIRST tag must be a known subcategory tag from the list above
- IMPORTANT: For source_url, look for http/https links in the document text (especially in the LINKS FOUND IN EMAIL section) that are most relevant to each extracted item. Use the most specific link available (e.g. a link to a specific agenda page rather than a generic homepage)
- Return ONLY valid JSON with no other text"""


# ─── Supabase REST API helpers ────────────────────────────────────────

def supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def supabase_select(table: str, params: dict) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.get(url, headers=supabase_headers(), params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def supabase_insert(table: str, data: dict) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.post(url, headers=supabase_headers(), json=data, timeout=15)
    resp.raise_for_status()
    return resp.json()


def supabase_update(table: str, data: dict, match_col: str, match_val) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    params = {match_col: f"eq.{match_val}"}
    headers = supabase_headers()
    resp = requests.patch(url, headers=headers, json=data, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


# ─── Core logic ───────────────────────────────────────────────────────

def check_table_exists(table: str) -> bool:
    """Check if a table exists by querying it."""
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        resp = requests.get(url, headers=supabase_headers(),
                            params={"select": "id", "limit": "0"}, timeout=10)
        return resp.status_code != 404
    except Exception:
        return False


def init_clients():
    """Initialize and validate clients."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        sys.exit(1)
    if not ANTHROPIC_API_KEY:
        print("ERROR: ANTHROPIC_API_KEY must be set.")
        sys.exit(1)

    # Check required tables
    required = ["projects", "project_updates", "agenda_items", "scraped_sources"]
    missing = [t for t in required if not check_table_exists(t)]
    if missing:
        print(f"\nERROR: Missing database tables: {', '.join(missing)}")
        print("Please run the migration SQL in your Supabase SQL Editor:")
        print("  File: supabase/migrations/001_initial_schema.sql")
        print("  Go to: https://supabase.com/dashboard → SQL Editor → paste & run")
        sys.exit(1)
    print(f"  All required tables verified: {', '.join(required)}")

    claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return claude


def classify_text(claude, text: str, body: str) -> list[dict]:
    """Send text to Claude for classification and extraction."""
    max_chars = 100000
    if len(text) > max_chars:
        text = text[:max_chars] + "\n\n[Document truncated...]"

    user_message = f"""Analyze this document from the {body} of Lafayette, California.
Extract all upcoming/current relevant items as described in your instructions.

DOCUMENT TEXT:
{text}"""

    try:
        response = claude.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )

        response_text = response.content[0].text.strip()

        # Handle potential markdown code blocks
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1])

        data = json.loads(response_text)
        items = data.get("items", [])
        print(f"  Claude extracted {len(items)} relevant item(s)")
        return items

    except json.JSONDecodeError as e:
        print(f"  Error parsing Claude response as JSON: {e}")
        return []
    except anthropic.APIError as e:
        print(f"  Claude API error: {e}")
        return []


def fuzzy_match_project(title: str, location: str | None) -> int | None:
    """Check if an extracted item matches an existing project."""
    projects = supabase_select("projects", {
        "select": "id,title,location_name",
    })

    if not projects:
        return None

    title_lower = title.lower().strip()
    location_lower = (location or "").lower().strip()

    for project in projects:
        project_title = project["title"].lower().strip()
        project_location = (project.get("location_name") or "").lower().strip()

        if title_lower in project_title or project_title in title_lower:
            return project["id"]

        if location_lower and project_location:
            title_words = set(title_lower.split()) - {
                "the", "a", "an", "of", "in", "on", "at", "to", "for", "and",
            }
            project_words = set(project_title.split()) - {
                "the", "a", "an", "of", "in", "on", "at", "to", "for", "and",
            }

            common_words = title_words & project_words
            if len(common_words) >= 2 and (
                location_lower in project_location
                or project_location in location_lower
            ):
                return project["id"]

    return None


def store_item(item: dict, body: str, meeting_date: str | None,
               source_url: str) -> bool:
    """Store a classified item in the database."""
    title = item.get("title", "Untitled")
    description = item.get("description", "")
    category = item.get("category", "city_council")
    location = item.get("location")
    funding = item.get("funding")
    timeline = item.get("timeline")
    status = item.get("status", "proposed")
    tags = item.get("tags", [])
    source_type = item.get("source_type", "agenda")

    # Prefer the URL Claude extracted from the document content over the
    # email:// URI passed in as the fallback source_url
    item_url = item.get("source_url")
    if item_url and item_url.startswith(("http://", "https://")):
        source_url = item_url

    valid_categories = [
        "transportation", "government", "development",
        "parks_environment", "public_safety", "community",
        "jobs", "news",
    ]
    if category not in valid_categories:
        category = "government"

    valid_statuses = ["proposed", "approved", "in_progress", "completed", "on_hold"]
    if status not in valid_statuses:
        status = "proposed"

    valid_source_types = ["agenda", "minutes", "committee", "budget", "report", "news", "manual"]
    if source_type not in valid_source_types:
        source_type = "agenda"

    existing_project_id = fuzzy_match_project(title, location)

    if existing_project_id:
        print(f"  Matched to existing project #{existing_project_id}: {title}")
        supabase_insert("project_updates", {
            "project_id": existing_project_id,
            "update_text": description,
            "source_url": source_url,
            "source_type": source_type,
            "source_date": meeting_date,
        })
        supabase_update("projects", {
            "updated_at": datetime.now().isoformat(),
        }, "id", existing_project_id)

    else:
        print(f"  Creating new project: {title}")

        lat, lng = None, None
        if location:
            coords = geocode(location)
            if coords:
                lat, lng = coords
                print(f"    Geocoded to ({lat:.4f}, {lng:.4f})")

        project_data = {
            "title": title,
            "description": description,
            "category": category,
            "status": status,
            "location_name": location,
            "latitude": lat,
            "longitude": lng,
            "timeline_text": timeline,
            "funding_source": funding,
            "source_url": source_url,
            "source_type": source_type,
            "tags": tags,
        }

        result = supabase_insert("projects", project_data)
        new_project_id = result[0]["id"] if result else None

        supabase_insert("agenda_items", {
            "date": meeting_date or datetime.now().strftime("%Y-%m-%d"),
            "body": body,
            "title": title,
            "description": description,
            "category": category,
            "linked_project": new_project_id,
            "source_url": source_url,
            "tags": tags,
        })

    return True


def main():
    print("=" * 60)
    print("Lafayette Pulse — Claude Classification")
    print(f"Run time: {datetime.now().isoformat()}")
    print("=" * 60)

    claude = init_clients()

    # Find extracted texts
    texts_dir = os.path.join(os.path.dirname(__file__), ".agenda_texts")
    if not os.path.exists(texts_dir):
        print("No extracted texts found. Run scrape-agendas.py first.")
        return

    json_files = glob.glob(os.path.join(texts_dir, "*.json"))
    if not json_files:
        print("No extracted text files found.")
        return

    print(f"Found {len(json_files)} text file(s) to classify.\n")
    total_items = 0

    for filepath in json_files:
        print(f"Processing: {os.path.basename(filepath)}")

        with open(filepath) as f:
            data = json.load(f)

        body = data["body"]
        meeting_date = data.get("meeting_date")
        source_url = data["source_url"]
        text = data["text"]

        items = classify_text(claude, text, body)

        for item in items:
            store_item(item, body, meeting_date, source_url)
            total_items += 1

        # Update scraped_sources with item count
        supabase_update("scraped_sources", {
            "items_extracted": len(items),
            "status": "success",
        }, "url", source_url)

        # Remove processed file
        os.remove(filepath)
        print()

    print(f"{'=' * 60}")
    print(f"Classification complete. {total_items} item(s) processed.")
    print("=" * 60)


if __name__ == "__main__":
    main()
