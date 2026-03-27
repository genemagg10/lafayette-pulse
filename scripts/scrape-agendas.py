"""
Lafayette Pulse — Email-based content collector.

Connects to a Gmail inbox via IMAP (App Password) that is subscribed to
City of Lafayette email notifications.  Reads recent emails, extracts
body text / HTML content / links / PDF attachments, and saves everything
as JSON files for classify-with-claude.py to process.

Uses direct Supabase REST API (PostgREST) — no heavy SDK needed.
"""

import os
import re
import sys
import json
import email
import hashlib
import imaplib
import tempfile
from datetime import datetime, date, timedelta
from email.header import decode_header
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin

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

EMAIL_ADDRESS = os.environ.get("EMAIL_ADDRESS", "")
EMAIL_APP_PASSWORD = os.environ.get("EMAIL_APP_PASSWORD", "")
IMAP_SERVER = os.environ.get("IMAP_SERVER", "imap.gmail.com")
IMAP_PORT = int(os.environ.get("IMAP_PORT", "993"))

# How many days back to check for emails
LOOKBACK_DAYS = 7

# Label to apply to processed emails (created automatically)
PROCESSED_LABEL = "LafayettePulse/Processed"


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

    # Check connectivity
    try:
        url = f"{SUPABASE_URL}/rest/v1/"
        resp = requests.get(url, headers=supabase_headers(), timeout=10)
        print(f"  Connected to Supabase: {SUPABASE_URL}")
    except Exception as e:
        print(f"ERROR: Cannot connect to Supabase: {e}")
        sys.exit(1)

    # Check required tables
    required = ["scraped_sources", "projects", "project_updates", "agenda_items"]
    missing = [t for t in required if not check_table_exists(t)]
    if missing:
        print(f"\nERROR: Missing database tables: {', '.join(missing)}")
        print("Please run the migration SQL in your Supabase SQL Editor:")
        print("  File: supabase/migrations/001_initial_schema.sql")
        print("  Go to: https://supabase.com/dashboard → SQL Editor → paste & run")
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
        # Allow re-processing of items that failed classification
        return results[0].get("status") not in ("classify_failed", "failed")
    except requests.HTTPError:
        # If the query fails (e.g. special chars), fall back to not-scraped
        return False


def record_scraped_source(url: str, filename: str, body: str,
                          meeting_date: str | None, items_extracted: int,
                          status: str = "success"):
    supabase_upsert("scraped_sources", {
        "url": url,
        "filename": filename,
        "body": body,
        "meeting_date": meeting_date,
        "items_extracted": items_extracted,
        "status": status,
    })


# ─── Date helpers ─────────────────────────────────────────────────────

MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4,
    "jun": 6, "jul": 7, "aug": 8, "sep": 9, "sept": 9,
    "oct": 10, "nov": 11, "dec": 12,
}


def extract_date_from_text(text: str) -> str | None:
    """
    Try to extract a meeting/event date from text.
    Prioritizes dates found near meeting-related keywords over the first
    date in the text, to avoid picking up the email send date.
    """
    date_patterns = [
        (r"(\d{4})-(\d{1,2})-(\d{1,2})", "ymd"),
        (r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", "mdy"),
        (r"(January|February|March|April|May|June|July|August|September|"
         r"October|November|December)\s+(\d{1,2}),?\s+(\d{4})", "named"),
        (r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)"
         r"\.?\s+(\d{1,2}),?\s+(\d{4})", "named"),
    ]

    def parse_match(match, fmt):
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
            pass
        return None

    # Strategy 1: Look for dates near meeting-related keywords
    # This avoids picking up the email send date when the actual meeting
    # date is mentioned elsewhere in the text
    meeting_keywords = [
        r"(?:meeting|hearing|session|agenda|scheduled|convene|adjourn)"
        r"[^.]{0,60}",
        r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)"
        r"[,\s]+",
        r"(?:dated|date:)\s*",
    ]
    for keyword_pattern in meeting_keywords:
        for date_pattern, fmt in date_patterns:
            combined = keyword_pattern + date_pattern
            match = re.search(combined, text, re.IGNORECASE)
            if match:
                # Adjust groups — skip the keyword capture groups
                # Find the date pattern match within the combined match
                date_match = re.search(date_pattern, match.group(0), re.IGNORECASE)
                if date_match:
                    result = parse_match(date_match, fmt)
                    if result:
                        return result

    # Strategy 2: Look for dates preceded by a day of week (strong signal)
    for date_pattern, fmt in date_patterns:
        day_prefix = r"(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+"
        match = re.search(day_prefix + date_pattern, text, re.IGNORECASE)
        if match:
            date_match = re.search(date_pattern, match.group(0), re.IGNORECASE)
            if date_match:
                result = parse_match(date_match, fmt)
                if result:
                    return result

    # Strategy 3: Fallback to first date found in text
    for pattern, fmt in date_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            result = parse_match(match, fmt)
            if result:
                return result

    return None


# ─── Email helpers ────────────────────────────────────────────────────

def decode_mime_header(raw: str) -> str:
    """Decode a MIME-encoded header value to a plain string."""
    parts = decode_header(raw)
    decoded = []
    for payload, charset in parts:
        if isinstance(payload, bytes):
            decoded.append(payload.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(payload)
    return " ".join(decoded)


def connect_imap() -> imaplib.IMAP4_SSL:
    """Connect and authenticate to Gmail IMAP."""
    if not EMAIL_ADDRESS or not EMAIL_APP_PASSWORD:
        print("ERROR: EMAIL_ADDRESS and EMAIL_APP_PASSWORD must be set.")
        sys.exit(1)

    print(f"  Connecting to {IMAP_SERVER}:{IMAP_PORT} as {EMAIL_ADDRESS}...")
    mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
    mail.login(EMAIL_ADDRESS, EMAIL_APP_PASSWORD)
    print("  Authenticated successfully.")
    return mail


def search_recent_emails(mail: imaplib.IMAP4_SSL) -> list[bytes]:
    """Search for emails from the last LOOKBACK_DAYS days."""
    mail.select("INBOX")
    since_date = (date.today() - timedelta(days=LOOKBACK_DAYS)).strftime("%d-%b-%Y")
    status, data = mail.search(None, f'(SINCE {since_date})')
    if status != "OK" or not data[0]:
        return []
    return data[0].split()


def fetch_email(mail: imaplib.IMAP4_SSL, uid: bytes) -> email.message.Message | None:
    """Fetch a single email by UID."""
    status, data = mail.fetch(uid, "(RFC822)")
    if status != "OK" or not data[0]:
        return None
    return email.message_from_bytes(data[0][1])


def extract_email_text(msg: email.message.Message) -> str:
    """Extract the text content from an email (plain text + HTML fallback)."""
    text_parts = []
    html_parts = []

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            disposition = str(part.get("Content-Disposition", ""))

            # Skip attachments for body extraction (handled separately)
            if "attachment" in disposition:
                continue

            payload = part.get_payload(decode=True)
            if not payload:
                continue

            charset = part.get_content_charset() or "utf-8"
            decoded = payload.decode(charset, errors="replace")

            if content_type == "text/plain":
                text_parts.append(decoded)
            elif content_type == "text/html":
                html_parts.append(decoded)
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            decoded = payload.decode(charset, errors="replace")
            if msg.get_content_type() == "text/html":
                html_parts.append(decoded)
            else:
                text_parts.append(decoded)

    # Prefer plain text; fall back to HTML→text conversion
    if text_parts:
        body = "\n\n".join(text_parts)
    elif html_parts:
        body = html_to_text("\n".join(html_parts))
    else:
        body = ""

    return body.strip()


def html_to_text(html: str) -> str:
    """Convert HTML to readable text, preserving links."""
    soup = BeautifulSoup(html, "html.parser")
    # Remove non-content tags
    for tag in soup.find_all(["script", "style", "noscript"]):
        tag.decompose()
    return soup.get_text(separator="\n", strip=True)


def extract_links_from_html(msg: email.message.Message) -> list[str]:
    """Extract all URLs from HTML parts of the email."""
    links = []
    for part in msg.walk() if msg.is_multipart() else [msg]:
        if part.get_content_type() != "text/html":
            continue
        payload = part.get_payload(decode=True)
        if not payload:
            continue
        charset = part.get_content_charset() or "utf-8"
        html = payload.decode(charset, errors="replace")
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith(("http://", "https://")):
                links.append(href)
    return list(dict.fromkeys(links))  # deduplicate, preserve order


def extract_attachments(msg: email.message.Message) -> list[dict]:
    """
    Extract attachment metadata and content.
    Returns list of dicts with 'filename', 'content_type', 'text'.
    """
    attachments = []
    for part in msg.walk():
        disposition = str(part.get("Content-Disposition", ""))
        if "attachment" not in disposition and "inline" not in disposition:
            continue

        filename = part.get_filename()
        if not filename:
            continue
        filename = decode_mime_header(filename)
        content_type = part.get_content_type()
        payload = part.get_payload(decode=True)
        if not payload:
            continue

        text = None

        # Extract text from PDFs
        if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
            text = extract_pdf_bytes(payload, filename)

        # Extract text from plain text / HTML attachments
        elif content_type in ("text/plain", "text/html"):
            charset = part.get_content_charset() or "utf-8"
            decoded = payload.decode(charset, errors="replace")
            if content_type == "text/html":
                text = html_to_text(decoded)
            else:
                text = decoded

        if text and len(text.strip()) > 20:
            attachments.append({
                "filename": filename,
                "content_type": content_type,
                "text": text.strip(),
            })

    return attachments


def extract_pdf_bytes(pdf_bytes: bytes, filename: str) -> str | None:
    """Extract text from raw PDF bytes."""
    try:
        import pdfplumber
    except Exception:
        print(f"    pdfplumber not available, skipping PDF: {filename}")
        return None

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(pdf_bytes)
            tmp_path = tmp.name

        text_parts = []
        with pdfplumber.open(tmp_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)

        full_text = "\n\n".join(text_parts)
        if len(full_text.strip()) < 50:
            print(f"    Warning: very little text from PDF {filename}")
            return None
        return full_text

    except Exception as e:
        print(f"    Error extracting PDF {filename}: {e}")
        return None
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ─── Determine the government body from email content ─────────────────

BODY_KEYWORDS = {
    "city council": "City Council",
    "planning commission": "Planning Commission",
    "circulation commission": "Circulation Commission",
    "parks, trails": "Parks & Recreation Commission",
    "parks & recreation": "Parks & Recreation Commission",
    "parks and recreation": "Parks & Recreation Commission",
    "design review": "Design Review Commission",
    "public works": "Public Works",
    "community development": "Community Development",
    "oversight board": "Oversight Board",
}


def detect_body(subject: str, text: str) -> str:
    """Try to determine the government body from the email subject/text."""
    combined = (subject + " " + text[:1000]).lower()
    for keyword, body_name in BODY_KEYWORDS.items():
        if keyword in combined:
            return body_name
    return "City of Lafayette"


# ─── Save output for classification ──────────────────────────────────

def save_extracted_text(body: str, meeting_date: str | None,
                        text: str, source_url: str):
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


# ─── Main ─────────────────────────────────────────────────────────────

def process_email(msg: email.message.Message, msg_uid: str) -> int:
    """
    Process a single email.  Returns the number of items saved.
    """
    # Parse headers
    subject = decode_mime_header(msg.get("Subject", "(no subject)"))
    from_addr = decode_mime_header(msg.get("From", ""))
    date_header = msg.get("Date", "")

    # Parse email date
    email_date_str = None
    try:
        email_dt = parsedate_to_datetime(date_header)
        email_date_str = email_dt.strftime("%Y-%m-%d")
    except Exception:
        pass

    # Use Message-ID as a stable unique identifier for dedup
    # Strip angle brackets and special chars that break PostgREST queries
    raw_message_id = msg.get("Message-ID", "") or f"uid-{msg_uid}"
    message_id = raw_message_id.strip().strip("<>")
    source_url = f"email://{message_id}"

    if is_already_scraped(source_url):
        print(f"  Skipping (already processed): {subject[:60]}")
        return 0

    print(f"  Subject: {subject[:80]}")
    print(f"  From:    {from_addr[:60]}")
    print(f"  Date:    {email_date_str or date_header[:30]}")

    # Extract content
    body_text = extract_email_text(msg)
    links = extract_links_from_html(msg)
    attachments = extract_attachments(msg)

    # Try to find a meeting date mentioned in the email
    meeting_date = extract_date_from_text(subject + " " + body_text[:2000])
    if not meeting_date:
        meeting_date = email_date_str

    # Detect government body
    gov_body = detect_body(subject, body_text)

    saved_count = 0

    # ── 1. Save the email body itself ──
    if len(body_text) >= 50:
        # Build a rich text block with email metadata + links
        full_text = (
            f"EMAIL SUBJECT: {subject}\n"
            f"FROM: {from_addr}\n"
            f"DATE: {email_date_str or 'unknown'}\n"
            f"\n--- EMAIL BODY ---\n\n"
            f"{body_text}\n"
        )

        if links:
            full_text += "\n--- LINKS FOUND IN EMAIL ---\n"
            for link in links:
                full_text += f"  {link}\n"

        save_extracted_text(gov_body, meeting_date, full_text, source_url)
        record_scraped_source(
            url=source_url,
            filename=f"email-{msg_uid}.eml",
            body=gov_body,
            meeting_date=meeting_date,
            items_extracted=0,
            status="extracted",
        )
        saved_count += 1

    # ── 2. Save each attachment as its own item ──
    for att in attachments:
        att_url = f"{source_url}#attachment-{att['filename']}"
        if is_already_scraped(att_url):
            continue

        att_text = (
            f"ATTACHMENT FROM EMAIL: {subject}\n"
            f"FILENAME: {att['filename']}\n"
            f"DATE: {email_date_str or 'unknown'}\n"
            f"\n--- ATTACHMENT CONTENT ---\n\n"
            f"{att['text']}\n"
        )

        save_extracted_text(gov_body, meeting_date, att_text, att_url)
        record_scraped_source(
            url=att_url,
            filename=att["filename"],
            body=gov_body,
            meeting_date=meeting_date,
            items_extracted=0,
            status="extracted",
        )
        saved_count += 1

    return saved_count


def main():
    print("=" * 60)
    print("Lafayette Pulse — Email Content Collector")
    print(f"Run time: {datetime.now().isoformat()}")
    print(f"Looking back {LOOKBACK_DAYS} days for emails")
    print("=" * 60)

    # Validate credentials
    init_supabase()

    # Connect to Gmail
    mail = connect_imap()
    total_saved = 0

    try:
        # Search for recent emails
        email_uids = search_recent_emails(mail)
        print(f"\n  Found {len(email_uids)} email(s) in the last {LOOKBACK_DAYS} days.\n")

        for uid in email_uids:
            print(f"\n--- Email UID {uid.decode()} ---")
            try:
                msg = fetch_email(mail, uid)
                if msg:
                    saved = process_email(msg, uid.decode())
                    total_saved += saved
                else:
                    print("  Failed to fetch email.")
            except Exception as e:
                print(f"  Error processing email UID {uid.decode()}: {e}")
                continue

    finally:
        try:
            mail.close()
        except Exception:
            pass
        mail.logout()

    print(f"\n{'=' * 60}")
    print(f"Email collection complete. {total_saved} item(s) saved.")
    print("Run classify-with-claude.py next to process extracted texts.")
    print("=" * 60)


if __name__ == "__main__":
    main()
