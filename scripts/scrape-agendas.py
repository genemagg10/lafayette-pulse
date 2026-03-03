"""
Weekly scraper for City of Lafayette agenda documents.
Fetches agenda PDFs from city government pages, extracts text,
and stores results in Supabase for classification.
"""

import os
import re
import sys
import json
import tempfile
from datetime import datetime, timedelta

import requests
import pdfplumber
from bs4 import BeautifulSoup
from supabase import create_client

# Configuration
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# City of Lafayette agenda sources
AGENDA_SOURCES = [
    {
        "name": "City Council",
        "body": "City Council",
        "url": "https://www.ci.lafayette.ca.us/city-council/city-council-agendas-minutes",
    },
    {
        "name": "Planning Commission",
        "body": "Planning Commission",
        "url": "https://www.ci.lafayette.ca.us/planning-building/planning-commission-meetings",
    },
    {
        "name": "Circulation Commission",
        "body": "Circulation Commission",
        "url": "https://www.ci.lafayette.ca.us/public-works/circulation-commission",
    },
    {
        "name": "Parks, Trails & Recreation Commission",
        "body": "Parks & Recreation Commission",
        "url": "https://www.ci.lafayette.ca.us/parks-trails-recreation/parks-trails-recreation-commission",
    },
]

# HTTP headers for requests
HEADERS = {
    "User-Agent": "VibrantLafayette/1.0 (Community Project Tracker; vibrant-lafayette.vercel.app)"
}


def init_supabase():
    """Initialize Supabase client."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def is_already_scraped(supabase, url: str) -> bool:
    """Check if a URL has already been scraped."""
    result = (
        supabase.table("scraped_sources")
        .select("id")
        .eq("url", url)
        .execute()
    )
    return len(result.data) > 0


def record_scraped_source(supabase, url: str, filename: str, body: str,
                          meeting_date: str | None, items_extracted: int,
                          status: str = "success"):
    """Record a scraped source for deduplication."""
    supabase.table("scraped_sources").upsert({
        "url": url,
        "filename": filename,
        "body": body,
        "meeting_date": meeting_date,
        "items_extracted": items_extracted,
        "status": status,
    }).execute()


def find_pdf_links(page_url: str, body_name: str) -> list[dict]:
    """
    Scrape a city page for PDF links to agendas.
    Returns a list of dicts with 'url', 'filename', 'body', 'meeting_date'.
    """
    pdfs = []
    try:
        response = requests.get(page_url, headers=HEADERS, timeout=30)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # Find all links to PDF files
        for link in soup.find_all("a", href=True):
            href = link["href"]
            text = link.get_text(strip=True).lower()

            # Only look for agenda PDFs (not minutes or other docs)
            if not href.lower().endswith(".pdf"):
                continue

            # Filter for agenda-related links
            is_agenda = any(
                kw in text for kw in ["agenda", "packet", "staff report"]
            ) or any(
                kw in href.lower() for kw in ["agenda", "packet"]
            )

            if not is_agenda:
                continue

            # Resolve relative URLs
            if href.startswith("/"):
                from urllib.parse import urljoin
                href = urljoin(page_url, href)
            elif not href.startswith("http"):
                from urllib.parse import urljoin
                href = urljoin(page_url, href)

            # Try to extract date from filename or link text
            meeting_date = extract_date_from_text(
                link.get_text(strip=True) + " " + href
            )

            pdfs.append({
                "url": href,
                "filename": href.split("/")[-1],
                "body": body_name,
                "meeting_date": meeting_date,
            })

    except requests.RequestException as e:
        print(f"  Error fetching {page_url}: {e}")

    return pdfs


def extract_date_from_text(text: str) -> str | None:
    """Try to extract a date from text/filename strings."""
    # Common patterns: 2026-03-01, 03-01-2026, March 1 2026, etc.
    patterns = [
        r"(\d{4})-(\d{1,2})-(\d{1,2})",
        r"(\d{1,2})-(\d{1,2})-(\d{4})",
        r"(\d{1,2})\.(\d{1,2})\.(\d{4})",
        r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            groups = match.groups()
            try:
                if groups[0].isdigit() and len(groups[0]) == 4:
                    # YYYY-MM-DD
                    return f"{groups[0]}-{int(groups[1]):02d}-{int(groups[2]):02d}"
                elif groups[0].isdigit() and len(groups[2]) == 4:
                    # MM-DD-YYYY
                    return f"{groups[2]}-{int(groups[0]):02d}-{int(groups[1]):02d}"
                else:
                    # Month name DD, YYYY
                    month_names = {
                        "january": 1, "february": 2, "march": 3, "april": 4,
                        "may": 5, "june": 6, "july": 7, "august": 8,
                        "september": 9, "october": 10, "november": 11,
                        "december": 12,
                    }
                    month = month_names.get(groups[0].lower())
                    if month:
                        return f"{groups[2]}-{month:02d}-{int(groups[1]):02d}"
            except (ValueError, IndexError):
                continue

    return None


def download_and_extract_pdf(pdf_url: str) -> str | None:
    """Download a PDF and extract its text content."""
    try:
        response = requests.get(pdf_url, headers=HEADERS, timeout=60)
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


def save_extracted_text(supabase, body: str, meeting_date: str | None,
                        text: str, source_url: str):
    """
    Save extracted agenda text to a temp storage for classification.
    We write a JSON file that classify-with-claude.py will pick up.
    """
    output_dir = os.path.join(os.path.dirname(__file__), ".agenda_texts")
    os.makedirs(output_dir, exist_ok=True)

    # Use a sanitized filename
    safe_name = re.sub(r"[^\w\-]", "_", f"{body}_{meeting_date or 'unknown'}")
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


def main():
    print("=" * 60)
    print("Vibrant Lafayette — Weekly Agenda Scraper")
    print(f"Run time: {datetime.now().isoformat()}")
    print("=" * 60)

    supabase = init_supabase()
    total_new = 0

    for source in AGENDA_SOURCES:
        print(f"\n--- Checking: {source['name']} ---")
        print(f"  URL: {source['url']}")

        pdf_links = find_pdf_links(source["url"], source["body"])
        print(f"  Found {len(pdf_links)} agenda PDF(s)")

        for pdf in pdf_links:
            if is_already_scraped(supabase, pdf["url"]):
                print(f"  Skipping (already scraped): {pdf['filename']}")
                continue

            print(f"  Processing: {pdf['filename']}")
            text = download_and_extract_pdf(pdf["url"])

            if text:
                save_extracted_text(
                    supabase,
                    pdf["body"],
                    pdf["meeting_date"],
                    text,
                    pdf["url"],
                )
                record_scraped_source(
                    supabase,
                    url=pdf["url"],
                    filename=pdf["filename"],
                    body=pdf["body"],
                    meeting_date=pdf["meeting_date"],
                    items_extracted=0,  # Updated after classification
                    status="extracted",
                )
                total_new += 1
            else:
                record_scraped_source(
                    supabase,
                    url=pdf["url"],
                    filename=pdf["filename"],
                    body=pdf["body"],
                    meeting_date=pdf["meeting_date"],
                    items_extracted=0,
                    status="failed",
                )

    print(f"\n{'=' * 60}")
    print(f"Scraping complete. {total_new} new agenda(s) extracted.")
    print("=" * 60)


if __name__ == "__main__":
    main()
