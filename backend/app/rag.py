import os
from typing import List, Dict, Any, Tuple, Optional

import chromadb
from chromadb.config import Settings

# Optional: if available in your chromadb version, this makes query_texts work with OpenAI embeddings
try:
    from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction
except Exception:
    OpenAIEmbeddingFunction = None  # type: ignore


def openai_available() -> bool:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    return bool(key)


def _chroma_settings() -> Settings:
    """
    Telemetry off. Some chromadb versions have slightly different Settings fields,
    so keep this minimal and safe.
    """
    try:
        return Settings(anonymized_telemetry=False, allow_reset=False)
    except Exception:
        return Settings()  # type: ignore


def chroma_client() -> chromadb.Client:
    persist_dir = os.getenv("CHROMA_PERSIST_DIR", "/data/chroma").strip() or "/data/chroma"
    return chromadb.PersistentClient(
        path=persist_dir,
        settings=_chroma_settings(),
    )


def _openai_embedding_function() -> Optional[object]:
    """
    Returns an embedding function object for chroma, or None if not available.
    This is what prevents the 384 vs 1536 mismatch when using query_texts.
    """
    if not openai_available():
        return None
    if OpenAIEmbeddingFunction is None:
        return None

    model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small").strip() or "text-embedding-3-small"
    return OpenAIEmbeddingFunction(
        api_key=os.getenv("OPENAI_API_KEY"),
        model_name=model,
    )


def get_collection() -> chromadb.api.models.Collection.Collection:
    client = chroma_client()

    # Key fix: attach the OpenAI embedding function to the collection if possible.
    # That makes query_texts consistent with the collection dimension.
    ef = _openai_embedding_function()
    if ef is not None:
        return client.get_or_create_collection(name="focusai_docs", embedding_function=ef)

    # Fallback: still works if you always use query_embeddings/upsert embeddings explicitly
    return client.get_or_create_collection(name="focusai_docs")


def embed_texts_openai(texts: List[str]) -> Tuple[bool, List[List[float]], str]:
    """
    Returns: (ok, vectors, error_message)
    Never raises.
    """
    if not openai_available():
        return (False, [], "disabled")

    try:
        from langchain_openai import OpenAIEmbeddings

        model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small").strip() or "text-embedding-3-small"
        emb = OpenAIEmbeddings(model=model)
        vectors = emb.embed_documents(texts)
        return (True, vectors, "")
    except Exception as e:
        msg = str(e)
        print(f"[INFO] 🤖 OpenAI embeddings error: {msg}", flush=True)
        return (False, [], msg)


def add_to_chroma(doc_id: str, text: str, metadata: Dict[str, Any]) -> Tuple[str, str]:
    """
    Returns: (status: ok|disabled|failed, error_message_or_empty)
    Never raises.
    """
    if not openai_available():
        return ("disabled", "")

    ok, vectors, err = embed_texts_openai([text])
    if not ok:
        if err == "disabled":
            return ("disabled", "")
        return ("failed", err)

    try:
        col = get_collection()
        col.upsert(
            ids=[doc_id],
            embeddings=vectors,
            documents=[text],
            metadatas=[metadata],
        )
        return ("ok", "")
    except Exception as e:
        msg = str(e)
        print(f"[INFO] 🧠 Chroma upsert error: {msg}", flush=True)
        return ("failed", msg)


def query_chroma(query_text: str, n_results: int = 6) -> Dict[str, Any]:
    """
    If OpenAI embeddings are not available, returns empty results.
    Uses query_embeddings to be explicit and avoid model mismatch issues.
    """
    if not openai_available():
        return {"ok": False, "reason": "disabled", "results": []}

    ok, vectors, err = embed_texts_openai([query_text])
    if not ok or not vectors:
        return {"ok": False, "reason": err or "failed", "results": []}

    try:
        col = get_collection()
        res = col.query(
            query_embeddings=vectors,
            n_results=n_results,
            include=["documents", "metadatas", "distances"],
        )

        ids = res.get("ids", [[]])[0] if res.get("ids") else []
        docs = res.get("documents", [[]])[0] if res.get("documents") else []
        metas = res.get("metadatas", [[]])[0] if res.get("metadatas") else []
        dists = res.get("distances", [[]])[0] if res.get("distances") else []

        results = []
        for i in range(len(ids)):
            results.append(
                {
                    "id": ids[i],
                    "distance": dists[i] if i < len(dists) else None,
                    "doc": docs[i] if i < len(docs) else "",
                    "meta": metas[i] if i < len(metas) else {},
                }
            )

        return {"ok": True, "reason": "", "results": results}
    except Exception as e:
        msg = str(e)
        print(f"[INFO] 🧠 Chroma query error: {msg}", flush=True)
        return {"ok": False, "reason": msg, "results": []}
