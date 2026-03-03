"""
Classify extracted text using the Claude API.
Reads texts saved by scrape-agendas.py (from agendas, calendars, and news),
sends them to Claude for structured extraction, and stores results in Supabase.

Only extracts upcoming/future-relevant items.
"""

import os
import sys
import json
import glob
from datetime import datetime, date

import anthropic
from supabase import create_client

from geocode import geocode

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

CLAUDE_MODEL = "claude-sonnet-4-20250514"

SYSTEM_PROMPT = f"""You are analyzing city government documents, meeting calendars, and news for Lafayette, California.
Today's date is {date.today().isoformat()}.

IMPORTANT: Only extract items that are UPCOMING, CURRENT, or IN-PROGRESS. Skip anything that has already concluded or is purely historical. Focus on what is happening now or in the future.

Extract ALL relevant items related to these categories:
- bike_ped: Bike lanes, crosswalks, pedestrian signals, ADA improvements, bicycle infrastructure
- safe_routes: Safe Routes to School programs, school zone safety, walking school buses, crossing guards
- street_quieting: Speed reduction, traffic calming, speed cushions, chicanes, radar signs, cut-through traffic
- infrastructure: Road repaving, drainage, signal upgrades, intersection redesigns, construction projects
- parks_trails: Trail improvements, park renovations, open space, recreation facilities
- city_council: Notable policy decisions, resolutions, budget items, public hearings, upcoming meetings related to transportation, public safety, or community development

For each item, return JSON:
{{
  "items": [
    {{
      "title": "Short descriptive title",
      "description": "2-3 sentence summary of what this item involves and when it is happening",
      "category": "bike_ped|safe_routes|street_quieting|infrastructure|parks_trails|city_council",
      "location": "Street names or area mentioned, if any",
      "funding": "Dollar amounts or funding sources mentioned, if any",
      "timeline": "Any dates or timeline mentioned (meetings, deadlines, construction dates)",
      "status": "proposed|approved|in_progress|completed based on context",
      "tags": ["relevant", "keyword", "tags"],
      "source_type": "agenda|news|calendar|report"
    }}
  ]
}}

Guidelines:
- Only include items relevant to the categories above
- Skip routine administrative items, personnel matters, consent calendar items unrelated to infrastructure
- For calendar/meeting entries, extract the meeting purpose, date, and any agenda topics
- For news items, extract project announcements, construction updates, public notices
- If a document mentions an upcoming public hearing or community meeting, include it
- Return ONLY valid JSON with no other text"""


def init_clients():
    """Initialize Supabase and Anthropic clients."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        sys.exit(1)
    if not ANTHROPIC_API_KEY:
        print("ERROR: ANTHROPIC_API_KEY must be set.")
        sys.exit(1)

    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return supabase, claude


def classify_text(claude, text: str, body: str) -> list[dict]:
    """Send text to Claude for classification and extraction."""
    # Truncate very long documents to stay within context limits
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


def fuzzy_match_project(supabase, title: str, location: str | None) -> int | None:
    """
    Check if an extracted item matches an existing project.
    Uses simple string comparison on title and location.
    Returns the project ID if a match is found, None otherwise.
    """
    result = supabase.table("projects").select("id, title, location_name").execute()

    if not result.data:
        return None

    title_lower = title.lower().strip()
    location_lower = (location or "").lower().strip()

    for project in result.data:
        project_title = project["title"].lower().strip()
        project_location = (project.get("location_name") or "").lower().strip()

        # Check for title similarity: one contains the other
        if (
            title_lower in project_title
            or project_title in title_lower
        ):
            return project["id"]

        # Check for location overlap with significant words
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


def store_item(supabase, item: dict, body: str, meeting_date: str | None,
               source_url: str) -> bool:
    """
    Store a classified item in the database.
    Creates a new project or adds an update to an existing one.
    """
    title = item.get("title", "Untitled")
    description = item.get("description", "")
    category = item.get("category", "city_council")
    location = item.get("location")
    funding = item.get("funding")
    timeline = item.get("timeline")
    status = item.get("status", "proposed")
    tags = item.get("tags", [])
    source_type = item.get("source_type", "agenda")

    # Validate category
    valid_categories = [
        "bike_ped", "safe_routes", "street_quieting",
        "city_council", "infrastructure", "parks_trails",
    ]
    if category not in valid_categories:
        category = "city_council"

    # Validate status
    valid_statuses = ["proposed", "approved", "in_progress", "completed", "on_hold"]
    if status not in valid_statuses:
        status = "proposed"

    # Validate source_type
    valid_source_types = ["agenda", "minutes", "committee", "budget", "report", "news", "manual"]
    if source_type not in valid_source_types:
        source_type = "agenda"

    # Check for existing project match
    existing_project_id = fuzzy_match_project(supabase, title, location)

    if existing_project_id:
        # Add update to existing project
        print(f"  Matched to existing project #{existing_project_id}: {title}")
        supabase.table("project_updates").insert({
            "project_id": existing_project_id,
            "update_text": description,
            "source_url": source_url,
            "source_type": source_type,
            "source_date": meeting_date,
        }).execute()

        # Touch the project's updated_at
        supabase.table("projects").update({
            "updated_at": datetime.now().isoformat(),
        }).eq("id", existing_project_id).execute()

    else:
        # Create new project
        print(f"  Creating new project: {title}")

        # Geocode the location
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

        result = supabase.table("projects").insert(project_data).execute()
        new_project_id = result.data[0]["id"] if result.data else None

        # Also create an agenda item
        supabase.table("agenda_items").insert({
            "date": meeting_date or datetime.now().strftime("%Y-%m-%d"),
            "body": body,
            "title": title,
            "description": description,
            "category": category,
            "linked_project": new_project_id,
            "source_url": source_url,
            "tags": tags,
        }).execute()

    return True


def main():
    print("=" * 60)
    print("Lafayette Pulse — Claude Classification")
    print(f"Run time: {datetime.now().isoformat()}")
    print("=" * 60)

    supabase, claude = init_clients()

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

        # Classify with Claude
        items = classify_text(claude, text, body)

        # Store each item
        for item in items:
            store_item(supabase, item, body, meeting_date, source_url)
            total_items += 1

        # Update scraped_sources with item count
        supabase.table("scraped_sources").update({
            "items_extracted": len(items),
            "status": "success",
        }).eq("url", source_url).execute()

        # Remove processed file
        os.remove(filepath)
        print()

    print(f"{'=' * 60}")
    print(f"Classification complete. {total_items} item(s) processed.")
    print("=" * 60)


if __name__ == "__main__":
    main()
