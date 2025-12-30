import os
import re
import sqlite3
from typing import List, Tuple, Dict, Any

import chromadb
from chromadb.config import Settings

def _normalize_whitespace(s: str) -> str:
    s = s or ""
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _chunk_text(text: str, chunk_size: int = 1200, overlap: int = 200) -> List[str]:
    text = text or ""
    if not text.strip():
        return []
    chunks = []
    i = 0
    n = len(text)
    while i < n:
        j = min(n, i + chunk_size)
        chunk = text[i:j]
        chunk = chunk.strip()
        if chunk:
            chunks.append(chunk)
        if j >= n:
            break
        i = max(0, j - overlap)
    return chunks

def _db_path() -> str:
    # matches your pattern: /data/sqlite/*.db
    base = "/data/sqlite"
    if os.path.isdir(base):
        for name in sorted(os.listdir(base)):
            if name.endswith(".db"):
                return os.path.join(base, name)
    # fallback: env
    return os.getenv("SQLITE_DB_PATH", "/data/sqlite/app.db")

def _connect_chroma():
    persist_dir = os.getenv("CHROMA_PERSIST_DIR", "/data/chroma")
    client = chromadb.PersistentClient(
        path=persist_dir,
        settings=Settings(anonymized_telemetry=False),
    )
    return client

def _get_collection(client):
    col_name = os.getenv("CHROMA_COLLECTION", "focusai_docs")
    return client.get_or_create_collection(name=col_name)

def _fetch_docs(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    cur = conn.cursor()
    cur.execute("""
        SELECT id, name, source, source_kind, doc_date, COALESCE(content_text,'')
        FROM documents
        ORDER BY id ASC
    """)
    rows = cur.fetchall()
    out = []
    for r in rows:
        out.append({
            "id": int(r[0]),
            "name": r[1] or "",
            "source": r[2] or "",
            "source_kind": r[3] or "",
            "doc_date": r[4] or "",
            "content_text": r[5] or "",
        })
    return out

def _embed_texts(texts: List[str]) -> List[List[float]]:
    # uses OpenAI embeddings via official SDK
    from openai import OpenAI
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set inside container")

    model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    client = OpenAI(api_key=api_key)
    resp = client.embeddings.create(model=model, input=texts)
    return [d.embedding for d in resp.data]

def main() -> None:
    db = _db_path()
    print(f"[reindex] sqlite db: {db}", flush=True)

    conn = sqlite3.connect(db)
    docs = _fetch_docs(conn)
    print(f"[reindex] total documents: {len(docs)}", flush=True)

    client = _connect_chroma()
    col = _get_collection(client)

    # optional: wipe collection first
    wipe = os.getenv("CHROMA_WIPE", "0") == "1"
    if wipe:
        try:
            col.delete(where={})
            print("[reindex] wiped existing collection", flush=True)
        except Exception as e:
            print(f"[reindex] wipe failed: {e}", flush=True)

    total_chunks = 0
    batch_texts: List[str] = []
    batch_ids: List[str] = []
    batch_meta: List[Dict[str, Any]] = []

    def flush_batch():
        nonlocal total_chunks, batch_texts, batch_ids, batch_meta
        if not batch_texts:
            return
        embs = _embed_texts(batch_texts)
        col.upsert(ids=batch_ids, documents=batch_texts, metadatas=batch_meta, embeddings=embs)
        total_chunks += len(batch_texts)
        print(f"[reindex] upserted {len(batch_texts)} chunks (total {total_chunks})", flush=True)
        batch_texts, batch_ids, batch_meta = [], [], []

    max_batch = int(os.getenv("EMBED_BATCH", "64"))

    for d in docs:
        text = d["content_text"] or ""
        text = _normalize_whitespace(text)
        if not text:
            continue

        chunks = _chunk_text(text)
        for idx, ch in enumerate(chunks):
            cid = f"doc:{d['id']}:chunk:{idx}"
            meta = {
                "doc_id": d["id"],
                "name": d["name"],
                "source": d["source"],
                "source_kind": d["source_kind"],
                "date": d["doc_date"],
                "chunk_index": idx,
            }
            batch_ids.append(cid)
            batch_texts.append(ch)
            batch_meta.append(meta)

            if len(batch_texts) >= max_batch:
                flush_batch()

    flush_batch()

    print(f"[reindex] done. total_chunks={total_chunks}", flush=True)

if __name__ == "__main__":
    main()
