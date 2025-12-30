import os
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db import get_db
from app.auth import get_current_user
from app.models import Document
from app.rag import openai_available, query_chroma

router = APIRouter(prefix="/api", tags=["chat"])


class ChatRequest(BaseModel):
    message: str


def _latest_docs(db: Session, limit: int = 6) -> List[Document]:
    return (
        db.query(Document)
        .order_by(Document.doc_date.desc(), Document.created_at.desc())
        .limit(limit)
        .all()
    )


def _build_citations_docs(docs: List[Document]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    seen = set()
    for d in docs:
        key = (d.name, str(d.doc_date))
        if key in seen:
            continue
        seen.add(key)
        out.append({"name": d.name or "", "date": str(d.doc_date or "")})
    return out


def _tokenize_query(q: str) -> List[str]:
    q = (q or "").strip().lower()
    # keep hebrew, latin, numbers
    tokens = re.findall(r"[0-9a-zA-Z\u0590-\u05FF]{2,}", q)
    # de-dupe, keep order
    out = []
    seen = set()
    for t in tokens:
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out[:10]


def _search_docs_sql(db: Session, user_message: str, limit: int = 6) -> List[Document]:
    """
    Retrieval directly from SQLite: match tokens against name/content_text.
    We also bias to recent docs by ordering.
    """
    tokens = _tokenize_query(user_message)
    q = db.query(Document).filter(Document.content_text != None)  # noqa

    if tokens:
        clauses = []
        for t in tokens:
            like = f"%{t}%"
            clauses.append(Document.name.ilike(like))
            clauses.append(Document.content_text.ilike(like))
        q = q.filter(or_(*clauses))

    return (
        q.order_by(Document.doc_date.desc(), Document.created_at.desc())
        .limit(limit)
        .all()
    )


def _fallback_answer(db: Session, user_message: str, reason: str = "no_openai") -> Dict[str, Any]:
    # First try SQL retrieval, then fallback to latest docs
    docs = _search_docs_sql(db, user_message, limit=6)
    if not docs:
        docs = _latest_docs(db, limit=6)

    citations = _build_citations_docs(docs)

    summary_bits = []
    for d in docs[:4]:
        snippet = (d.content_text or "")[:700].strip()
        if snippet:
            summary_bits.append(f"מסמך: {d.name} ({d.doc_date})\n{snippet}")

    if not summary_bits:
        answer = "עדיין אין מסמכים עם תוכן במערכת. העלה קבצים או חבר אימייל ואז נסה שוב."
    else:
        answer = (
            "אין לי חיבור פעיל ל-OpenAI כרגע, אז אני עונה במצב fallback על בסיס מסמכים שמצאתי ב-DB.\n\n"
            + "\n\n".join(summary_bits)
        )

    return {
        "mode": "fallback",
        "openai_ok": False,
        "fallback_reason": reason,
        "answer": answer,
        "citations": citations,
    }


def _openai_answer(db: Session, user_message: str) -> Dict[str, Any]:
    """
    Uses Chroma retrieval + OpenAI.
    If Chroma returns nothing, fallback to SQL retrieval (still with OpenAI if possible).
    """
    rag = query_chroma(user_message, n_results=6)
    results = []
    if rag.get("ok"):
        results = rag.get("results", []) or []

    context_docs = []

    if results:
        for r in results:
            meta = r.get("meta") or {}
            context_docs.append(
                {
                    "id": r.get("id"),
                    "name": meta.get("name", ""),
                    "date": meta.get("date", ""),
                    "source": meta.get("source", ""),
                    "text": (r.get("doc") or "")[:1800],
                }
            )
    else:
        # Critical: if chroma has no index, still retrieve from SQLite
        docs = _search_docs_sql(db, user_message, limit=6)
        for d in docs:
            context_docs.append(
                {
                    "id": str(d.id),
                    "name": d.name or "",
                    "date": str(d.doc_date or ""),
                    "source": d.source or "",
                    "text": (d.content_text or "")[:1800],
                }
            )

    citations = [{"name": d["name"], "date": d["date"]} for d in context_docs if d["name"] and d["date"]]

    if not context_docs:
        return _fallback_answer(db, user_message, reason="no_docs")

    system = (
        "אתה עוזר מנהלים בשם FocusAI. תמיד תעדיף מידע עם התאריך הכי חדש. "
        "תענה בעברית. אם יש סתירה, תבחר את המידע עם התאריך הכי חדש. "
        "בסוף תן תשובה קצרה וברורה. אל תמציא עובדות."
    )

    context_block = "\n\n".join(
        [f'[{i+1}] {d["name"]} | {d["date"]}\n{d["text"]}' for i, d in enumerate(context_docs)]
    )

    prompt = f"שאלה: {user_message}\n\nמסמכים רלוונטיים (הכי חדשים חשוב):\n{context_block}"

    try:
        from openai import OpenAI

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
        answer = (resp.choices[0].message.content or "").strip()
        if not answer:
            return _fallback_answer(db, user_message, reason="empty_openai_answer")

        return {
            "mode": "openai",
            "openai_ok": True,
            "answer": answer,
            "citations": citations[:8],
            "retrieval": "chroma" if results else "sqlite",
        }
    except Exception as e:
        msg = str(e).lower()
        if "insufficient_quota" in msg or "quota" in msg or "429" in msg or "rate limit" in msg:
            fb = _fallback_answer(db, user_message, reason="quota_or_rate_limited")
            fb["openai_error"] = "quota_or_rate_limited"
            return fb

        fb = _fallback_answer(db, user_message, reason="openai_failed")
        fb["openai_error"] = "openai_failed"
        return fb


@router.post("/chat")
def chat(payload: ChatRequest, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not openai_available():
        return _fallback_answer(db, payload.message, reason="openai_unavailable")
    return _openai_answer(db, payload.message)
