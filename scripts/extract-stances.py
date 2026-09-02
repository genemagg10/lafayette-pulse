"""
Lafayette Pulse — Measure + stance extraction from RAG chunks.

Sibling of extract-civic-graph.py. Mines document_chunks for ballot
measures and attributed stances (supports / opposes / endorses, body
resolutions, named roll-call votes). Never infers stance from
co-membership or shared boards.

By default, writes to civic_graph_proposals (kinds: measure, stance).
Pass --apply to upsert measures and high-confidence (>=0.8) stances
when the actor already exists on the live graph.

Confidence bands:
    >= 0.8   merge-candidate / high (staged; applied with --apply)
    0.5–0.8  pending (staged only, even with --apply)
    <  0.5   drop (not staged)

Uses direct Supabase REST API (PostgREST). Claude model matches
classify-with-claude.py / extract-civic-graph.py.

Usage:
    python extract-stances.py --limit 50
    python extract-stances.py --dry-run --limit 20
    python extract-stances.py --keywords-only
    python extract-stances.py --limit 100 --apply
    python extract-stances.py --self-test
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime

import requests

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
DEFAULT_APPLY_MIN = 0.8
DEFAULT_STAGE_MIN = 0.5
CHUNK_FETCH_MULTIPLIER = 3
MAX_CHUNK_CHARS = 12000

SIGNAL_KEYWORDS = [
    "supports measure",
    "support measure",
    "supporting measure",
    "in support of measure",
    "yes on measure",
    "opposes measure",
    "oppose measure",
    "opposing measure",
    "in opposition to",
    "no on measure",
    "endorses measure",
    "endorsed measure",
    "endorsing measure",
    "endorsement of",
    "resolution of support",
    "resolution supporting",
    "resolution opposing",
    "voted aye",
    "voted nay",
    "voted yes",
    "voted no",
    "measure l",
    "measure j",
    "proposition",
    "endorses candidate",
    "endorsed candidate",
    "supports candidate",
    "opposes candidate",
]

VALID_KINDS = {"measure", "stance"}
VALID_POLARITY = {"support", "oppose", "endorse", "neutral", "mixed"}
VALID_SUBJECT_TYPES = {"measure", "candidacy", "project", "policy"}
VALID_ACTOR_TYPES = {"person", "organization"}
VALID_MEASURE_STATUS = {
    "proposed",
    "qualified",
    "on_ballot",
    "passed",
    "failed",
    "withdrawn",
}

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

ORG_NAME_HINTS = (
    "committee",
    "commission",
    "council",
    "association",
    "foundation",
    "chamber",
    "club",
    "city of",
    "district",
    "campaign",
    "rotary",
    "voters",
    "yimby",
    "save lafayette",
    "sustainable lafayette",
    "vibrant lafayette",
)

ACTOR_STOP = {
    "the",
    "a",
    "an",
    "this",
    "that",
    "it",
    "staff",
    "public",
    "residents",
    "community",
    "motion",
    "item",
    "recommendation",
    "discussion",
    "action",
}

VERB_POLARITY = {
    "support": "support",
    "supports": "support",
    "supported": "support",
    "supporting": "support",
    "oppose": "oppose",
    "opposes": "oppose",
    "opposed": "oppose",
    "opposing": "oppose",
    "endorse": "endorse",
    "endorses": "endorse",
    "endorsed": "endorse",
    "endorsing": "endorse",
}

VOTE_POLARITY = {
    "aye": "support",
    "yes": "support",
    "in favor": "support",
    "nay": "oppose",
    "no": "oppose",
    "against": "oppose",
}

SYSTEM_PROMPT = """You extract ballot measures and attributed civic stances from Lafayette, California government documents.

Return ONLY valid JSON with this shape:
{
  "measures": [
    {
      "title": "Lafayette School District parcel tax",
      "short_code": "Measure L",
      "summary": "optional one-line summary",
      "status": "on_ballot",
      "election_date": "2020-03-03",
      "confidence": 0.9
    }
  ],
  "stances": [
    {
      "actor_type": "person",
      "actor": "Susan Candell",
      "subject_type": "measure",
      "subject_label": "Measure L",
      "polarity": "endorse",
      "evidence_quote": "short quote from the document",
      "as_of": "2020-01-13",
      "confidence": 0.9
    }
  ]
}

Rules:
- Measures are named ballot items (Measure L, Proposition 13, local referenda) or clearly titled ballot questions. status must be proposed|qualified|on_ballot|passed|failed|withdrawn.
- short_code is "Measure L" / "Prop 13" style when present. Include election_date (YYYY-MM-DD) when the document dates the election so two different Measure L years stay distinct.
- Stances are attributed positions: supports / opposes / endorses / endorsed, a body resolution that takes a position, or a named roll-call vote (aye/nay) on a named subject.
- actor_type is person|organization. actor is the name as written.
- subject_type is measure|candidacy|project|policy. subject_label names the subject (include year for measures when known).
- polarity is support|oppose|endorse|neutral|mixed. Use endorse only for explicit endorse/endorsement language; use support for supports/in favor/aye; oppose for opposes/against/nay.
- evidence_quote must be a short span copied from the document (not paraphrased).
- confidence is 0-1:
  - >=0.8 explicit named actor + named measure/candidate + support/oppose/endorse or a named aye/nay.
  - 0.5-0.8 body resolution without named votes, or slightly indirect wording.
  - <0.5 skip — omit the row.
- NEVER infer stance from co-membership, shared boards, sitting together, "was present", "attended", or "discussed". Being on the same commission as someone who spoke is not a stance.
- NEVER invent people, orgs, or measures. Empty arrays are fine. Return JSON only, no markdown."""


# ─── Supabase REST helpers (same style as extract-civic-graph.py) ─────

def supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def postgrest_text(value: str) -> str:
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


# ─── Slug / dedupe ────────────────────────────────────────────────────

def slugify(value: str) -> str:
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


def as_confidence(value, default: float = 0.85) -> float:
    try:
        conf = float(value)
    except (TypeError, ValueError):
        return default
    return max(0.0, min(1.0, conf))


def confidence_band(conf: float) -> str:
    if conf >= DEFAULT_APPLY_MIN:
        return "high"
    if conf >= DEFAULT_STAGE_MIN:
        return "pending"
    return "drop"


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


def normalize_measure_code(raw: str) -> str | None:
    text = (raw or "").strip()
    if not text:
        return None
    m = re.search(r"(?:measure|proposition|prop\.?)\s*([A-Z]|[0-9]{1,3})", text, re.I)
    if m:
        token = m.group(1).upper()
        kind = "Prop" if re.search(r"prop", text, re.I) and not re.search(r"measure", text, re.I) else "Measure"
        return f"{kind} {token}"
    m = re.fullmatch(r"([A-Z]|[0-9]{1,3})", text.strip(), re.I)
    if m:
        return f"Measure {m.group(1).upper()}"
    return None


def measure_label(short_code: str, year: str | None = None) -> str:
    code = normalize_measure_code(short_code) or (short_code or "").strip()
    if year:
        return f"{code} ({year})"
    return code


def year_from_date(value) -> str | None:
    if not value:
        return None
    text = str(value)
    m = re.match(r"(\d{4})", text)
    return m.group(1) if m else None


def guess_actor_type(name: str) -> str:
    key = (name or "").strip().lower()
    if any(h in key for h in ORG_NAME_HINTS):
        return "organization"
    return "person"


def clean_actor_name(name: str) -> str:
    text = re.sub(r"\s+", " ", (name or "").strip())
    text = re.sub(r"^(?:the|a|an)\s+", "", text, flags=re.I)
    text = text.strip(" ,.;:\"'")
    return text


def is_usable_actor(name: str) -> bool:
    cleaned = clean_actor_name(name)
    if not cleaned or len(cleaned) < 3:
        return False
    first = cleaned.split()[0].lower().strip(".,")
    if first in ACTOR_STOP:
        return False
    if cleaned.lower() in ACTOR_STOP:
        return False
    return bool(re.search(r"[A-Za-z]", cleaned))


def dedupe_key_for(kind: str, payload: dict) -> str | None:
    if kind == "measure":
        code = slugify(payload.get("short_code") or payload.get("title") or "")
        year = year_from_date(payload.get("election_date")) or ""
        if not code:
            return None
        return f"measure:{code}:{year}" if year else f"measure:{code}"
    if kind == "stance":
        actor_type = payload.get("actor_type") or ""
        actor = person_slug(payload.get("actor") or "")
        subject_type = payload.get("subject_type") or ""
        subject = slugify(payload.get("subject_label") or "")
        polarity = payload.get("polarity") or ""
        source = slugify(payload.get("source_url") or "")
        if actor_type and actor and subject_type and subject and polarity:
            return f"stance:{actor_type}:{actor}:{subject_type}:{subject}:{polarity}:{source}"
        return None
    return None


# ─── Regex extractors (high-precision; no co-membership) ──────────────

MEASURE_TOKEN = r"(?:Measure|Proposition|Prop\.?)\s+([A-Z]|[0-9]{1,3})\b"
ACTOR_SPAN = (
    r"((?:[A-Z][\w'.-]+(?:\s+(?:of|the|&|and|for))?\s+)*"
    r"[A-Z][\w'.-]+(?:\s+[A-Z][\w'.-]+){0,6})"
)
STANCE_VERBS = r"(supports?|opposes?|endorses?|endorsed|opposed|supported|supporting|opposing|endorsing)"


def _quote_around(text: str, start: int, end: int, radius: int = 140) -> str:
    lo = max(0, start - 20)
    hi = min(len(text), end + radius)
    snippet = text[lo:hi].strip()
    snippet = re.sub(r"\s+", " ", snippet)
    return snippet[:240]


def extract_regex_hits(text: str, meeting_body: str | None, meeting_date) -> list[dict]:
    """Return stance/measure dicts from explicit wording only."""
    hits: list[dict] = []
    if not text:
        return hits
    year = year_from_date(meeting_date)

    # Named actor + verb + measure. Keep actor capture case-sensitive
    # (`re.I` would turn [A-Z] into "any letter" and over-capture).
    pattern = re.compile(
        rf"{ACTOR_SPAN}\s+(?i:(?P<verb>supports?|opposes?|endorses?|endorsed|opposed|supported|supporting|opposing|endorsing))\s+(?i:Measure|Proposition|Prop\.?)\s+(?P<code>[A-Z]|[0-9]{{1,3}})\b"
    )
    for m in pattern.finditer(text):
        actor = clean_actor_name(m.group(1))
        if not is_usable_actor(actor):
            continue
        verb = m.group("verb").lower()
        polarity = VERB_POLARITY.get(verb)
        code = normalize_measure_code(f"Measure {m.group('code')}")
        if not polarity or not code:
            continue
        label = measure_label(code, year)
        hits.append({
            "kind": "measure",
            "short_code": code,
            "title": label,
            "election_year": year,
            "confidence": 0.86,
        })
        hits.append({
            "kind": "stance",
            "actor": actor,
            "actor_type": guess_actor_type(actor),
            "subject_type": "measure",
            "subject_label": label,
            "polarity": polarity,
            "evidence_quote": _quote_around(text, m.start(), m.end()),
            "confidence": 0.86,
        })

    # Named actor + verb + candidate Full Name.
    cand = re.compile(
        rf"{ACTOR_SPAN}\s+{STANCE_VERBS}\s+(?:candidate\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b",
    )
    for m in cand.finditer(text):
        actor = clean_actor_name(m.group(1))
        candidate = clean_actor_name(m.group(3))
        if not is_usable_actor(actor) or not is_usable_actor(candidate):
            continue
        if actor.lower() == candidate.lower():
            continue
        # Skip measure-like "candidates"
        if re.match(r"(?:measure|proposition|prop)\b", candidate, re.I):
            continue
        verb = m.group(2).lower()
        polarity = VERB_POLARITY.get(verb)
        if not polarity:
            continue
        hits.append({
            "kind": "stance",
            "actor": actor,
            "actor_type": guess_actor_type(actor),
            "subject_type": "candidacy",
            "subject_label": candidate,
            "polarity": polarity,
            "evidence_quote": _quote_around(text, m.start(), m.end()),
            "confidence": 0.82,
        })

    # Voted aye/nay on a measure.
    vote = re.compile(
        rf"{ACTOR_SPAN}\s+(?i:voted)\s+(?i:(?P<vote>aye|nay|yes|no|in favor|against))\b.{{0,80}}?(?i:Measure|Proposition|Prop\.?)\s+(?P<code>[A-Z]|[0-9]{{1,3}})\b",
        re.S,
    )
    for m in vote.finditer(text):
        actor = clean_actor_name(m.group(1))
        if not is_usable_actor(actor):
            continue
        polarity = VOTE_POLARITY.get(m.group("vote").lower())
        code = normalize_measure_code(f"Measure {m.group('code')}")
        if not polarity or not code:
            continue
        label = measure_label(code, year)
        hits.append({
            "kind": "measure",
            "short_code": code,
            "title": label,
            "election_year": year,
            "confidence": 0.88,
        })
        hits.append({
            "kind": "stance",
            "actor": actor,
            "actor_type": "person",
            "subject_type": "measure",
            "subject_label": label,
            "polarity": polarity,
            "evidence_quote": _quote_around(text, m.start(), m.end()),
            "confidence": 0.88,
        })

    # Roll call: Ayes: Name, Name / Noes: Name  near a measure.
    roll_measure = None
    m_near = re.search(
        rf"(?:resolution|endors(?:e|ing|ed)|support(?:ing)?|oppos(?:e|ing)).{{0,80}}?{MEASURE_TOKEN}",
        text,
        re.I | re.S,
    )
    if m_near:
        roll_measure = normalize_measure_code(f"Measure {m_near.group(1)}")
    ayes = re.search(r"\bAyes:\s*([^\n.;]+)", text, re.I)
    noes = re.search(r"\bNoes:\s*([^\n.;]+)", text, re.I)
    if roll_measure and (ayes or noes):
        label = measure_label(roll_measure, year)
        hits.append({
            "kind": "measure",
            "short_code": roll_measure,
            "title": label,
            "election_year": year,
            "confidence": 0.9,
        })
        for bucket, polarity in ((ayes, "support"), (noes, "oppose")):
            if not bucket:
                continue
            names = re.split(r",| and ", bucket.group(1))
            for raw in names:
                actor = clean_actor_name(re.sub(r"\b(?:none|ayes|noes)\b", "", raw, flags=re.I))
                if not is_usable_actor(actor) or len(actor.split()) > 4:
                    continue
                if actor.lower() in {"none", "unanimous"}:
                    continue
                hits.append({
                    "kind": "stance",
                    "actor": actor,
                    "actor_type": "person",
                    "subject_type": "measure",
                    "subject_label": label,
                    "polarity": polarity,
                    "evidence_quote": _quote_around(text, bucket.start(), bucket.end()),
                    "confidence": 0.9,
                })

    # Body resolution supporting/opposing/endorsing a measure.
    reso = re.compile(
        rf"\b(resolution|resolutions)\b.{{0,120}}?\b(support(?:ing)?|oppos(?:e|ing)|endors(?:e|ing|ed))\b.{{0,60}}?{MEASURE_TOKEN}",
        re.I | re.S,
    )
    for m in reso.finditer(text):
        verb = m.group(2).lower()
        if verb.startswith("endors"):
            polarity = "endorse"
        elif verb.startswith("oppos"):
            polarity = "oppose"
        else:
            polarity = "support"
        code = normalize_measure_code(f"Measure {m.group(3)}")
        if not code:
            continue
        label = measure_label(code, year)
        actor = clean_actor_name(meeting_body or "")
        hits.append({
            "kind": "measure",
            "short_code": code,
            "title": label,
            "election_year": year,
            "confidence": 0.84,
        })
        if is_usable_actor(actor):
            hits.append({
                "kind": "stance",
                "actor": actor,
                "actor_type": "organization",
                "subject_type": "measure",
                "subject_label": label,
                "polarity": polarity,
                "evidence_quote": _quote_around(text, m.start(), m.end()),
                "confidence": 0.72,  # pending band unless roll-call names exist
            })

    return hits


# ─── Init / fetch ─────────────────────────────────────────────────────

def init_clients(keywords_only: bool):
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        print(f"  SUPABASE_URL = {'(set)' if SUPABASE_URL else '(empty)'}")
        print(f"  SUPABASE_SERVICE_KEY = {'(set)' if SUPABASE_KEY else '(empty)'}")
        sys.exit(1)

    required = ["document_chunks", "people", "organizations", "measures", "civic_graph_proposals"]
    missing = [t for t in required if not check_table_exists(t)]
    if missing:
        print(f"\nERROR: Missing database tables: {', '.join(missing)}")
        print("Run migrations in order, including:")
        print("  supabase/migrations/006_civic_graph.sql")
        print("  supabase/migrations/008_civic_graph_proposals.sql")
        print("  supabase/migrations/009_stances.sql")
        sys.exit(1)
    if not check_table_exists("stances"):
        print("ERROR: stances table missing. Run supabase/migrations/009_stances.sql")
        sys.exit(1)
    print(f"  All required tables verified: {', '.join(required + ['stances'])}")

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


def fetch_high_signal_chunks(limit: int) -> list[dict]:
    or_filter = ",".join(f"content.ilike.*{kw}*" for kw in SIGNAL_KEYWORDS)
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
            "kind": "in.(measure,stance)",
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
    """Only chunks already mined for measure/stance (not civic-graph people)."""
    ids: set[int] = set()
    offset = 0
    page = 1000
    while True:
        rows = supabase_select("civic_graph_proposals", {
            "select": "source_chunk_id",
            "kind": "in.(measure,stance)",
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
    stage_min: float,
) -> bool:
    if kind not in VALID_KINDS:
        stats["invalid_kind"] += 1
        return False
    band = confidence_band(confidence)
    if confidence < stage_min or band == "drop":
        stats["dropped_low_conf"] += 1
        return False
    key = dedupe_key_for(kind, payload)
    if not key:
        stats["skipped_no_key"] += 1
        return False
    if key in existing_keys:
        stats["skipped_dedupe"] += 1
        return False

    payload = dict(payload)
    payload["band"] = band
    payload["merge_candidate"] = band == "high"

    existing_keys.add(key)
    stats["proposed"][kind] += 1
    if band == "high":
        stats["proposed_high"] += 1
    label = (
        payload.get("title")
        or payload.get("subject_label")
        or payload.get("actor")
        or key
    )
    action = "would stage" if dry_run else "stage"
    print(f"    {action} {kind} [{band}]: {label} ({confidence:.2f}) [{key}]")

    if dry_run:
        return True

    supabase_insert("civic_graph_proposals", proposal_row(
        kind, payload, confidence, source_table, source_id, source_chunk_id, key,
    ))
    return True


def stage_regex_hits(
    hits: list[dict],
    chunk: dict,
    existing_keys: set[str],
    stats: dict,
    dry_run: bool,
    stage_min: float,
):
    source_table = chunk.get("source_table")
    source_id = chunk.get("source_id")
    chunk_id = chunk.get("id")
    source_url = chunk.get("source_url")
    as_of = chunk.get("meeting_date")

    for hit in hits:
        kind = hit.get("kind")
        if kind == "measure":
            code = hit.get("short_code") or ""
            title = hit.get("title") or code
            payload = {
                "title": title,
                "short_code": code,
            }
            year = hit.get("election_year")
            if year:
                payload["election_date"] = f"{year}-01-01"
            if source_url:
                payload["source_url"] = source_url
            stage_proposal(
                "measure", payload, as_confidence(hit.get("confidence"), 0.86),
                source_table, source_id, chunk_id, existing_keys, stats, dry_run,
                stage_min,
            )
        elif kind == "stance":
            actor = clean_actor_name(hit.get("actor") or "")
            subject_label = (hit.get("subject_label") or "").strip()
            polarity = hit.get("polarity")
            actor_type = hit.get("actor_type") or guess_actor_type(actor)
            subject_type = hit.get("subject_type") or "measure"
            if actor_type not in VALID_ACTOR_TYPES:
                actor_type = guess_actor_type(actor)
            if subject_type not in VALID_SUBJECT_TYPES:
                continue
            if polarity not in VALID_POLARITY:
                continue
            if not is_usable_actor(actor) or not subject_label:
                continue
            payload = {
                "actor_type": actor_type,
                "actor": actor,
                "subject_type": subject_type,
                "subject_label": subject_label,
                "polarity": polarity,
            }
            if hit.get("evidence_quote"):
                payload["evidence_quote"] = hit["evidence_quote"]
            if source_url:
                payload["source_url"] = source_url
            if as_of:
                payload["as_of"] = str(as_of)[:10]
            stage_proposal(
                "stance", payload, as_confidence(hit.get("confidence"), 0.8),
                source_table, source_id, chunk_id, existing_keys, stats, dry_run,
                stage_min,
            )


def extract_from_chunk(claude, chunk: dict) -> dict:
    content = (chunk.get("content") or "").strip()
    if len(content) > MAX_CHUNK_CHARS:
        content = content[:MAX_CHUNK_CHARS] + "\n\n[Document truncated...]"

    body = chunk.get("meeting_body") or "City of Lafayette"
    meeting_date = chunk.get("meeting_date") or "unknown"
    title = chunk.get("project_title") or ""

    user_message = f"""Extract measures and attributed stances from this Lafayette, CA document.

Meeting body: {body}
Meeting date: {meeting_date}
Title: {title}

Do not infer stance from co-membership. Only quote-backed supports/opposes/endorses, resolutions, or named votes.

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
    stage_min: float,
):
    source_table = chunk.get("source_table")
    source_id = chunk.get("source_id")
    chunk_id = chunk.get("id")
    source_url = chunk.get("source_url")
    as_of = chunk.get("meeting_date")
    year = year_from_date(as_of)

    for measure in data.get("measures") or []:
        title = (measure.get("title") or "").strip()
        short_code = normalize_measure_code(measure.get("short_code") or title or "")
        if not title and not short_code:
            continue
        if not title:
            title = measure_label(short_code, year_from_date(measure.get("election_date")) or year)
        status = measure.get("status") or "proposed"
        if status not in VALID_MEASURE_STATUS:
            status = "proposed"
        payload = {
            "title": title,
            "short_code": short_code or title,
            "status": status,
        }
        if measure.get("summary"):
            payload["summary"] = str(measure["summary"]).strip()
        if measure.get("election_date"):
            payload["election_date"] = str(measure["election_date"])[:10]
        elif year:
            payload["election_date"] = f"{year}-01-01"
        if source_url:
            payload["source_url"] = source_url
        stage_proposal(
            "measure", payload, as_confidence(measure.get("confidence"), 0.85),
            source_table, source_id, chunk_id, existing_keys, stats, dry_run,
            stage_min,
        )

    for stance in data.get("stances") or []:
        actor = clean_actor_name(stance.get("actor") or "")
        subject_label = (stance.get("subject_label") or "").strip()
        polarity = (stance.get("polarity") or "").strip().lower()
        actor_type = (stance.get("actor_type") or guess_actor_type(actor)).strip().lower()
        subject_type = (stance.get("subject_type") or "measure").strip().lower()
        if actor_type not in VALID_ACTOR_TYPES:
            actor_type = guess_actor_type(actor)
        if subject_type not in VALID_SUBJECT_TYPES:
            continue
        if polarity not in VALID_POLARITY:
            continue
        if not is_usable_actor(actor) or not subject_label:
            continue
        if subject_type == "measure":
            code = normalize_measure_code(subject_label)
            if code:
                subject_label = measure_label(
                    code, year_from_date(stance.get("as_of")) or year
                )
        payload = {
            "actor_type": actor_type,
            "actor": actor,
            "subject_type": subject_type,
            "subject_label": subject_label,
            "polarity": polarity,
        }
        if stance.get("evidence_quote"):
            payload["evidence_quote"] = str(stance["evidence_quote"]).strip()[:500]
        if source_url:
            payload["source_url"] = source_url
        if stance.get("as_of"):
            payload["as_of"] = str(stance["as_of"])[:10]
        elif as_of:
            payload["as_of"] = str(as_of)[:10]
        stage_proposal(
            "stance", payload, as_confidence(stance.get("confidence"), 0.75),
            source_table, source_id, chunk_id, existing_keys, stats, dry_run,
            stage_min,
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
    # Last-name fallback when the extract only captured a surname.
    if match is None and " " not in key and rows:
        last_hits = [
            r for r in rows
            if (r.get("full_name") or "").strip().lower().split()[-1:] == [key]
        ]
        if len(last_hits) == 1:
            match = last_hits[0]["id"]
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
    rows = supabase_select("organizations", {
        "select": "id,slug,name",
        "name": f"ilike.{postgrest_text(raw)}",
        "limit": "5",
    })
    for row in rows or []:
        if (row.get("name") or "").strip().lower() == raw.lower():
            cache[slug] = row["id"]
            return row["id"]
    cache[slug] = None
    return None


def find_measure_id(payload: dict, cache: dict) -> str | None:
    code = normalize_measure_code(payload.get("short_code") or payload.get("title") or "")
    title = (payload.get("title") or payload.get("subject_label") or "").strip()
    election_date = (payload.get("election_date") or "")[:10]
    cache_key = f"{(code or title).lower()}|{election_date}"
    if cache_key in cache:
        return cache[cache_key]

    rows = []
    if code:
        rows = supabase_select("measures", {
            "select": "id,title,short_code,election_date",
            "short_code": f"ilike.{postgrest_text(code)}",
            "limit": "10",
        })
    if not rows and title:
        rows = supabase_select("measures", {
            "select": "id,title,short_code,election_date",
            "title": f"ilike.{postgrest_text(title)}",
            "limit": "10",
        })
    match = None
    year = year_from_date(election_date)
    for row in rows or []:
        row_code = (row.get("short_code") or "").strip().lower()
        row_title = (row.get("title") or "").strip().lower()
        want = (code or "").lower()
        if want and row_code != want and want not in row_title:
            continue
        row_year = year_from_date(row.get("election_date"))
        if year and row_year and year != row_year:
            continue
        match = row["id"]
        if year and row_year == year:
            break
        if not year:
            break
    cache[cache_key] = match
    return match


def apply_measure(payload: dict, measure_cache: dict) -> str | None:
    existing = find_measure_id(payload, measure_cache)
    if existing:
        return existing
    title = (payload.get("title") or payload.get("short_code") or "").strip()
    if not title:
        return None
    status = payload.get("status") or "proposed"
    if status not in VALID_MEASURE_STATUS:
        status = "proposed"
    row: dict = {
        "title": title,
        "status": status,
    }
    if payload.get("short_code"):
        row["short_code"] = payload["short_code"]
    if payload.get("summary"):
        row["summary"] = payload["summary"]
    if payload.get("election_date"):
        row["election_date"] = str(payload["election_date"])[:10]
    if payload.get("source_url"):
        row["source_url"] = payload["source_url"]
    inserted = supabase_insert("measures", row)
    measure_id = inserted[0]["id"] if inserted else None
    if measure_id:
        measure_cache[f"{(payload.get('short_code') or title).lower()}|{(payload.get('election_date') or '')[:10]}"] = measure_id
    return measure_id


def find_candidacy_id(label: str) -> str | None:
    """Resolve a candidacy subject by the candidate's person name. No create."""
    person_id = find_person_id(label, {})
    if not person_id:
        return None
    rows = supabase_select("candidacies", {
        "select": "id,person_id",
        "person_id": f"eq.{person_id}",
        "limit": "1",
    })
    if rows:
        return rows[0]["id"]
    return None


def apply_stance(
    payload: dict,
    person_cache: dict,
    org_cache: dict,
    measure_cache: dict,
) -> bool:
    """Insert a live stance only when the actor already exists. Never
    creates people/orgs. Never uses memberships to infer anything."""
    actor = payload.get("actor") or ""
    actor_type = payload.get("actor_type") or guess_actor_type(actor)
    if actor_type == "person":
        actor_id = find_person_id(actor, person_cache)
    else:
        actor_id = find_org_id(actor, org_cache)
    if not actor_id:
        return False

    subject_type = payload.get("subject_type") or "measure"
    subject_label = (payload.get("subject_label") or "").strip()
    subject_id = None
    metadata = {"source": "rag_extract"}
    if subject_type == "measure":
        subject_id = find_measure_id(
            {
                "short_code": subject_label,
                "title": subject_label,
                "election_date": payload.get("as_of") or payload.get("election_date"),
            },
            measure_cache,
        )
    elif subject_type == "candidacy":
        subject_id = find_candidacy_id(subject_label)

    polarity = payload.get("polarity")
    if polarity not in VALID_POLARITY:
        return False
    if not subject_id and not subject_label:
        return False

    row: dict = {
        "actor_type": actor_type,
        "actor_id": actor_id,
        "subject_type": subject_type,
        "subject_label": subject_label,
        "polarity": polarity,
        "confidence": as_confidence(payload.get("confidence"), 0.8),
        "metadata": metadata,
    }
    if subject_id:
        row["subject_id"] = subject_id
    if payload.get("evidence_quote"):
        row["evidence_quote"] = payload["evidence_quote"]
    if payload.get("source_url"):
        row["source_url"] = payload["source_url"]
    if payload.get("as_of"):
        row["as_of"] = str(payload["as_of"])[:10]
    if payload.get("source_chunk_id") is not None:
        row["source_chunk_id"] = int(payload["source_chunk_id"])

    # Dedupe against the expression unique index via a targeted select.
    params = {
        "select": "id",
        "actor_type": f"eq.{actor_type}",
        "actor_id": f"eq.{actor_id}",
        "subject_type": f"eq.{subject_type}",
        "polarity": f"eq.{polarity}",
        "limit": "5",
    }
    if subject_id:
        params["subject_id"] = f"eq.{subject_id}"
    else:
        params["subject_label"] = f"ilike.{postgrest_text(subject_label)}"
    existing = supabase_select("stances", params)
    if existing:
        return True
    try:
        supabase_insert("stances", row)
    except requests.HTTPError as e:
        # Unique index race / expression conflict.
        if e.response is not None and e.response.status_code in (409, 400):
            return True
        raise
    return True


def mark_merged(proposal_id: str):
    supabase_update("civic_graph_proposals", {"status": "merged"}, {"id": proposal_id})


def apply_pending_proposals(min_confidence: float, dry_run: bool, stats: dict):
    """Upsert measures, then high-confidence stances whose actors resolve."""
    pending = supabase_select("civic_graph_proposals", {
        "select": "id,kind,payload,confidence,source_chunk_id,source_id,dedupe_key,status",
        "status": "eq.pending",
        "kind": "in.(measure,stance)",
        "order": "kind.asc,created_at.asc",
        "limit": "1000",
    })
    person_cache: dict = {}
    org_cache: dict = {}
    measure_cache: dict = {}

    by_kind: dict[str, list] = defaultdict(list)
    for row in pending or []:
        by_kind[row.get("kind")].append(row)

    for kind in ("measure", "stance"):
        for row in by_kind.get(kind, []):
            conf = as_confidence(row.get("confidence"), 0.0)
            if kind == "stance" and conf < min_confidence:
                stats["apply_low_confidence"] += 1
                continue
            payload = row.get("payload") or {}
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except json.JSONDecodeError:
                    stats["apply_failed"] += 1
                    continue
            payload = dict(payload)
            payload["confidence"] = conf
            if row.get("source_chunk_id") is not None:
                payload["source_chunk_id"] = row["source_chunk_id"]

            ok = False
            unresolved = False
            try:
                if kind == "measure":
                    if dry_run:
                        ok = True
                    else:
                        ok = bool(apply_measure(payload, measure_cache))
                elif kind == "stance":
                    if dry_run:
                        actor = payload.get("actor") or ""
                        actor_type = payload.get("actor_type") or guess_actor_type(actor)
                        if actor_type == "person":
                            ok = bool(find_person_id(actor, person_cache))
                        else:
                            ok = bool(find_org_id(actor, org_cache))
                        unresolved = not ok
                    else:
                        ok = apply_stance(payload, person_cache, org_cache, measure_cache)
                        unresolved = not ok
            except requests.HTTPError as e:
                print(f"    apply failed {kind} {row.get('dedupe_key')}: {e}")
                stats["apply_failed"] += 1
                continue

            if unresolved:
                stats["apply_unresolved"] += 1
                print(f"    skip {kind} (unresolved actor): {row.get('dedupe_key')}")
                continue
            if not ok:
                stats["apply_failed"] += 1
                continue

            stats["applied"][kind] += 1
            action = "would merge" if dry_run else "merged"
            print(f"    {action} {kind}: {row.get('dedupe_key')}")
            if not dry_run:
                mark_merged(row["id"])


# ─── Self-test (no network) ───────────────────────────────────────────

def run_self_tests() -> int:
    failures = []

    def expect(label, cond):
        if not cond:
            failures.append(label)
            print(f"  FAIL {label}")
        else:
            print(f"  ok   {label}")

    text_support = "Councilmember Candell supports Measure L on the March ballot."
    hits = extract_regex_hits(text_support, "City Council", "2020-01-13")
    stances = [h for h in hits if h["kind"] == "stance"]
    expect("supports Measure L → support stance", any(
        h.get("polarity") == "support" and "Measure L" in h.get("subject_label", "")
        for h in stances
    ))
    expect("Candell captured as actor", any("Candell" in h.get("actor", "") for h in stances))
    expect("support band is high", all(h["confidence"] >= 0.8 for h in stances))

    text_oppose = "Save Lafayette opposes Measure L."
    hits = extract_regex_hits(text_oppose, None, "2018-06-05")
    stances = [h for h in hits if h["kind"] == "stance"]
    expect("Save Lafayette is an organization", any(
        h.get("actor_type") == "organization" and h.get("polarity") == "oppose"
        for h in stances
    ))

    text_endorse = "The Lafayette Chamber of Commerce endorsed Measure L."
    hits = extract_regex_hits(text_endorse, None, "2020-03-03")
    stances = [h for h in hits if h["kind"] == "stance"]
    expect("endorsed → endorse polarity", any(h.get("polarity") == "endorse" for h in stances))

    text_vote = "Anderson voted aye on Measure L."
    hits = extract_regex_hits(text_vote, "City Council", "2020-01-13")
    expect("voted aye → support", any(
        h.get("kind") == "stance" and h.get("polarity") == "support" for h in hits
    ))

    text_roll = (
        "ACTION: It was M/S/C (Gerringer/Candell) to adopt Resolution 2020-03 "
        "endorsing Measure L on the March 3rd ballot. Vote: 5-0 "
        "(Ayes: Anderson, Candell, Bliss, Burks, and Gerringer; Noes: None)."
    )
    hits = extract_regex_hits(text_roll, "Lafayette City Council", "2020-01-13")
    actors = {h.get("actor") for h in hits if h.get("kind") == "stance"}
    expect("roll-call names extracted", {"Anderson", "Candell", "Bliss", "Burks", "Gerringer"} <= actors)

    text_reso = "The body adopted a resolution supporting Measure L."
    hits = extract_regex_hits(text_reso, "Lafayette City Council", "2020-01-13")
    body_stances = [
        h for h in hits
        if h.get("kind") == "stance" and h.get("actor_type") == "organization"
    ]
    expect("resolution stages as pending-band body stance", any(
        0.5 <= h["confidence"] < 0.8 for h in body_stances
    ))

    text_member = "Carl Anduri and John McCormick both serve on City Council."
    hits = extract_regex_hits(text_member, "City Council", "2025-12-01")
    expect("co-membership does not yield a stance", not any(h.get("kind") == "stance" for h in hits))

    text_discuss = "The Planning Commission discussed Measure L."
    hits = extract_regex_hits(text_discuss, "Planning Commission", "2020-01-01")
    expect("discussion is not a stance", not any(h.get("kind") == "stance" for h in hits))

    expect("drop band <0.5", confidence_band(0.49) == "drop")
    expect("pending band 0.5-0.8", confidence_band(0.65) == "pending")
    expect("high band >=0.8", confidence_band(0.8) == "high")

    key = dedupe_key_for("stance", {
        "actor_type": "person",
        "actor": "Susan Candell",
        "subject_type": "measure",
        "subject_label": "Measure L (2020)",
        "polarity": "endorse",
        "source_url": "https://example.org/a",
    })
    expect("stance dedupe key present", bool(key and key.startswith("stance:")))

    if failures:
        print(f"\n{len(failures)} self-test failure(s).")
        return 1
    print("\nAll self-tests passed.")
    return 0


# ─── Main ─────────────────────────────────────────────────────────────

def empty_stats() -> dict:
    return {
        "chunks_seen": 0,
        "chunks_processed": 0,
        "chunks_skipped_done": 0,
        "claude_calls": 0,
        "regex_hits": 0,
        "proposed": defaultdict(int),
        "proposed_high": 0,
        "skipped_dedupe": 0,
        "skipped_no_key": 0,
        "dropped_low_conf": 0,
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
    print(f"Stance extraction complete ({', '.join(mode)}).")
    print(f"  Chunks matched:            {stats['chunks_seen']}")
    print(f"  Chunks processed:          {stats['chunks_processed']}")
    print(f"  Chunks already extracted:  {stats['chunks_skipped_done']}")
    print(f"  Claude calls:              {stats['claude_calls']}")
    print(f"  Regex hits:                {stats['regex_hits']}")
    proposed = dict(stats["proposed"])
    print(f"  Proposals staged:          {sum(proposed.values())} {proposed}")
    print(f"  High / merge-candidate:    {stats['proposed_high']}")
    print(f"  Skipped (dedupe):          {stats['skipped_dedupe']}")
    print(f"  Skipped (no dedupe key):   {stats['skipped_no_key']}")
    print(f"  Dropped (< stage-min):     {stats['dropped_low_conf']}")
    if args.apply:
        applied = dict(stats["applied"])
        verb = "would apply" if args.dry_run else "applied"
        print(f"  Apply ({verb}):            {sum(applied.values())} {applied}")
        print(f"  Apply skipped (low conf):  {stats['apply_low_confidence']}")
        print(f"  Apply skipped (unresolved):{stats['apply_unresolved']}")
        print(f"  Apply failed:              {stats['apply_failed']}")
    print("=" * 60)
    print("Note: --apply never creates people/orgs and never infers stance")
    print("from co-membership. Unresolved actors stay pending.")


def parse_args():
    parser = argparse.ArgumentParser(
        description=(
            "Extract measures and attributed stances from RAG chunks. "
            "Never infers stance from co-membership."
        )
    )
    parser.add_argument(
        "--limit", type=int, default=DEFAULT_LIMIT,
        help=f"Max high-signal chunks to process (default: {DEFAULT_LIMIT})",
    )
    parser.add_argument(
        "--min-confidence", type=float, default=DEFAULT_APPLY_MIN,
        help=(
            "Minimum confidence to --apply stances "
            f"(default: {DEFAULT_APPLY_MIN}; pending 0.5–0.8 stay staged)"
        ),
    )
    parser.add_argument(
        "--stage-min", type=float, default=DEFAULT_STAGE_MIN,
        help=f"Minimum confidence to stage a proposal (default: {DEFAULT_STAGE_MIN})",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Extract and print; do not write proposals or the live graph",
    )
    parser.add_argument(
        "--apply", action="store_true",
        help=(
            "Upsert measures; insert high-confidence stances only when the "
            "actor already exists (no people/org creates)"
        ),
    )
    parser.add_argument(
        "--keywords-only", action="store_true",
        help="Skip Claude; stage regex hits from keyword-matched chunks only",
    )
    parser.add_argument(
        "--self-test", action="store_true",
        help="Run regex/confidence self-tests and exit (no database)",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    if args.self_test:
        sys.exit(run_self_tests())

    if args.dry_run and args.apply:
        print("NOTE: --dry-run overrides --apply; no database writes will occur.")

    print("=" * 60)
    print("Lafayette Pulse — Stance / Measure Extraction")
    print(f"Run time: {datetime.now().isoformat()}")
    print("=" * 60)
    print(f"  limit={args.limit}  apply-min={args.min_confidence}  stage-min={args.stage_min}")
    print(f"  dry-run={args.dry_run}  apply={args.apply}  keywords-only={args.keywords_only}")
    print("  Rule: never infer stance from co-membership.")

    claude = init_clients(keywords_only=args.keywords_only)
    stats = empty_stats()
    dry_run = args.dry_run

    existing_keys = load_existing_dedupe_keys()
    processed_chunks = load_processed_chunk_ids()
    print(f"  Existing stance/measure keys: {len(existing_keys)}")
    print(f"  Chunks already mined:         {len(processed_chunks)}")

    chunks = fetch_high_signal_chunks(args.limit)
    stats["chunks_seen"] = len(chunks)
    print(f"\n  High-signal chunks fetched: {len(chunks)}")

    to_process = []
    for chunk in chunks:
        cid = chunk.get("id")
        if cid is not None and int(cid) in processed_chunks:
            stats["chunks_skipped_done"] += 1
            continue
        to_process.append(chunk)
        if len(to_process) >= args.limit:
            break

    print(f"\n  Extracting from {len(to_process)} chunk(s)"
          f"{' (regex only)' if args.keywords_only else f' with {CLAUDE_MODEL}'}…")
    for i, chunk in enumerate(to_process, 1):
        preview = (chunk.get("project_title") or chunk.get("meeting_body") or "chunk")
        date = chunk.get("meeting_date") or "?"
        print(f"  [{i}/{len(to_process)}] #{chunk.get('id')} {date} {preview}")
        content = chunk.get("content") or ""
        hits = extract_regex_hits(content, chunk.get("meeting_body"), chunk.get("meeting_date"))
        stats["regex_hits"] += len(hits)
        stage_regex_hits(
            hits, chunk, existing_keys, stats, dry_run, args.stage_min,
        )
        stats["chunks_processed"] += 1
        if args.keywords_only:
            continue
        data = extract_from_chunk(claude, chunk)
        stats["claude_calls"] += 1
        if not data:
            continue
        stage_extracted(data, chunk, existing_keys, stats, dry_run, args.stage_min)

    if args.apply:
        print("\n  Applying measures + high-confidence stances…")
        apply_pending_proposals(args.min_confidence, dry_run=dry_run, stats=stats)

    print_summary(stats, args)


if __name__ == "__main__":
    main()
