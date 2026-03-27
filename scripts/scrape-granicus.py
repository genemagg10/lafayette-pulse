"""
Lafayette Pulse — Granicus RSS Feed Poller.

Fetches meeting data from the City of Lafayette's Granicus instance via
RSS feeds, extracts agenda content and attached documents, and saves
everything as JSON files for classify-with-claude.py to process.

Uses direct Supabase REST API (PostgREST) — no heavy SDK needed.
"""

import os
import re
import sys
import json
import time
import hashlib
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime
from urllib.parse import urljoin, urlparse, parse_qs

import requests
from bs4 import BeautifulSoup

# ─── Configuration ────────────────────────────────────────────────────

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

USER_AGENT = "Lafayette-Pulse/1.0 (civic-tracker)"
REQUEST_DELAY = 1.5  # seconds between requests

GRANICUS_BASE = "https://lafayette.granicus.com"

# RSS feeds to poll: (view_id, body_name)
RSS_FEEDS = [
    (42, "All Meetings"),
    (3,  "City Council"),
    (16, "Design Review Commission"),
    (19, "Planning Commission"),
]

# Agenda viewer uses view_id=2 for all bodies
AGENDA_VIEW_ID = 2

# Max retries for transient HTTP errors
MAX_RETRIES = 3
RETRY_DELAY = 5  # seconds


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


def supabase_upsert(table: str, data: dict, on_conflict: str = "url") -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = supabase_headers()
    headers["Prefer"] = "resolution=merge-duplicates,return=representation"
    resp = requests.post(url, headers=headers, json=data,
                         params={"on_conflict": on_conflict}, timeout=15)
    resp.raise_for_status()
    return resp.json()


def check_table_exists(table: str) -> bool:
    """Check if a table exists by querying it."""
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        resp = requests.get(url, headers=supabase_headers(),
                            params={"select": "id", "limit": "0"}, timeout=10)
        return resp.status_code != 404
    except Exception:
        return False


def init_supabase():
    """Validate Supabase credentials and check all required tables."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        print(f"  SUPABASE_URL = {'(set)' if SUPABASE_URL else '(empty)'}")
        print(f"  SUPABASE_SERVICE_KEY = {'(set)' if SUPABASE_KEY else '(empty)'}")
        sys.exit(1)

    try:
        url = f"{SUPABASE_URL}/rest/v1/"
        resp = requests.get(url, headers=supabase_headers(), timeout=10)
        print(f"  Connected to Supabase: {SUPABASE_URL}")
    except Exception as e:
        print(f"ERROR: Cannot connect to Supabase: {e}")
        sys.exit(1)

    required = ["scraped_sources", "projects", "project_updates", "agenda_items"]
    missing = [t for t in required if not check_table_exists(t)]
    if missing:
        print(f"\nERROR: Missing database tables: {', '.join(missing)}")
        print("Please run the migration SQL in your Supabase SQL Editor:")
        print("  File: supabase/migrations/001_initial_schema.sql")
        sys.exit(1)
    print(f"  All required tables verified: {', '.join(required)}")


def is_already_scraped(url: str) -> bool:
    try:
        results = supabase_select("scraped_sources", {
            "select": "id,status",
            "url": f"eq.{url}",
        })
        if not results:
            return False
        return results[0].get("status") not in ("classify_failed", "failed")
    except requests.HTTPError:
        return False


def record_scraped_source(url: str, filename: str, body: str,
                          meeting_date: str | None, items_extracted: int,
                          status: str = "extracted"):
    supabase_upsert("scraped_sources", {
        "url": url,
        "filename": filename,
        "body": body,
        "meeting_date": meeting_date,
        "items_extracted": items_extracted,
        "status": status,
    })


# ─── HTTP helpers ─────────────────────────────────────────────────────

def http_get(url: str, retries: int = MAX_RETRIES) -> requests.Response | None:
    """GET a URL with retries for transient failures."""
    headers = {"User-Agent": USER_AGENT}
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=headers, timeout=30)
            if resp.status_code == 200:
                return resp
            if resp.status_code in (429, 500, 502, 503, 504):
                print(f"    HTTP {resp.status_code} on attempt {attempt + 1}, retrying...")
                time.sleep(RETRY_DELAY * (attempt + 1))
                continue
            # Non-retryable error (404 etc.)
            return resp
        except requests.RequestException as e:
            print(f"    Request error on attempt {attempt + 1}: {e}")
            if attempt < retries - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
    return None


# ─── RSS parsing ──────────────────────────────────────────────────────

def parse_rss_feed(view_id: int, body_name: str) -> list[dict]:
    """
    Fetch and parse a Granicus RSS feed.
    Returns list of meeting entries with title, date, clip_id, body, source_url.
    """
    feed_url = f"{GRANICUS_BASE}/ViewPublisherRSS.php?view_id={view_id}&mode=podcast"
    print(f"\n  Fetching RSS feed: view_id={view_id} ({body_name})")

    resp = http_get(feed_url)
    if not resp or resp.status_code != 200:
        print(f"    Failed to fetch RSS feed (view_id={view_id})")
        return []

    entries = []
    try:
        root = ET.fromstring(resp.content)
    except ET.ParseError as e:
        print(f"    XML parse error: {e}")
        return []

    # RSS 2.0 format: channel > item
    for item in root.findall(".//item"):
        title_el = item.find("title")
        link_el = item.find("link")
        pub_date_el = item.find("pubDate")
        description_el = item.find("description")

        title = title_el.text.strip() if title_el is not None and title_el.text else ""
        link = link_el.text.strip() if link_el is not None and link_el.text else ""
        pub_date = pub_date_el.text.strip() if pub_date_el is not None and pub_date_el.text else ""
        description = description_el.text.strip() if description_el is not None and description_el.text else ""

        # Extract clip_id from MediaPlayer URL in link or enclosure
        clip_id = None
        if link:
            clip_id = extract_clip_id(link)

        # Also check enclosure URL
        if not clip_id:
            enclosure = item.find("enclosure")
            if enclosure is not None:
                enc_url = enclosure.get("url", "")
                clip_id = extract_clip_id(enc_url)

        # Also try extracting from description HTML
        if not clip_id and description:
            clip_match = re.search(r'clip_id=(\d+)', description)
            if clip_match:
                clip_id = int(clip_match.group(1))

        if not clip_id:
            continue

        # Parse the publication date
        meeting_date = parse_rss_date(pub_date)

        # Determine body name from title if this is the "All Meetings" feed
        detected_body = detect_body_from_title(title) if body_name == "All Meetings" else body_name

        source_url = f"{GRANICUS_BASE}/MediaPlayer.php?view_id={view_id}&clip_id={clip_id}"

        entries.append({
            "title": title,
            "meeting_date": meeting_date,
            "clip_id": clip_id,
            "body": detected_body,
            "source_url": source_url,
            "view_id": view_id,
        })

    print(f"    Found {len(entries)} meeting(s) in feed")
    return entries


def extract_clip_id(url: str) -> int | None:
    """Extract clip_id parameter from a Granicus URL."""
    try:
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        if "clip_id" in params:
            return int(params["clip_id"][0])
    except (ValueError, IndexError):
        pass
    return None


def parse_rss_date(date_str: str) -> str | None:
    """Parse an RSS pubDate into YYYY-MM-DD format."""
    if not date_str:
        return None
    # RSS dates are typically: "Mon, 15 Mar 2026 19:00:00 GMT"
    formats = [
        "%a, %d %b %Y %H:%M:%S %Z",
        "%a, %d %b %Y %H:%M:%S %z",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    # Fallback: try to find a date pattern in the string
    match = re.search(r'(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+(\d{4})', date_str)
    if match:
        try:
            dt = datetime.strptime(f"{match.group(1)} {match.group(2)} {match.group(3)}", "%d %b %Y")
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            pass

    return None


# ─── Body detection ───────────────────────────────────────────────────

BODY_KEYWORDS = {
    "city council": "City Council",
    "planning commission": "Planning Commission",
    "design review": "Design Review Commission",
    "circulation commission": "Circulation Commission",
    "parks, trails": "Parks & Recreation Commission",
    "parks & recreation": "Parks & Recreation Commission",
    "parks and recreation": "Parks & Recreation Commission",
    "oversight board": "Oversight Board",
    "crime prevention": "Crime Prevention Commission",
    "emergency preparedness": "Emergency Preparedness Commission",
    "environmental task force": "Environmental Task Force",
    "youth services": "Youth Services Commission",
    "senior services": "Senior Services Commission",
    "public art": "Public Art Committee",
    "creeks committee": "Creeks Committee",
}


def detect_body_from_title(title: str) -> str:
    """Detect the government body from a meeting title."""
    title_lower = title.lower()
    for keyword, body_name in BODY_KEYWORDS.items():
        if keyword in title_lower:
            return body_name
    return "City of Lafayette"


# ─── Agenda extraction ────────────────────────────────────────────────

def fetch_agenda(clip_id: int) -> dict | None:
    """
    Fetch and parse a GeneratedAgendaViewer page.
    Returns dict with 'items' list and 'full_text', or None on failure.
    """
    agenda_url = f"{GRANICUS_BASE}/GeneratedAgendaViewer.php?view_id={AGENDA_VIEW_ID}&clip_id={clip_id}"
    print(f"    Fetching agenda: clip_id={clip_id}")

    resp = http_get(agenda_url)
    if not resp or resp.status_code != 200:
        print(f"    No agenda found for clip_id={clip_id}")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Check if there's actual agenda content
    body_text = soup.get_text(strip=True)
    if len(body_text) < 100:
        print(f"    Agenda page has minimal content, skipping")
        return None

    agenda_items = []
    meta_viewer_links = []
    full_text_parts = []

    # Granicus agendas typically have rows/sections with item titles
    # Look for common agenda HTML structures

    # Strategy 1: Look for agenda item rows (common Granicus pattern)
    rows = soup.find_all("tr")
    for row in rows:
        cells = row.find_all("td")
        text = row.get_text(separator=" ", strip=True)
        if text and len(text) > 10:
            full_text_parts.append(text)

        # Look for MetaViewer links (document attachments)
        for link in row.find_all("a", href=True):
            href = link["href"]
            if "MetaViewer.php" in href:
                full_href = urljoin(GRANICUS_BASE + "/", href)
                link_text = link.get_text(strip=True) or "Document"
                meta_viewer_links.append({
                    "url": full_href,
                    "text": link_text,
                })

    # Strategy 2: Look for div-based agenda items
    for div in soup.find_all(["div", "p", "li"]):
        text = div.get_text(separator=" ", strip=True)
        if text and len(text) > 20 and text not in full_text_parts:
            full_text_parts.append(text)

        for link in div.find_all("a", href=True):
            href = link["href"]
            if "MetaViewer.php" in href:
                full_href = urljoin(GRANICUS_BASE + "/", href)
                link_text = link.get_text(strip=True) or "Document"
                if not any(m["url"] == full_href for m in meta_viewer_links):
                    meta_viewer_links.append({
                        "url": full_href,
                        "text": link_text,
                    })

    # Deduplicate full text parts
    seen = set()
    unique_parts = []
    for part in full_text_parts:
        normalized = part.strip()
        if normalized and normalized not in seen:
            seen.add(normalized)
            unique_parts.append(normalized)

    full_text = "\n\n".join(unique_parts)

    if not full_text or len(full_text) < 50:
        print(f"    Very little text extracted from agenda")
        return None

    return {
        "full_text": full_text,
        "meta_viewer_links": meta_viewer_links,
        "agenda_url": agenda_url,
    }


def fetch_pdf_from_metaviewer(url: str) -> str | None:
    """Download and extract text from a MetaViewer PDF document."""
    try:
        import pdfplumber
    except ImportError:
        print("    pdfplumber not available, skipping PDF extraction")
        return None

    resp = http_get(url)
    if not resp or resp.status_code != 200:
        return None

    content_type = resp.headers.get("Content-Type", "")
    if "pdf" not in content_type.lower() and not resp.content[:5] == b"%PDF-":
        # Not a PDF, might be HTML viewer page — try to find the actual PDF link
        if "html" in content_type.lower():
            soup = BeautifulSoup(resp.text, "html.parser")
            # Look for embedded PDF or iframe
            for frame in soup.find_all(["iframe", "embed", "object"]):
                src = frame.get("src") or frame.get("data") or ""
                if src and ".pdf" in src.lower():
                    return fetch_pdf_from_metaviewer(urljoin(url, src))
            return None
        return None

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(resp.content)
            tmp_path = tmp.name

        text_parts = []
        with pdfplumber.open(tmp_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)

        full_text = "\n\n".join(text_parts)
        if len(full_text.strip()) < 50:
            return None
        return full_text

    except Exception as e:
        print(f"    Error extracting PDF: {e}")
        return None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ─── Save output for classification ──────────────────────────────────

def save_extracted_text(body: str, meeting_date: str | None,
                        text: str, source_url: str) -> str:
    """Save extracted text to a JSON file for classify-with-claude.py."""
    output_dir = os.path.join(os.path.dirname(__file__), ".agenda_texts")
    os.makedirs(output_dir, exist_ok=True)

    url_hash = hashlib.md5(source_url.encode()).hexdigest()[:8]
    safe_name = re.sub(r"[^\w\-]", "_",
                        f"{body}_{meeting_date or 'unknown'}_{url_hash}")
    filepath = os.path.join(output_dir, f"{safe_name}.json")

    data = {
        "body": body,
        "meeting_date": meeting_date,
        "source_url": source_url,
        "text": text,
    }

    with open(filepath, "w") as f:
        json.dump(data, f)

    print(f"  Saved: {filepath}")
    return filepath


# ─── Main processing ─────────────────────────────────────────────────

def process_meeting(entry: dict) -> int:
    """
    Process a single meeting entry from the RSS feed.
    Returns the number of items saved.
    """
    clip_id = entry["clip_id"]
    body = entry["body"]
    meeting_date = entry["meeting_date"]
    source_url = entry["source_url"]
    title = entry["title"]

    if is_already_scraped(source_url):
        print(f"  Skipping (already processed): {title[:60]}")
        return 0

    print(f"\n  Processing: {title}")
    print(f"    Body: {body} | Date: {meeting_date} | Clip ID: {clip_id}")

    # Fetch the agenda page
    time.sleep(REQUEST_DELAY)
    agenda = fetch_agenda(clip_id)

    if not agenda:
        print(f"    No agenda content found, recording as empty")
        record_scraped_source(
            url=source_url,
            filename=f"granicus_clip_{clip_id}.json",
            body=body,
            meeting_date=meeting_date,
            items_extracted=0,
            status="no_content",
        )
        return 0

    # Build the full text for classification
    text_parts = [
        f"MEETING: {title}",
        f"BODY: {body}",
        f"DATE: {meeting_date or 'unknown'}",
        f"SOURCE: {source_url}",
        f"AGENDA URL: {agenda['agenda_url']}",
        "",
        "--- AGENDA CONTENT ---",
        "",
        agenda["full_text"],
    ]

    # Fetch key attached documents (staff reports)
    pdf_count = 0
    max_pdfs = 5  # Limit PDF downloads per meeting to avoid overload
    for meta_link in agenda["meta_viewer_links"]:
        if pdf_count >= max_pdfs:
            break

        link_text = meta_link["text"].lower()
        # Prioritize staff reports and key documents
        is_staff_report = any(kw in link_text for kw in [
            "staff report", "resolution", "ordinance", "staff memo",
            "attachment", "exhibit", "report",
        ])
        if not is_staff_report and pdf_count > 0:
            continue

        print(f"    Fetching document: {meta_link['text'][:50]}")
        time.sleep(REQUEST_DELAY)
        pdf_text = fetch_pdf_from_metaviewer(meta_link["url"])
        if pdf_text:
            text_parts.extend([
                "",
                f"--- ATTACHED DOCUMENT: {meta_link['text']} ---",
                f"URL: {meta_link['url']}",
                "",
                pdf_text,
            ])
            pdf_count += 1

    full_text = "\n\n".join(text_parts)

    # Save for classification
    save_extracted_text(body, meeting_date, full_text, source_url)
    record_scraped_source(
        url=source_url,
        filename=f"granicus_clip_{clip_id}.json",
        body=body,
        meeting_date=meeting_date,
        items_extracted=0,  # Will be updated by classify-with-claude.py
        status="extracted",
    )

    return 1


def main():
    print("=" * 60)
    print("Lafayette Pulse — Granicus RSS Feed Poller")
    print(f"Run time: {datetime.now().isoformat()}")
    print("=" * 60)

    init_supabase()

    # Collect all meeting entries from all RSS feeds
    all_entries = []
    seen_clip_ids = set()

    for view_id, body_name in RSS_FEEDS:
        time.sleep(REQUEST_DELAY)
        entries = parse_rss_feed(view_id, body_name)
        for entry in entries:
            # Deduplicate by clip_id (same meeting may appear in multiple feeds)
            if entry["clip_id"] not in seen_clip_ids:
                seen_clip_ids.add(entry["clip_id"])
                all_entries.append(entry)

    print(f"\n  Total unique meetings found across all feeds: {len(all_entries)}")

    # Sort by clip_id (roughly chronological)
    all_entries.sort(key=lambda e: e["clip_id"])

    total_saved = 0
    for entry in all_entries:
        try:
            saved = process_meeting(entry)
            total_saved += saved
        except Exception as e:
            print(f"  Error processing clip_id={entry['clip_id']}: {e}")
            continue

    # Track the highest clip_id for incremental polling
    if all_entries:
        max_clip_id = max(e["clip_id"] for e in all_entries)
        state_file = os.path.join(os.path.dirname(__file__), ".granicus_state.json")
        state = {}
        if os.path.exists(state_file):
            with open(state_file) as f:
                state = json.load(f)
        state["last_max_clip_id"] = max_clip_id
        state["last_poll_time"] = datetime.now().isoformat()
        with open(state_file, "w") as f:
            json.dump(state, f, indent=2)
        print(f"\n  Highest clip_id seen: {max_clip_id}")

    print(f"\n{'=' * 60}")
    print(f"Granicus polling complete. {total_saved} meeting(s) saved.")
    print("Run classify-with-claude.py next to process extracted texts.")
    print("=" * 60)


if __name__ == "__main__":
    main()
