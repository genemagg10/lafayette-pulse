"""
Lafayette Pulse — Civic graph extraction from RAG chunks.

Mines high-signal document_chunks (appointed, commissioner, mayor, …)
for people, organizations, memberships, seats, and candidacies.

By default, writes to civic_graph_proposals (staging). Pass --apply to
upsert high-confidence people/orgs into the live graph; memberships are
created only when both ends resolve.

Uses direct Supabase REST API (PostgREST) — no heavy SDK needed.
Claude model matches classify-with-claude.py.

Usage:
    python extract-civic-graph.py --limit 50
    python extract-civic-graph.py --dry-run --limit 20
    python extract-civic-graph.py --keywords-only
    python extract-civic-graph.py --limit 100 --apply --min-confidence 0.6
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime

import requests

# Optional: only imported when not --keywords-only
try:
    import anthropic
except ImportError:
    anthropic = None


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
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

CLAUDE_MODEL = "claude-sonnet-4-20250514"

DEFAULT_LIMIT = 50
DEFAULT_MIN_CONFIDENCE = 0.6
CHUNK_FETCH_MULTIPLIER = 3
MAX_CHUNK_CHARS = 12000

SIGNAL_KEYWORDS = [
    "appointed",
    "appointment",
    "reappointment",
    "commissioner",
    "councilmember",
    "council member",
    "chair",
    "vice chair",
    "vice-chair",
    "mayor",
    "vice mayor",
    "liaison",
    "nominated",
    "nominee",
    "candidate",
    "board member",
    "committee member",
    "staff liaison",
]

VALID_KINDS = {
    "person",
    "organization",
    "membership",
    "seat",
    "seat_holder",
    "candidacy",
}
VALID_ORG_TYPES = {
    "civic",
    "interest",
    "city_body",
    "campaign",
    "foundation",
    "other",
}
VALID_SEAT_TYPES = {"elected", "appointed", "staff", "other"}
VALID_CANDIDACY_STATUS = {
    "exploring",
    "declared",
    "qualified",
    "elected",
    "lost",
    "withdrawn",
}

# Map common meeting-body labels onto seeded organization slugs.
ORG_SLUG_ALIASES = {
    "lafayette city council": "city-council",
    "city council": "city-council",
    "lafayette planning commission": "planning-commission",
    "planning commission": "planning-commission",
    "lafayette design review commission": "design-review-commission",
    "design review commission": "design-review-commission",
    "lafayette chamber of commerce": "chamber-of-commerce",
    "chamber of commerce": "chamber-of-commerce",
    "rotary club of lafayette": "rotary",
    "lafayette community foundation": "community-foundation",
    "community foundation": "community-foundation",
    "parks and recreation commission": "parks-recreation-commission",
    "parks & recreation commission": "parks-recreation-commission",
    "transportation and circulation commission": "circulation-commission",
    "transportation & circulation commission": "circulation-commission",
}

SYSTEM_PROMPT = """You extract civic-graph entities from Lafayette, California government documents.

Return ONLY valid JSON with this shape:
{
  "people": [
    {"full_name": "First Last", "role_hints": ["Mayor"], "email": null, "bio": null, "confidence": 0.9}
  ],
  "organizations": [
    {"name": "Planning Commission", "org_type": "city_body", "confidence": 0.95}
  ],
  "memberships": [
    {"person": "First Last", "org": "Planning Commission", "role": "Commissioner", "confidence": 0.9}
  ],
  "seats": [
    {"org": "City Council", "title": "Mayor", "seat_type": "elected", "confidence": 0.9}
  ],
  "seat_holders": [
    {"person": "First Last", "org": "City Council", "title": "Mayor", "start_date": null, "end_date": null, "confidence": 0.85}
  ],
  "candidacies": [
    {"person": "First Last", "org": "Public Art Committee", "title": "Member", "status": "exploring", "confidence": 0.7}
  ]
}

Rules:
- Extract named people who hold or are nominated to civic roles (council, commissions, committees, city staff liaisons). Skip the public, unnamed residents, and generic "staff".
- Organizations are city bodies, commissions, committees, civic groups, foundations, or campaigns in Lafayette / Lamorinda. org_type must be civic|interest|city_body|campaign|foundation|other.
- Memberships link a person to an org with a short role (Mayor, Vice Mayor, Chair, Commissioner, Member, Staff Liaison, …).
- Seats are positions (title + seat_type elected|appointed|staff|other).
- seat_holders link a person to a seat title at an org. Use YYYY-MM-DD dates only when explicit.
- candidacies are people applying or running; status exploring|declared|qualified|elected|lost|withdrawn.
- confidence is 0-1. Use <=0.7 when the name or role is inferred.
- Do not invent people. Prefer names as written in the text.
- Empty arrays are fine. Return JSON only, no markdown."""


# ─── Supabase REST API helpers ────────────────────────────────────────

def supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def postgrest_text(value: str) -> str:
    """Strip PostgREST filter metacharacters from user-derived values."""
    return (value or "").replace(",", " ").replace("*", "").replace("(", "").replace(")", "")


def supabase_select(table: str, params: dict, timeout: int = 30) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.get(url, headers=supabase_headers(), params=params, timeout=timeout)
    if not resp.ok:
        print(f"    Supabase SELECT error ({resp.status_code}) on {table}: {resp.text[:300]}")
    resp.raise_for_status()
    return resp.json()


def supabase_insert(table: str, data: dict | list[dict]) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.post(url, headers=supabase_headers(), json=data, timeout=30)
    if not resp.ok:
        print(f"    Supabase INSERT error ({resp.status_code}) on {table}: {resp.text[:300]}")
    resp.raise_for_status()
    return resp.json()


def supabase_update(table: str, data: dict, match: dict) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    params = {col: f"eq.{val}" for col, val in match.items()}
    resp = requests.patch(
        url, headers=supabase_headers(), json=data, params=params, timeout=30
    )
    if not resp.ok:
        print(f"    Supabase UPDATE error ({resp.status_code}) on {table}: {resp.text[:300]}")
    resp.raise_for_status()
    return resp.json()


def check_table_exists(table: str) -> bool:
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        resp = requests.get(
            url,
            headers=supabase_headers(),
            params={"select": "id", "limit": "0"},
            timeout=10,
        )
        return resp.status_code != 404
    except Exception:
        return False


# ─── Slug / dedupe helpers ────────────────────────────────────────────

def slugify(value: str) -> str:
    """URL-safe slug; '&' drops so 'Parks & Recreation' → parks-recreation."""
    text = unicodedata.normalize("NFKD", (value or "").strip())
    text = text.encode("ascii", "ignore").decode("ascii").lower()
    text = text.replace("&", " ")
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return re.sub(r"-{2,}", "-", text).strip("-")


def org_slug_for(name: str) -> str:
    key = re.sub(r"\s+", " ", (name or "").strip().lower())
    if key in ORG_SLUG_ALIASES:
        return ORG_SLUG_ALIASES[key]
    return slugify(name)


def person_slug(name: str) -> str:
    return slugify(name)


def dedupe_key_for(kind: str, payload: dict) -> str | None:
    if kind == "person":
        slug = person_slug(payload.get("full_name") or "")
        return f"person:{slug}" if slug else None
    if kind == "organization":
        slug = payload.get("slug") or org_slug_for(payload.get("name") or "")
        return f"org:{slug}" if slug else None
    if kind == "membership":
        person = person_slug(payload.get("person") or "")
        org = org_slug_for(payload.get("org") or "")
        role = slugify(payload.get("role") or "")
        if person and org and role:
            return f"membership:{person}:{org}:{role}"
        return None
    if kind == "seat":
        org = org_slug_for(payload.get("org") or "")
        title = slugify(payload.get("title") or "")
        if org and title:
            return f"seat:{org}:{title}"
        return None
    if kind == "seat_holder":
        person = person_slug(payload.get("person") or "")
        org = org_slug_for(payload.get("org") or "")
        title = slugify(payload.get("title") or "")
        if person and org and title:
            return f"seat_holder:{person}:{org}:{title}"
        return None
    if kind == "candidacy":
        person = person_slug(payload.get("person") or "")
        org = org_slug_for(payload.get("org") or "")
        title = slugify(payload.get("title") or "candidate")
        if person and org:
            return f"candidacy:{person}:{org}:{title}"
        return None
    return None


def parse_json_response(text: str) -> dict:
    response_text = (text or "").strip()
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        response_text = "\n".join(lines[1:-1] if len(lines) > 2 else lines)
    start = response_text.find("{")
    end = response_text.rfind("}")
    if start >= 0 and end > start:
        response_text = response_text[start : end + 1]
    return json.loads(response_text)


def as_confidence(value, default: float = 0.85) -> float:
    try:
        conf = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, conf))


# ─── Init ─────────────────────────────────────────────────────────────

def init_clients(keywords_only: bool):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        print(f"  SUPABASE_URL = {'(set)' if SUPABASE_URL else '(empty)'}")
        print(f"  SUPABASE_SERVICE_KEY = {'(set)' if SUPABASE_KEY else '(empty)'}")
        sys.exit(1)

    required = ["document_chunks", "people", "organizations", "civic_graph_proposals"]
    missing = [t for t in required if not check_table_exists(t)]
    if missing:
        print(f"\nERROR: Missing database tables: {', '.join(missing)}")
        print("Run migrations in order, including:")
        print("  supabase/migrations/006_civic_graph.sql")
        print("  supabase/migrations/008_civic_graph_proposals.sql")
        sys.exit(1)
    print(f"  All required tables verified: {', '.join(required)}")

    claude = None
    if not keywords_only:
        if not ANTHROPIC_API_KEY:
            print("ERROR: ANTHROPIC_API_KEY must be set (or pass --keywords-only).")
            sys.exit(1)
        if anthropic is None:
            print("ERROR: anthropic package is not installed. pip install -r requirements.txt")
            sys.exit(1)
        claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    return claude


# ─── Fetch ────────────────────────────────────────────────────────────

def fetch_high_signal_chunks(limit: int) -> list[dict]:
    """Newest high-signal RAG chunks. Fetches extra rows so already-mined
    chunks can be skipped while still filling --limit."""
    or_filter = ",".join(
        f"content.ilike.*{kw}*" for kw in SIGNAL_KEYWORDS
    )
    fetch_limit = max(limit * CHUNK_FETCH_MULTIPLIER, limit)
    rows = supabase_select("document_chunks", {
        "select": "id,content,source_table,source_id,meeting_body,meeting_date,source_url,project_title",
        "or": f"({or_filter})",
        "order": "meeting_date.desc.nullslast",
        "limit": str(fetch_limit),
    })
    return rows or []


def load_existing_dedupe_keys() -> set[str]:
    keys: set[str] = set()
    offset = 0
    page = 1000
    while True:
        rows = supabase_select("civic_graph_proposals", {
            "select": "dedupe_key",
            "dedupe_key": "not.is.null",
            "limit": str(page),
            "offset": str(offset),
        })
        if not rows:
            break
        for row in rows:
            if row.get("dedupe_key"):
                keys.add(row["dedupe_key"])
        if len(rows) < page:
            break
        offset += page
    return keys


def load_processed_chunk_ids() -> set[int]:
    ids: set[int] = set()
    offset = 0
    page = 1000
    while True:
        rows = supabase_select("civic_graph_proposals", {
            "select": "source_chunk_id",
            "source_chunk_id": "not.is.null",
            "limit": str(page),
            "offset": str(offset),
        })
        if not rows:
            break
        for row in rows:
            cid = row.get("source_chunk_id")
            if cid is not None:
                ids.add(int(cid))
        if len(rows) < page:
            break
        offset += page
    return ids


# ─── Staging ──────────────────────────────────────────────────────────

def proposal_row(
    kind: str,
    payload: dict,
    confidence: float,
    source_table: str | None,
    source_id,
    source_chunk_id,
    dedupe_key: str,
) -> dict:
    row = {
        "kind": kind,
        "payload": payload,
        "confidence": confidence,
        "source_table": source_table,
        "status": "pending",
        "dedupe_key": dedupe_key,
    }
    if source_id is not None:
        row["source_id"] = int(source_id)
    if source_chunk_id is not None:
        row["source_chunk_id"] = int(source_chunk_id)
    return row


def stage_proposal(
    kind: str,
    payload: dict,
    confidence: float,
    source_table: str | None,
    source_id,
    source_chunk_id,
    existing_keys: set[str],
    stats: dict,
    dry_run: bool,
) -> bool:
    if kind not in VALID_KINDS:
        stats["invalid_kind"] += 1
        return False
    key = dedupe_key_for(kind, payload)
    if not key:
        stats["skipped_no_key"] += 1
        return False
    if key in existing_keys:
        stats["skipped_dedupe"] += 1
        return False

    existing_keys.add(key)
    stats["proposed"][kind] += 1
    label = payload.get("full_name") or payload.get("name") or payload.get("person") or key
    action = "would stage" if dry_run else "stage"
    print(f"    {action} {kind}: {label} ({confidence:.2f}) [{key}]")

    if dry_run:
        return True

    supabase_insert("civic_graph_proposals", proposal_row(
        kind, payload, confidence, source_table, source_id, source_chunk_id, key,
    ))
    return True


def meeting_body_org_payload(meeting_body: str) -> dict:
    name = meeting_body.strip()
    return {
        "name": name,
        "slug": org_slug_for(name),
        "org_type": "city_body",
    }


# ─── Claude extraction ────────────────────────────────────────────────

def extract_from_chunk(claude, chunk: dict) -> dict:
    content = (chunk.get("content") or "").strip()
    if len(content) > MAX_CHUNK_CHARS:
        content = content[:MAX_CHUNK_CHARS] + "\n\n[Document truncated...]"

    body = chunk.get("meeting_body") or "City of Lafayette"
    meeting_date = chunk.get("meeting_date") or "unknown"
    title = chunk.get("project_title") or ""

    user_message = f"""Extract civic-graph entities from this Lafayette, CA document.

Meeting body: {body}
Meeting date: {meeting_date}
Title: {title}

DOCUMENT TEXT:
{content}"""

    try:
        response = claude.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        response_text = response.content[0].text.strip()
        data = parse_json_response(response_text)
        if not isinstance(data, dict):
            return {}
        return data
    except json.JSONDecodeError as e:
        print(f"    Error parsing Claude response as JSON: {e}")
        return {}
    except Exception as e:
        print(f"    Claude API error: {e}")
        return {}


def stage_extracted(
    data: dict,
    chunk: dict,
    existing_keys: set[str],
    stats: dict,
    dry_run: bool,
):
    source_table = chunk.get("source_table")
    source_id = chunk.get("source_id")
    chunk_id = chunk.get("id")

    for person in data.get("people") or []:
        name = (person.get("full_name") or "").strip()
        if not name or len(name.split()) < 2:
            continue
        payload = {
            "full_name": name,
            "role_hints": [
                str(h) for h in (person.get("role_hints") or []) if h
            ],
        }
        if person.get("email"):
            payload["email"] = str(person["email"]).strip()
        if person.get("bio"):
            payload["bio"] = str(person["bio"]).strip()
        stage_proposal(
            "person", payload, as_confidence(person.get("confidence"), 0.85),
            source_table, source_id, chunk_id, existing_keys, stats, dry_run,
        )

    for org in data.get("organizations") or []:
        name = (org.get("name") or "").strip()
        if not name:
            continue
        org_type = org.get("org_type") or "city_body"
        if org_type not in VALID_ORG_TYPES:
            org_type = "other"
        payload = {
            "name": name,
            "slug": org.get("slug") or org_slug_for(name),
            "org_type": org_type,
        }
        stage_proposal(
            "organization", payload, as_confidence(org.get("confidence"), 0.9),
            source_table, source_id, chunk_id, existing_keys, stats, dry_run,
        )

    for membership in data.get("memberships") or []:
        person = (membership.get("person") or "").strip()
        org = (membership.get("org") or "").strip()
        role = (membership.get("role") or "Member").strip()
        if not person or not org:
            continue
        payload = {"person": person, "org": org, "role": role}
        stage_proposal(
            "membership", payload, as_confidence(membership.get("confidence"), 0.85),
            source_table, source_id, chunk_id, existing_keys, stats, dry_run,
        )

    for seat in data.get("seats") or []:
        org = (seat.get("org") or "").strip()
        title = (seat.get("title") or "").strip()
        if not org or not title:
            continue
        seat_type = seat.get("seat_type") or "other"
        if seat_type not in VALID_SEAT_TYPES:
            seat_type = "other"
        payload = {"org": org, "title": title, "seat_type": seat_type}
        if seat.get("district"):
            payload["district"] = str(seat["district"]).strip()
        stage_proposal(
            "seat", payload, as_confidence(seat.get("confidence"), 0.85),
            source_table, source_id, chunk_id, existing_keys, stats, dry_run,
        )

    for holder in data.get("seat_holders") or []:
        person = (holder.get("person") or "").strip()
        org = (holder.get("org") or "").strip()
        title = (holder.get("title") or "").strip()
        if not person or not org or not title:
            continue
        payload = {
            "person": person,
            "org": org,
            "title": title,
            "start_date": holder.get("start_date") or None,
            "end_date": holder.get("end_date") or None,
        }
        stage_proposal(
            "seat_holder", payload, as_confidence(holder.get("confidence"), 0.8),
            source_table, source_id, chunk_id, existing_keys, stats, dry_run,
        )

    for candidacy in data.get("candidacies") or []:
        person = (candidacy.get("person") or "").strip()
        org = (candidacy.get("org") or "").strip()
        if not person or not org:
            continue
        status = candidacy.get("status") or "exploring"
        if status not in VALID_CANDIDACY_STATUS:
            status = "exploring"
        payload = {
            "person": person,
            "org": org,
            "title": (candidacy.get("title") or "Candidate").strip(),
            "status": status,
        }
        stage_proposal(
            "candidacy", payload, as_confidence(candidacy.get("confidence"), 0.7),
            source_table, source_id, chunk_id, existing_keys, stats, dry_run,
        )


# ─── Apply (live graph) ───────────────────────────────────────────────

def find_person_id(name: str, cache: dict) -> str | None:
    key = (name or "").strip().lower()
    if not key:
        return None
    if key in cache:
        return cache[key]
    rows = supabase_select("people", {
        "select": "id,full_name",
        "full_name": f"ilike.{postgrest_text(name.strip())}",
        "limit": "5",
    })
    match = None
    for row in rows or []:
        if (row.get("full_name") or "").strip().lower() == key:
            match = row["id"]
            break
    cache[key] = match
    return match


def find_org_id(name_or_slug: str, cache: dict) -> str | None:
    raw = (name_or_slug or "").strip()
    if not raw:
        return None
    slug = org_slug_for(raw)
    if slug in cache:
        return cache[slug]
    rows = supabase_select("organizations", {
        "select": "id,slug,name",
        "slug": f"eq.{slug}",
        "limit": "1",
    })
    if rows:
        cache[slug] = rows[0]["id"]
        return rows[0]["id"]
    # Fallback: case-insensitive name
    rows = supabase_select("organizations", {
        "select": "id,slug,name",
        "name": f"ilike.{postgrest_text(raw)}",
        "limit": "5",
    })
    for row in rows or []:
        if (row.get("name") or "").strip().lower() == raw.lower():
            cache[slug] = row["id"]
            cache[org_slug_for(row["name"])] = row["id"]
            return row["id"]
    cache[slug] = None
    return None


def find_seat_id(org_id: str, title: str) -> str | None:
    rows = supabase_select("seats", {
        "select": "id,title,organization_id",
        "organization_id": f"eq.{org_id}",
        "title": f"ilike.{postgrest_text(title)}",
        "limit": "5",
    })
    want = title.strip().lower()
    for row in rows or []:
        if (row.get("title") or "").strip().lower() == want:
            return row["id"]
    return None


def apply_person(payload: dict, chunk_id, person_cache: dict) -> str | None:
    name = (payload.get("full_name") or "").strip()
    existing = find_person_id(name, person_cache)
    if existing:
        return existing
    metadata = {"source": "rag_extract"}
    if chunk_id is not None:
        metadata["chunk_ids"] = [int(chunk_id)]
    row = {
        "full_name": name,
        "metadata": metadata,
    }
    if payload.get("email"):
        row["email"] = payload["email"]
    if payload.get("bio"):
        row["bio"] = payload["bio"]
    hints = payload.get("role_hints")
    if hints:
        row["metadata"]["role_hints"] = hints
    inserted = supabase_insert("people", row)
    person_id = inserted[0]["id"] if inserted else None
    person_cache[name.lower()] = person_id
    return person_id


def apply_organization(payload: dict, org_cache: dict) -> str | None:
    name = (payload.get("name") or "").strip()
    slug = payload.get("slug") or org_slug_for(name)
    existing = find_org_id(slug, org_cache)
    if existing:
        return existing
    org_type = payload.get("org_type") or "city_body"
    if org_type not in VALID_ORG_TYPES:
        org_type = "other"
    inserted = supabase_insert("organizations", {
        "name": name,
        "slug": slug,
        "org_type": org_type,
        "metadata": {"source": "rag_extract"},
    })
    org_id = inserted[0]["id"] if inserted else None
    org_cache[slug] = org_id
    return org_id


def apply_membership(payload: dict, person_cache: dict, org_cache: dict) -> bool:
    person_id = find_person_id(payload.get("person") or "", person_cache)
    org_id = find_org_id(payload.get("org") or "", org_cache)
    if not person_id or not org_id:
        return False
    role = (payload.get("role") or "Member").strip()
    existing = supabase_select("memberships", {
        "select": "id",
        "person_id": f"eq.{person_id}",
        "organization_id": f"eq.{org_id}",
        "role": f"eq.{role}",
        "limit": "1",
    })
    if existing:
        return True
    supabase_insert("memberships", {
        "person_id": person_id,
        "organization_id": org_id,
        "role": role,
        "is_primary": False,
    })
    return True


def apply_seat(payload: dict, org_cache: dict) -> str | None:
    org_id = find_org_id(payload.get("org") or "", org_cache)
    if not org_id:
        return None
    title = (payload.get("title") or "").strip()
    existing = find_seat_id(org_id, title)
    if existing:
        return existing
    seat_type = payload.get("seat_type") or "other"
    if seat_type not in VALID_SEAT_TYPES:
        seat_type = "other"
    row = {
        "organization_id": org_id,
        "title": title,
        "seat_type": seat_type,
    }
    if payload.get("district"):
        row["district"] = payload["district"]
    inserted = supabase_insert("seats", row)
    return inserted[0]["id"] if inserted else None


def apply_seat_holder(payload: dict, person_cache: dict, org_cache: dict) -> bool:
    person_id = find_person_id(payload.get("person") or "", person_cache)
    if not person_id:
        return False
    seat_id = apply_seat(
        {
            "org": payload.get("org"),
            "title": payload.get("title"),
            "seat_type": payload.get("seat_type") or "appointed",
        },
        org_cache,
    )
    if not seat_id:
        return False
    existing = supabase_select("seat_holders", {
        "select": "id",
        "seat_id": f"eq.{seat_id}",
        "person_id": f"eq.{person_id}",
        "end_date": "is.null",
        "limit": "1",
    })
    if existing:
        return True
    row = {"seat_id": seat_id, "person_id": person_id}
    if payload.get("start_date"):
        row["start_date"] = payload["start_date"]
    if payload.get("end_date"):
        row["end_date"] = payload["end_date"]
    supabase_insert("seat_holders", row)
    return True


def apply_candidacy(payload: dict, person_cache: dict, org_cache: dict) -> bool:
    person_id = find_person_id(payload.get("person") or "", person_cache)
    if not person_id:
        return False
    seat_id = None
    title = (payload.get("title") or "").strip()
    org = (payload.get("org") or "").strip()
    if title and org:
        seat_id = apply_seat(
            {"org": org, "title": title, "seat_type": "elected"},
            org_cache,
        )
    status = payload.get("status") or "exploring"
    if status not in VALID_CANDIDACY_STATUS:
        status = "exploring"
    params = {
        "select": "id",
        "person_id": f"eq.{person_id}",
        "limit": "1",
    }
    if seat_id:
        params["seat_id"] = f"eq.{seat_id}"
    existing = supabase_select("candidacies", params)
    if existing:
        return True
    row = {"person_id": person_id, "status": status}
    if seat_id:
        row["seat_id"] = seat_id
    supabase_insert("candidacies", row)
    return True


def mark_merged(proposal_id: str):
    supabase_update("civic_graph_proposals", {"status": "merged"}, {"id": proposal_id})


def apply_pending_proposals(min_confidence: float, dry_run: bool, stats: dict):
    """Upsert high-confidence pending proposals. People/orgs first so
    memberships can resolve both ends."""
    pending = supabase_select("civic_graph_proposals", {
        "select": "id,kind,payload,confidence,source_chunk_id,dedupe_key,status",
        "status": "eq.pending",
        "order": "kind.asc,created_at.asc",
        "limit": "1000",
    })
    person_cache: dict = {}
    org_cache: dict = {}

    kind_order = [
        "organization",
        "person",
        "seat",
        "membership",
        "seat_holder",
        "candidacy",
    ]
    by_kind: dict[str, list] = defaultdict(list)
    for row in pending or []:
        by_kind[row.get("kind")].append(row)

    for kind in kind_order:
        for row in by_kind.get(kind, []):
            conf = as_confidence(row.get("confidence"), 0.0)
            if conf < min_confidence:
                stats["apply_low_confidence"] += 1
                continue
            payload = row.get("payload") or {}
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except json.JSONDecodeError:
                    stats["apply_failed"] += 1
                    continue

            ok = False
            unresolved = False
            try:
                if kind == "organization":
                    ok = bool(apply_organization(payload, org_cache)) if not dry_run else True
                elif kind == "person":
                    ok = bool(
                        apply_person(payload, row.get("source_chunk_id"), person_cache)
                    ) if not dry_run else True
                elif kind == "membership":
                    if dry_run:
                        person_ok = bool(find_person_id(payload.get("person") or "", person_cache))
                        org_ok = bool(find_org_id(payload.get("org") or "", org_cache))
                        ok = person_ok and org_ok
                        unresolved = not ok
                    else:
                        ok = apply_membership(payload, person_cache, org_cache)
                        unresolved = not ok
                elif kind == "seat":
                    if dry_run:
                        ok = bool(find_org_id(payload.get("org") or "", org_cache))
                        unresolved = not ok
                    else:
                        ok = bool(apply_seat(payload, org_cache))
                        unresolved = not ok
                elif kind == "seat_holder":
                    if dry_run:
                        ok = bool(find_person_id(payload.get("person") or "", person_cache))
                        unresolved = not ok
                    else:
                        ok = apply_seat_holder(payload, person_cache, org_cache)
                        unresolved = not ok
                elif kind == "candidacy":
                    if dry_run:
                        ok = bool(find_person_id(payload.get("person") or "", person_cache))
                        unresolved = not ok
                    else:
                        ok = apply_candidacy(payload, person_cache, org_cache)
                        unresolved = not ok
            except requests.HTTPError as e:
                print(f"    apply failed {kind} {row.get('dedupe_key')}: {e}")
                stats["apply_failed"] += 1
                continue

            if unresolved:
                stats["apply_unresolved"] += 1
                print(f"    skip {kind} (unresolved ends): {row.get('dedupe_key')}")
                continue
            if not ok:
                stats["apply_failed"] += 1
                continue

            stats["applied"][kind] += 1
            action = "would merge" if dry_run else "merged"
            print(f"    {action} {kind}: {row.get('dedupe_key')}")
            if not dry_run:
                mark_merged(row["id"])


# ─── Main ─────────────────────────────────────────────────────────────

def empty_stats() -> dict:
    return {
        "chunks_seen": 0,
        "chunks_processed": 0,
        "chunks_skipped_done": 0,
        "claude_calls": 0,
        "meeting_body_orgs": 0,
        "proposed": defaultdict(int),
        "skipped_dedupe": 0,
        "skipped_no_key": 0,
        "invalid_kind": 0,
        "applied": defaultdict(int),
        "apply_low_confidence": 0,
        "apply_unresolved": 0,
        "apply_failed": 0,
    }


def print_summary(stats: dict, args):
    print("=" * 60)
    mode = []
    if args.dry_run:
        mode.append("dry-run")
    if args.apply:
        mode.append("apply")
    if args.keywords_only:
        mode.append("keywords-only")
    if not mode:
        mode.append("stage-only")
    print(f"Civic graph extraction complete ({', '.join(mode)}).")
    print(f"  Chunks matched:            {stats['chunks_seen']}")
    print(f"  Chunks processed:          {stats['chunks_processed']}")
    print(f"  Chunks already extracted:  {stats['chunks_skipped_done']}")
    print(f"  Claude calls:              {stats['claude_calls']}")
    print(f"  Meeting-body orgs staged:  {stats['meeting_body_orgs']}")
    proposed = dict(stats["proposed"])
    print(f"  Proposals staged:          {sum(proposed.values())} {proposed}")
    print(f"  Skipped (dedupe):          {stats['skipped_dedupe']}")
    print(f"  Skipped (no dedupe key):   {stats['skipped_no_key']}")
    if args.apply:
        applied = dict(stats["applied"])
        verb = "would apply" if args.dry_run else "applied"
        print(f"  Apply ({verb}):            {sum(applied.values())} {applied}")
        print(f"  Apply skipped (low conf):  {stats['apply_low_confidence']}")
        print(f"  Apply skipped (unresolved):{stats['apply_unresolved']}")
        print(f"  Apply failed:              {stats['apply_failed']}")
    print("=" * 60)


def parse_args():
    parser = argparse.ArgumentParser(
        description="Extract people/orgs/memberships from RAG chunks into the civic graph."
    )
    parser.add_argument(
        "--limit", type=int, default=DEFAULT_LIMIT,
        help=f"Max high-signal chunks to process (default: {DEFAULT_LIMIT})",
    )
    parser.add_argument(
        "--min-confidence", type=float, default=DEFAULT_MIN_CONFIDENCE,
        help=f"Minimum confidence to --apply (default: {DEFAULT_MIN_CONFIDENCE})",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Extract and print; do not write proposals or the live graph",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Upsert high-confidence people/orgs; memberships only if both ends resolve",
    )
    parser.add_argument(
        "--keywords-only", action="store_true",
        help="Skip Claude; stage meeting-body organizations from keyword-matched chunks",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    if args.dry_run and args.apply:
        print("NOTE: --dry-run overrides --apply; no database writes will occur.")

    print("=" * 60)
    print("Lafayette Pulse — Civic Graph Extraction")
    print(f"Run time: {datetime.now().isoformat()}")
    print("=" * 60)
    print(f"  limit={args.limit}  min-confidence={args.min_confidence}")
    print(f"  dry-run={args.dry_run}  apply={args.apply}  keywords-only={args.keywords_only}")

    claude = init_clients(keywords_only=args.keywords_only)
    stats = empty_stats()
    dry_run = args.dry_run

    existing_keys = load_existing_dedupe_keys()
    processed_chunks = load_processed_chunk_ids()
    print(f"  Existing proposal keys: {len(existing_keys)}")
    print(f"  Chunks already mined:   {len(processed_chunks)}")

    chunks = fetch_high_signal_chunks(args.limit)
    stats["chunks_seen"] = len(chunks)
    print(f"\n  High-signal chunks fetched: {len(chunks)}")

    # Distinct meeting_body → organization proposals (no LLM).
    seen_bodies: set[str] = set()
    for chunk in chunks:
        body = (chunk.get("meeting_body") or "").strip()
        if not body:
            continue
        slug = org_slug_for(body)
        if slug in seen_bodies:
            continue
        seen_bodies.add(slug)
        payload = meeting_body_org_payload(body)
        if stage_proposal(
            "organization",
            payload,
            0.95,
            chunk.get("source_table") or "document_chunks",
            chunk.get("source_id"),
            None,  # body-level, not tied to one chunk (matches first-batch extract)
            existing_keys,
            stats,
            dry_run,
        ):
            stats["meeting_body_orgs"] += 1

    to_process = []
    for chunk in chunks:
        cid = chunk.get("id")
        if cid is not None and int(cid) in processed_chunks:
            stats["chunks_skipped_done"] += 1
            continue
        to_process.append(chunk)
        if len(to_process) >= args.limit:
            break

    if args.keywords_only:
        print(f"\n  --keywords-only: skipping Claude ({len(to_process)} new chunk(s)).")
    else:
        print(f"\n  Extracting from {len(to_process)} chunk(s) with {CLAUDE_MODEL}…")
        for i, chunk in enumerate(to_process, 1):
            preview = (chunk.get("project_title") or chunk.get("meeting_body") or "chunk")
            date = chunk.get("meeting_date") or "?"
            print(f"  [{i}/{len(to_process)}] #{chunk.get('id')} {date} {preview}")
            data = extract_from_chunk(claude, chunk)
            stats["claude_calls"] += 1
            stats["chunks_processed"] += 1
            if not data:
                continue
            stage_extracted(data, chunk, existing_keys, stats, dry_run)

    if args.apply:
        print("\n  Applying high-confidence pending proposals…")
        apply_pending_proposals(args.min_confidence, dry_run=dry_run, stats=stats)

    print_summary(stats, args)


if __name__ == "__main__":
    main()
