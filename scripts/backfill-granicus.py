"""
Lafayette Pulse — Granicus Historical Backfill.

One-time script to enumerate clip_ids on the City of Lafayette's Granicus
instance and extract agenda content for historical meetings. Saves JSON
files for classify-with-claude.py to process.

Resumable: tracks progress in a local state file so interrupted runs can
be continued from where they left off.

Usage:
    python backfill-granicus.py --start-id 7000 --end-id 8200
    python backfill-granicus.py --start-id 7000 --end-id 8200 --batch-size 50

Uses direct Supabase REST API (PostgREST) — no heavy SDK needed.
"""

import argparse
import json
import os
import re
import sys
import time
import hashlib
import tempfile
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
REQUEST_DELAY = 2.0  # seconds between requests (conservative for backfill)

GRANICUS_BASE = "https://lafayette.granicus.com"
AGENDA_VIEW_ID = 2

# Default clip_id range (roughly covers 2024-2026 for Lafayette)
DEFAULT_START_ID = 7000
DEFAULT_END_ID = 8200
DEFAULT_BATCH_SIZE = 100

MAX_RETRIES = 3
RETRY_DELAY = 5

PROGRESS_FILE = os.path.join(os.path.dirname(__file__), ".backfill_progress.json")


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
            return resp
        except requests.RequestException as e:
            print(f"    Request error on attempt {attempt + 1}: {e}")
            if attempt < retries - 1:
                time.sleep(RETRY_DELAY * (attempt + 1))
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


def detect_body_from_text(text: str) -> str:
    """Detect the government body from page text."""
    text_lower = text[:2000].lower()
    for keyword, body_name in BODY_KEYWORDS.items():
        if keyword in text_lower:
            return body_name
    return "City of Lafayette"


# ─── Date extraction ──────────────────────────────────────────────────

MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4,
    "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9,
    "oct": 10, "nov": 11, "dec": 12,
}


def extract_date_from_text(text: str) -> str | None:
    """Try to extract a meeting date from text."""
    patterns = [
        (r"(\d{4})-(\d{1,2})-(\d{1,2})", "ymd"),
        (r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", "mdy"),
        (r"(January|February|March|April|May|June|July|August|September|"
         r"October|November|December)\s+(\d{1,2}),?\s+(\d{4})", "named"),
        (r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
         r"\.?\s+(\d{1,2}),?\s+(\d{4})", "named"),
    ]
    for pattern, fmt in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            g = match.groups()
            try:
                if fmt == "ymd":
                    return f"{g[0]}-{int(g[1]):02d}-{int(g[2]):02d}"
                elif fmt == "mdy":
                    return f"{g[2]}-{int(g[0]):02d}-{int(g[1]):02d}"
                elif fmt == "named":
                    m = MONTH_NAMES.get(g[0].lower().rstrip("."))
                    if m:
                        return f"{g[2]}-{m:02d}-{int(g[1]):02d}"
            except (ValueError, IndexError):
                continue
    return None


# ─── Agenda extraction ────────────────────────────────────────────────

def fetch_and_parse_agenda(clip_id: int) -> dict | None:
    """
    Fetch a GeneratedAgendaViewer page by clip_id and extract content.
    Returns dict with body, meeting_date, full_text, meta_viewer_links,
    or None if the page is empty/invalid.
    """
    agenda_url = f"{GRANICUS_BASE}/GeneratedAgendaViewer.php?view_id={AGENDA_VIEW_ID}&clip_id={clip_id}"

    resp = http_get(agenda_url)
    if not resp or resp.status_code != 200:
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    # Check for actual content
    body_text = soup.get_text(strip=True)
    if len(body_text) < 100:
        return None

    # Extract meeting title from the page
    title = ""
    title_el = soup.find("title")
    if title_el and title_el.text:
        title = title_el.text.strip()

    # Look for a header with the meeting name
    for h_tag in soup.find_all(["h1", "h2", "h3"]):
        h_text = h_tag.get_text(strip=True)
        if h_text and len(h_text) > 5:
            title = h_text
            break

    # Detect body and date from the page content
    header_text = title + " " + body_text[:2000]
    body_name = detect_body_from_text(header_text)
    meeting_date = extract_date_from_text(header_text)

    # Extract structured text and MetaViewer links
    full_text_parts = []
    meta_viewer_links = []
    seen_text = set()

    for el in soup.find_all(["tr", "div", "p", "li", "td"]):
        text = el.get_text(separator=" ", strip=True)
        if text and len(text) > 10 and text not in seen_text:
            seen_text.add(text)
            full_text_parts.append(text)

        for link in el.find_all("a", href=True):
            href = link["href"]
            if "MetaViewer.php" in href:
                full_href = urljoin(GRANICUS_BASE + "/", href)
                link_text = link.get_text(strip=True) or "Document"
                if not any(m["url"] == full_href for m in meta_viewer_links):
                    meta_viewer_links.append({
                        "url": full_href,
                        "text": link_text,
                    })

    full_text = "\n\n".join(full_text_parts)

    if not full_text or len(full_text) < 50:
        return None

    return {
        "title": title or f"Meeting clip_id={clip_id}",
        "body": body_name,
        "meeting_date": meeting_date,
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
        if "html" in content_type.lower():
            soup = BeautifulSoup(resp.text, "html.parser")
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

    return filepath


# ─── Progress tracking ────────────────────────────────────────────────

def load_progress() -> dict:
    """Load backfill progress from the state file."""
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {}


def save_progress(state: dict):
    """Save backfill progress to the state file."""
    with open(PROGRESS_FILE, "w") as f:
        json.dump(state, f, indent=2)


# ─── Main processing ─────────────────────────────────────────────────

def process_clip_id(clip_id: int) -> str:
    """
    Process a single clip_id.
    Returns status: 'saved', 'empty', 'skipped', or 'error'.
    """
    source_url = f"{GRANICUS_BASE}/MediaPlayer.php?view_id={AGENDA_VIEW_ID}&clip_id={clip_id}"

    if is_already_scraped(source_url):
        return "skipped"

    agenda = fetch_and_parse_agenda(clip_id)

    if not agenda:
        return "empty"

    body = agenda["body"]
    meeting_date = agenda["meeting_date"]
    title = agenda["title"]

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

    # Fetch key attached documents (limit to staff reports)
    pdf_count = 0
    max_pdfs = 3  # Conservative limit for backfill
    for meta_link in agenda["meta_viewer_links"]:
        if pdf_count >= max_pdfs:
            break

        link_text = meta_link["text"].lower()
        is_staff_report = any(kw in link_text for kw in [
            "staff report", "resolution", "ordinance", "staff memo",
        ])
        if not is_staff_report and pdf_count > 0:
            continue

        print(f"      Fetching document: {meta_link['text'][:50]}")
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
    filepath = save_extracted_text(body, meeting_date, full_text, source_url)
    record_scraped_source(
        url=source_url,
        filename=f"granicus_clip_{clip_id}.json",
        body=body,
        meeting_date=meeting_date,
        items_extracted=0,
        status="extracted",
    )

    print(f"    [{body}] {meeting_date or '?'} — {title[:50]}")
    return "saved"


def main():
    parser = argparse.ArgumentParser(
        description="Backfill historical meeting data from Lafayette Granicus."
    )
    parser.add_argument(
        "--start-id", type=int, default=DEFAULT_START_ID,
        help=f"Starting clip_id (default: {DEFAULT_START_ID})"
    )
    parser.add_argument(
        "--end-id", type=int, default=DEFAULT_END_ID,
        help=f"Ending clip_id (default: {DEFAULT_END_ID})"
    )
    parser.add_argument(
        "--batch-size", type=int, default=DEFAULT_BATCH_SIZE,
        help=f"Number of clip_ids to process per batch before saving progress (default: {DEFAULT_BATCH_SIZE})"
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="Resume from last saved progress (overrides --start-id)"
    )
    args = parser.parse_args()

    print("=" * 60)
    print("Lafayette Pulse — Granicus Historical Backfill")
    print(f"Run time: {datetime.now().isoformat()}")
    print("=" * 60)

    init_supabase()

    start_id = args.start_id
    end_id = args.end_id

    # Resume from previous progress if requested
    if args.resume:
        progress = load_progress()
        last_id = progress.get("last_completed_id")
        if last_id is not None:
            start_id = last_id + 1
            print(f"\n  Resuming from clip_id={start_id} (last completed: {last_id})")
        else:
            print(f"\n  No previous progress found, starting from clip_id={start_id}")
    else:
        print(f"\n  Processing clip_ids {start_id} to {end_id}")

    print(f"  Batch size: {args.batch_size}")
    print(f"  Request delay: {REQUEST_DELAY}s")

    total_range = end_id - start_id + 1
    stats = {"saved": 0, "empty": 0, "skipped": 0, "errors": 0}
    batch_count = 0

    for clip_id in range(start_id, end_id + 1):
        batch_count += 1
        progress_pct = ((clip_id - start_id + 1) / total_range) * 100

        try:
            status = process_clip_id(clip_id)
            stats[status] = stats.get(status, 0) + 1

            if status == "saved":
                print(f"  [{progress_pct:5.1f}%] clip_id={clip_id}: SAVED")
            elif status == "skipped":
                pass  # Quiet for already-processed
            elif status == "empty":
                pass  # Quiet for empty/invalid clip_ids
            else:
                print(f"  [{progress_pct:5.1f}%] clip_id={clip_id}: {status}")

        except KeyboardInterrupt:
            print(f"\n\nInterrupted at clip_id={clip_id}. Saving progress...")
            save_progress({
                "last_completed_id": clip_id - 1,
                "start_id": args.start_id,
                "end_id": end_id,
                "interrupted_at": datetime.now().isoformat(),
                "stats": stats,
            })
            print(f"  Progress saved. Resume with: python backfill-granicus.py --resume --end-id {end_id}")
            sys.exit(0)

        except Exception as e:
            print(f"  [{progress_pct:5.1f}%] clip_id={clip_id}: ERROR — {e}")
            stats["errors"] += 1

        # Save progress at batch boundaries
        if batch_count >= args.batch_size:
            save_progress({
                "last_completed_id": clip_id,
                "start_id": args.start_id,
                "end_id": end_id,
                "updated_at": datetime.now().isoformat(),
                "stats": stats,
            })
            print(f"\n  --- Batch checkpoint at clip_id={clip_id} "
                  f"(saved={stats['saved']}, empty={stats['empty']}, "
                  f"skipped={stats['skipped']}, errors={stats['errors']}) ---\n")
            batch_count = 0

        # Rate limit between requests
        time.sleep(REQUEST_DELAY)

    # Final progress save
    save_progress({
        "last_completed_id": end_id,
        "start_id": args.start_id,
        "end_id": end_id,
        "completed_at": datetime.now().isoformat(),
        "stats": stats,
    })

    print(f"\n{'=' * 60}")
    print(f"Backfill complete.")
    print(f"  Clip IDs processed: {start_id} to {end_id} ({total_range} total)")
    print(f"  Meetings saved:     {stats['saved']}")
    print(f"  Empty/invalid:      {stats['empty']}")
    print(f"  Already scraped:    {stats['skipped']}")
    print(f"  Errors:             {stats['errors']}")
    print(f"\nRun classify-with-claude.py next to process extracted texts.")
    print("=" * 60)


if __name__ == "__main__":
    main()
