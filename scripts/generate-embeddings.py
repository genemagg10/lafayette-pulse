"""
Generate embeddings for all existing projects, agenda items, and project updates.
Stores them in the document_chunks table for RAG retrieval.

Requires: OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
"""

import os
import sys
import time
import json
from datetime import datetime

import openai
import requests

# Configuration
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
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

EMBEDDING_MODEL = "text-embedding-3-small"
BATCH_SIZE = 20  # OpenAI supports up to 2048 inputs per batch
RATE_LIMIT_DELAY = 0.5  # seconds between batches


def supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def supabase_select(table: str, params: dict) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.get(url, headers=supabase_headers(), params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


def supabase_upsert(table: str, data: dict, on_conflict: str) -> list[dict]:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = supabase_headers()
    headers["Prefer"] = "return=representation,resolution=merge-duplicates"
    resp = requests.post(
        url,
        headers=headers,
        json=data,
        params={"on_conflict": on_conflict},
        timeout=30,
    )
    if not resp.ok:
        print(f"  Supabase UPSERT error ({resp.status_code}): {resp.text[:200]}")
    resp.raise_for_status()
    return resp.json()


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a batch of texts using OpenAI."""
    client = openai.OpenAI(api_key=OPENAI_API_KEY)
    # Truncate texts to stay within token limits
    truncated = [t[:8000] for t in texts]
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=truncated)
    return [item.embedding for item in response.data]


def get_existing_chunk_ids(source_table: str) -> set[int]:
    """Get all source_ids that already have embeddings for a given source_table."""
    chunks = supabase_select("document_chunks", {
        "select": "source_id",
        "source_table": f"eq.{source_table}",
        "embedding": "not.is.null",
    })
    return {c["source_id"] for c in chunks}


def build_chunk_text(record: dict, source_table: str) -> str:
    """Build the text content for a chunk from a source record."""
    if source_table == "projects":
        parts = [record.get("title", "")]
        if record.get("description"):
            parts.append(record["description"])
        if record.get("location_name"):
            parts.append(f"Location: {record['location_name']}")
        if record.get("timeline_text"):
            parts.append(f"Timeline: {record['timeline_text']}")
        if record.get("funding_source"):
            parts.append(f"Funding: {record['funding_source']}")
        if record.get("tags"):
            parts.append(f"Tags: {', '.join(record['tags'])}")
        return "\n".join(parts)

    elif source_table == "agenda_items":
        parts = [record.get("title", "")]
        if record.get("body"):
            parts.append(f"Meeting body: {record['body']}")
        if record.get("date"):
            parts.append(f"Date: {record['date']}")
        if record.get("description"):
            parts.append(record["description"])
        if record.get("tags"):
            parts.append(f"Tags: {', '.join(record['tags'])}")
        return "\n".join(parts)

    elif source_table == "project_updates":
        parts = []
        if record.get("project_title"):
            parts.append(f"Project: {record['project_title']}")
        if record.get("source_date"):
            parts.append(f"Date: {record['source_date']}")
        parts.append(record.get("update_text", ""))
        return "\n".join(parts)

    return record.get("title", "") + "\n" + record.get("description", "")


def process_table(source_table: str, select_fields: str, metadata_fn):
    """Process all records from a table, generating embeddings for new ones."""
    print(f"\n--- Processing {source_table} ---")

    existing_ids = get_existing_chunk_ids(source_table)
    print(f"  Already embedded: {len(existing_ids)} records")

    records = supabase_select(source_table, {"select": select_fields})
    print(f"  Total records: {len(records)}")

    # Filter to only new records
    new_records = [r for r in records if r["id"] not in existing_ids]
    print(f"  New records to embed: {len(new_records)}")

    if not new_records:
        return 0

    total_embedded = 0

    # Process in batches
    for i in range(0, len(new_records), BATCH_SIZE):
        batch = new_records[i : i + BATCH_SIZE]
        texts = [build_chunk_text(r, source_table) for r in batch]

        # Skip empty texts
        valid = [(r, t) for r, t in zip(batch, texts) if t.strip()]
        if not valid:
            continue

        records_batch, texts_batch = zip(*valid)

        try:
            embeddings = get_embeddings(list(texts_batch))
        except Exception as e:
            print(f"  Error generating embeddings for batch {i}: {e}")
            continue

        for record, text, embedding in zip(records_batch, texts_batch, embeddings):
            metadata = metadata_fn(record)
            chunk_data = {
                "content": text,
                "embedding": json.dumps(embedding),
                "source_table": source_table,
                "source_id": record["id"],
                **metadata,
            }

            try:
                supabase_upsert(
                    "document_chunks", chunk_data, "source_table,source_id"
                )
                total_embedded += 1
            except Exception as e:
                print(f"  Error storing chunk for {source_table}#{record['id']}: {e}")

        print(f"  Batch {i // BATCH_SIZE + 1}: embedded {len(valid)} records")
        time.sleep(RATE_LIMIT_DELAY)

    return total_embedded


def main():
    print("=" * 60)
    print("Lafayette Pulse — Embedding Generation")
    print(f"Run time: {datetime.now().isoformat()}")
    print("=" * 60)

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        sys.exit(1)
    if not OPENAI_API_KEY:
        print("ERROR: OPENAI_API_KEY must be set.")
        sys.exit(1)

    total = 0

    # Process projects
    total += process_table(
        "projects",
        "id,title,description,category,status,location_name,timeline_text,funding_source,source_url,tags",
        lambda r: {
            "category": r.get("category"),
            "project_title": r.get("title"),
            "source_url": r.get("source_url"),
        },
    )

    # Process agenda items
    total += process_table(
        "agenda_items",
        "id,title,description,body,date,category,source_url,tags",
        lambda r: {
            "category": r.get("category"),
            "meeting_body": r.get("body"),
            "meeting_date": r.get("date"),
            "project_title": r.get("title"),
            "source_url": r.get("source_url"),
        },
    )

    # Process project updates (with joined project title)
    total += process_table(
        "project_updates",
        "id,update_text,source_url,source_type,source_date,project_id,projects(title,category)",
        lambda r: {
            "category": r.get("projects", {}).get("category") if r.get("projects") else None,
            "meeting_date": r.get("source_date"),
            "project_title": r.get("projects", {}).get("title") if r.get("projects") else None,
            "source_url": r.get("source_url"),
        },
    )

    print(f"\n{'=' * 60}")
    print(f"Embedding generation complete. {total} new chunks created.")
    print("=" * 60)


if __name__ == "__main__":
    main()
