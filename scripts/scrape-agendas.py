"""
Weekly scraper for City of Lafayette government content.
Fetches agendas, meeting calendars, and news from lovelafayette.org,
extracts text content, and stores results in Supabase for classification.

Only processes upcoming/future content — past events are skipped.

Uses direct Supabase REST API (PostgREST) to avoid heavy SDK dependencies.
"""

import os
import re
import sys
import json
import hashlib
import tempfile
from datetime import datetime, date, timedelta
from urllib.parse import urljoin, urlparse, parse_qs

import requests
from bs4 import BeautifulSoup

# Note: pdfplumber is available in GitHub Actions but may not be in all
# environments. PDF extraction is handled conditionally at runtime.

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

# Cutoff: only include items from today onward (or within last 7 days for
# recently-posted items that may still be relevant)
LOOKBACK_DAYS = 7

# City of Lafayette sources on lovelafayette.org
SOURCES = [
    # --- User-specified primary sources ---
    {
        "name": "City News & Announcements",
        "body": "City of Lafayette",
        "url": "https://www.lovelafayette.org/Home/Components/News/News/10940/18",
        "type": "news",
    },
    {
        "name": "Agenda & Minutes Archive",
        "body": "City of Lafayette",
        "url": "https://www.lovelafayette.org/city-hall/components/agenda-and-minutes-archiver",
        "type": "agenda_archive",
    },
    {
        "name": "Public Meeting Calendar",
        "body": "City of Lafayette",
        "url": "https://www.lovelafayette.org/city-hall/quick-links/public-meeting-calendar",
        "type": "calendar",
    },
    # --- Related government body pages ---
    {
        "name": "City Council Agendas",
        "body": "City Council",
        "url": "https://www.lovelafayette.org/city-hall/city-council/agendas-minutes",
        "type": "agenda_page",
    },
    {
        "name": "Planning Commission",
        "body": "Planning Commission",
        "url": "https://www.lovelafayette.org/city-hall/commissions-committees/planning-commission",
        "type": "agenda_page",
    },
    {
        "name": "Circulation Commission",
        "body": "Circulation Commission",
        "url": "https://www.lovelafayette.org/city-hall/commissions-committees/circulation-commission",
        "type": "agenda_page",
    },
    {
        "name": "Parks, Trails & Recreation Commission",
        "body": "Parks & Recreation Commission",
        "url": "https://www.lovelafayette.org/city-hall/commissions-committees/parks-trails-recreation-commission",
        "type": "agenda_page",
    },
    {
        "name": "Design Review Commission",
        "body": "Design Review Commission",
        "url": "https://www.lovelafayette.org/city-hall/commissions-committees/design-review-commission",
        "type": "agenda_page",
    },
    {
        "name": "Community & Economic Development",
        "body": "Community Development",
        "url": "https://www.lovelafayette.org/city-hall/city-departments/community-development",
        "type": "news",
    },
    {
        "name": "Public Works & Engineering",
        "body": "Public Works",
        "url": "https://www.lovelafayette.org/city-hall/city-departments/public-works-engineering",
        "type": "news",
    },
]

# HTTP headers for web scraping
WEB_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; LafayettePulse/1.0; "
        "+https://vibrant-lafayette.vercel.app)"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# Month name lookup for date parsing
MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4,
    "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9,
    "oct": 10, "nov": 11, "dec": 12,
}


# ─── Supabase REST API helpers ────────────────────────────────────────

def supabase_headers() -> dict:
    """Return headers for Supabase REST API requests."""
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def supabase_select(table: str, params: dict) -> list[dict]:
    """SELECT from a Supabase table via REST."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.get(url, headers=supabase_headers(), params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def supabase_upsert(table: str, data: dict) -> list[dict]:
    """UPSERT into a Supabase table via REST."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = supabase_headers()
    headers["Prefer"] = "resolution=merge-duplicates,return=representation"
    resp = requests.post(url, headers=headers, json=data, timeout=15)
    resp.raise_for_status()
    return resp.json()


def init_supabase():
    """Validate that Supabase credentials are set."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        print(f"  SUPABASE_URL = {'(set)' if SUPABASE_URL else '(empty)'}")
        print(f"  SUPABASE_SERVICE_KEY = {'(set)' if SUPABASE_KEY else '(empty)'}")
        sys.exit(1)
    # Quick connectivity check
    try:
        supabase_select("scraped_sources", {"select": "id", "limit": "1"})
        print(f"Connected to Supabase: {SUPABASE_URL}")
    except Exception as e:
        print(f"ERROR: Cannot connect to Supabase: {e}")
        sys.exit(1)


def is_already_scraped(url: str) -> bool:
    """Check if a URL has already been scraped."""
    results = supabase_select("scraped_sources", {
        "select": "id",
        "url": f"eq.{url}",
    })
    return len(results) > 0


def record_scraped_source(url: str, filename: str, body: str,
                          meeting_date: str | None, items_extracted: int,
                          status: str = "success"):
    """Record a scraped source for deduplication."""
    data = {
        "url": url,
        "filename": filename,
        "body": body,
        "meeting_date": meeting_date,
        "items_extracted": items_extracted,
        "status": status,
    }
    supabase_upsert("scraped_sources", data)


# ─── Date helpers ─────────────────────────────────────────────────────

def get_cutoff_date() -> date:
    """Return the earliest date we'll accept content for."""
    return date.today() - timedelta(days=LOOKBACK_DAYS)


def is_future_or_recent(date_str: str | None) -> bool:
    """Check if a date string represents a future or recent date."""
    if not date_str:
        return True
    try:
        parsed = datetime.strptime(date_str, "%Y-%m-%d").date()
        return parsed >= get_cutoff_date()
    except ValueError:
        return True


def extract_date_from_text(text: str) -> str | None:
    """Try to extract a date from text/filename strings."""
    patterns = [
        (r"(\d{4})-(\d{1,2})-(\d{1,2})", "ymd"),
        (r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", "mdy"),
        (r"(\d{1,2})\.(\d{1,2})\.(\d{4})", "mdy"),
        (r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})", "named"),
        (r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s+(\d{1,2}),?\s+(\d{4})", "named"),
    ]

    for pattern, fmt in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            groups = match.groups()
            try:
                if fmt == "ymd":
                    return f"{groups[0]}-{int(groups[1]):02d}-{int(groups[2]):02d}"
                elif fmt == "mdy":
                    return f"{groups[2]}-{int(groups[0]):02d}-{int(groups[1]):02d}"
                elif fmt == "named":
                    month = MONTH_NAMES.get(groups[0].lower().rstrip("."))
                    if month:
                        return f"{groups[2]}-{month:02d}-{int(groups[1]):02d}"
            except (ValueError, IndexError):
                continue

    return None


# ─── Web scraping helpers ─────────────────────────────────────────────

def resolve_url(href: str, base_url: str) -> str:
    """Resolve a possibly-relative URL against a base URL."""
    if href.startswith("http"):
        return href
    return urljoin(base_url, href)


def fetch_page(url: str) -> BeautifulSoup | None:
    """Fetch a page and return parsed HTML."""
    try:
        response = requests.get(url, headers=WEB_HEADERS, timeout=30,
                                allow_redirects=True)
        response.raise_for_status()
        return BeautifulSoup(response.text, "html.parser")
    except requests.RequestException as e:
        print(f"  Error fetching {url}: {e}")
        return None


def download_and_extract_pdf(pdf_url: str) -> str | None:
    """Download a PDF and extract its text content."""
    try:
        import pdfplumber
    except Exception:
        print(f"  Skipping PDF (pdfplumber not available): {pdf_url}")
        return None
    try:
        response = requests.get(pdf_url, headers=WEB_HEADERS, timeout=60)
        response.raise_for_status()

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(response.content)
            tmp_path = tmp.name

        text_parts = []
        with pdfplumber.open(tmp_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)

        os.unlink(tmp_path)

        full_text = "\n\n".join(text_parts)
        if len(full_text.strip()) < 50:
            print(f"  Warning: Very little text extracted from {pdf_url}")
            return None

        return full_text

    except Exception as e:
        print(f"  Error processing PDF {pdf_url}: {e}")
        return None


def extract_html_content(soup: BeautifulSoup, url: str) -> str:
    """Extract meaningful text content from an HTML page."""
    # Remove non-content elements
    for tag in soup.find_all(["nav", "header", "footer", "script", "style",
                              "noscript", "iframe"]):
        tag.decompose()

    # Try to find the main content area (CivicPlus patterns)
    content = None
    for selector in [
        "main", ".page-content", "#page-content", ".content-area",
        "#content", ".main-content", "#main-content", '[role="main"]',
        ".interior-content", ".moduleContent", "#moduleContent",
    ]:
        content = soup.select_one(selector)
        if content:
            break

    if not content:
        content = soup.find("body") or soup

    return content.get_text(separator="\n", strip=True)


# ─── Source-specific scrapers ──────────────────────────────────────────


def scrape_agenda_page(source: dict) -> list[dict]:
    """Scrape an agenda/minutes page for PDF links and agenda content."""
    items = []
    soup = fetch_page(source["url"])
    if not soup:
        return items

    for link in soup.find_all("a", href=True):
        href = link["href"]
        text = link.get_text(strip=True).lower()
        full_text = text + " " + href.lower()

        is_pdf = href.lower().endswith(".pdf")
        is_agenda_link = any(
            kw in full_text for kw in [
                "agenda", "packet", "staff report", "notice", "public hearing",
            ]
        )
        is_agenda_page_link = (
            not is_pdf
            and any(kw in full_text for kw in ["agenda", "meeting"])
            and not any(kw in full_text for kw in ["minutes", "archive"])
        )

        if not (is_pdf and is_agenda_link) and not is_agenda_page_link:
            continue

        resolved_url = resolve_url(href, source["url"])
        meeting_date = extract_date_from_text(link.get_text(strip=True) + " " + href)

        if not is_future_or_recent(meeting_date):
            continue

        items.append({
            "url": resolved_url,
            "filename": href.split("/")[-1].split("?")[0],
            "body": source["body"],
            "meeting_date": meeting_date,
            "is_pdf": is_pdf,
        })

    # Always extract the full page content too
    page_text = extract_html_content(soup, source["url"])
    if len(page_text) > 100:
        items.append({
            "url": source["url"],
            "filename": f"{source['body'].lower().replace(' ', '-')}-page.html",
            "body": source["body"],
            "meeting_date": None,
            "is_pdf": False,
            "full_page_text": page_text,
        })

    return items


def scrape_agenda_archive(source: dict) -> list[dict]:
    """Scrape the agenda & minutes archiver page."""
    items = []
    soup = fetch_page(source["url"])
    if not soup:
        return items

    for link in soup.find_all("a", href=True):
        href = link["href"]
        text = link.get_text(strip=True)
        text_lower = text.lower()

        if "minute" in text_lower and "agenda" not in text_lower:
            continue

        is_pdf = href.lower().endswith(".pdf")
        is_relevant = any(kw in text_lower for kw in [
            "agenda", "packet", "notice", "meeting",
        ]) or is_pdf

        if not is_relevant:
            continue

        resolved_url = resolve_url(href, source["url"])
        meeting_date = extract_date_from_text(text + " " + href)

        if not is_future_or_recent(meeting_date):
            continue

        parent = link.find_parent(["tr", "li", "div", "section"])
        body_name = source["body"]
        if parent:
            parent_text = parent.get_text(strip=True).lower()
            body_mapping = {
                "city council": "City Council",
                "planning commission": "Planning Commission",
                "circulation commission": "Circulation Commission",
                "parks": "Parks & Recreation Commission",
                "design review": "Design Review Commission",
                "oversight board": "Oversight Board",
            }
            for key, val in body_mapping.items():
                if key in parent_text:
                    body_name = val
                    break

        items.append({
            "url": resolved_url,
            "filename": href.split("/")[-1].split("?")[0],
            "body": body_name,
            "meeting_date": meeting_date,
            "is_pdf": is_pdf,
        })

    # Also get full page content
    page_text = extract_html_content(soup, source["url"])
    if len(page_text) > 100:
        items.append({
            "url": source["url"],
            "filename": "agenda-archive-page.html",
            "body": source["body"],
            "meeting_date": None,
            "is_pdf": False,
            "full_page_text": page_text,
        })

    return items


def scrape_calendar(source: dict) -> list[dict]:
    """Scrape the public meeting calendar page."""
    items = []
    soup = fetch_page(source["url"])
    if not soup:
        return items

    event_selectors = [
        ".calendar-event", ".event-item", ".meeting-item",
        ".calendarEvent", ".event-row", "tr", ".list-item",
    ]

    events_found = []
    for selector in event_selectors:
        elements = soup.select(selector)
        if elements:
            events_found = elements
            break

    if not events_found:
        events_found = soup.find_all(["a", "div", "li"])

    for element in events_found:
        text = element.get_text(strip=True)
        if len(text) < 10:
            continue

        meeting_date = extract_date_from_text(text)
        if not is_future_or_recent(meeting_date):
            continue

        links = element.find_all("a", href=True) if element.name != "a" else [element]
        for link in links:
            href = link["href"]
            link_text = link.get_text(strip=True)
            if len(link_text) < 5:
                continue

            resolved_url = resolve_url(href, source["url"])
            is_pdf = href.lower().endswith(".pdf")

            body_name = source["body"]
            text_lower = text.lower()
            body_mapping = {
                "city council": "City Council",
                "planning commission": "Planning Commission",
                "circulation commission": "Circulation Commission",
                "parks": "Parks & Recreation Commission",
                "design review": "Design Review Commission",
            }
            for key, val in body_mapping.items():
                if key in text_lower:
                    body_name = val
                    break

            items.append({
                "url": resolved_url,
                "filename": href.split("/")[-1].split("?")[0],
                "body": body_name,
                "meeting_date": meeting_date,
                "is_pdf": is_pdf,
                "calendar_text": text[:500],
            })

    # Extract full calendar page for Claude to analyze
    page_text = extract_html_content(soup, source["url"])
    if len(page_text) > 100:
        items.append({
            "url": source["url"],
            "filename": "public-meeting-calendar.html",
            "body": "City of Lafayette",
            "meeting_date": None,
            "is_pdf": False,
            "full_page_text": page_text,
        })

    return items


def scrape_news_page(source: dict) -> list[dict]:
    """Scrape a news/announcements page."""
    items = []
    soup = fetch_page(source["url"])
    if not soup:
        return items

    news_selectors = [
        ".news-item", ".newsItem", ".news-listing-item",
        ".list-item", "article", ".item-row",
    ]

    news_elements = []
    for selector in news_selectors:
        elements = soup.select(selector)
        if elements:
            news_elements = elements
            break

    if not news_elements:
        main_content = soup.select_one("main") or soup.select_one("#content") or soup
        news_elements = main_content.find_all(["article", "div", "li"],
                                               class_=True, recursive=True)
        if not news_elements:
            news_elements = [main_content]

    for element in news_elements:
        text = element.get_text(strip=True)
        if len(text) < 20:
            continue

        meeting_date = extract_date_from_text(text)
        if not is_future_or_recent(meeting_date):
            continue

        link = element.find("a", href=True)
        if link:
            resolved_url = resolve_url(link["href"], source["url"])
        else:
            content_hash = hashlib.md5(text[:200].encode()).hexdigest()[:12]
            resolved_url = f"{source['url']}#item-{content_hash}"

        items.append({
            "url": resolved_url,
            "filename": f"news-{meeting_date or 'current'}.html",
            "body": source["body"],
            "meeting_date": meeting_date,
            "is_pdf": False,
            "news_text": text[:2000],
        })

    # Also extract the full page for Claude to analyze
    page_text = extract_html_content(soup, source["url"])
    if len(page_text) > 100:
        items.append({
            "url": source["url"],
            "filename": f"{source['name'].lower().replace(' ', '-')}.html",
            "body": source["body"],
            "meeting_date": None,
            "is_pdf": False,
            "full_page_text": page_text,
        })

    return items


# ─── Main processing ──────────────────────────────────────────────────


def save_extracted_text(body: str, meeting_date: str | None,
                        text: str, source_url: str):
    """Save extracted text to a temp JSON file for classification."""
    output_dir = os.path.join(os.path.dirname(__file__), ".agenda_texts")
    os.makedirs(output_dir, exist_ok=True)

    url_hash = hashlib.md5(source_url.encode()).hexdigest()[:8]
    safe_name = re.sub(r"[^\w\-]", "_", f"{body}_{meeting_date or 'unknown'}_{url_hash}")
    filepath = os.path.join(output_dir, f"{safe_name}.json")

    data = {
        "body": body,
        "meeting_date": meeting_date,
        "source_url": source_url,
        "text": text,
    }

    with open(filepath, "w") as f:
        json.dump(data, f)

    print(f"  Saved extracted text to {filepath}")
    return filepath


def process_item(item: dict) -> bool:
    """Process a single scraped item — extract text and save."""
    url = item["url"]

    if is_already_scraped(url):
        print(f"  Skipping (already scraped): {item['filename']}")
        return False

    text = item.get("full_page_text") or item.get("news_text") or item.get("calendar_text")

    if not text:
        if item.get("is_pdf"):
            print(f"  Downloading PDF: {item['filename']}")
            text = download_and_extract_pdf(url)
        else:
            print(f"  Fetching page: {item['filename']}")
            soup = fetch_page(url)
            if soup:
                text = extract_html_content(soup, url)

    if text and len(text.strip()) >= 50:
        save_extracted_text(
            item["body"],
            item["meeting_date"],
            text,
            url,
        )
        record_scraped_source(
            url=url,
            filename=item["filename"],
            body=item["body"],
            meeting_date=item["meeting_date"],
            items_extracted=0,
            status="extracted",
        )
        return True
    else:
        print(f"  No usable content from: {item['filename']}")
        record_scraped_source(
            url=url,
            filename=item["filename"],
            body=item["body"],
            meeting_date=item["meeting_date"],
            items_extracted=0,
            status="failed",
        )
        return False


def main():
    print("=" * 60)
    print("Lafayette Pulse — Event & Agenda Scraper")
    print(f"Run time: {datetime.now().isoformat()}")
    print(f"Cutoff date: {get_cutoff_date().isoformat()} (only future/recent content)")
    print("=" * 60)

    init_supabase()
    total_new = 0
    seen_urls = set()

    scraper_map = {
        "agenda_page": scrape_agenda_page,
        "agenda_archive": scrape_agenda_archive,
        "calendar": scrape_calendar,
        "news": scrape_news_page,
    }

    for source in SOURCES:
        print(f"\n--- Checking: {source['name']} ---")
        print(f"  URL: {source['url']}")

        scraper_fn = scraper_map.get(source["type"], scrape_agenda_page)
        items = scraper_fn(source)
        print(f"  Found {len(items)} item(s)")

        for item in items:
            if item["url"] in seen_urls:
                continue
            seen_urls.add(item["url"])

            print(f"  Processing: {item['filename']}")
            if process_item(item):
                total_new += 1

    print(f"\n{'=' * 60}")
    print(f"Scraping complete. {total_new} new source(s) extracted.")
    print("Run classify-with-claude.py next to process extracted texts.")
    print("=" * 60)


if __name__ == "__main__":
    main()
