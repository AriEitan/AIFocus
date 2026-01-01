import os
from datetime import datetime
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.rag import openai_available, retrieve_context

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    focus: Optional[str] = "house"  # house | yard | admin


class ChatResponse(BaseModel):
    answer: str
    sources: List[dict] = []


def _fallback_answer(question: str, focus: str) -> str:
    focus_he = {"house": "בית", "yard": "צ'אט", "admin": "אדמין"}.get(focus, focus)
    return (
        "אני כרגע עובד במצב ללא OpenAI.\n\n"
        f"מיקוד: {focus_he}\n"
        f"שאלה: {question}\n\n"
        "מה אפשר לעשות עכשיו:\n"
        "1) נסה לשאול בצורה יותר ממוקדת.\n"
        "2) בדוק שה־OPENAI_API_KEY מוגדר תקין בבקנד.\n"
        "3) אם עדיין יש זמן־אאוט, נוסיף לוגים ונראה איפה זה נתקע.\n"
    )


def _openai_answer(question: str, focus: str) -> str:
    """
    Calls OpenAI. Must never hang indefinitely, otherwise Railway edge returns 504.
    """
    try:
        from openai import OpenAI

        import httpx

        timeout_s = float(os.getenv("OPENAI_TIMEOUT_S", "20"))
        http_client = httpx.Client(
            timeout=httpx.Timeout(timeout_s, connect=min(5.0, timeout_s))
        )

        client = OpenAI(
            api_key=os.getenv("OPENAI_API_KEY"),
            http_client=http_client,
            timeout=timeout_s,
        )

        # Retrieve a small context from RAG (keep it bounded so requests stay fast)
        docs = retrieve_context(question, focus=focus)
        context_docs = docs[:8]

        context = "\n\n".join(
            [
                f'[{i+1}] {d.get("name","")} | {d.get("date","")}\n{(d.get("text","") or "")[:1800]}'
                for i, d in enumerate(context_docs)
            ]
        )

        system = (
            "You are FocusAI, an assistant for a home renovation project. "
            "Answer in Hebrew. Be concise and practical. "
            "If you use context, reference it by [number]."
        )

        user = (
            f"Date: {datetime.utcnow().isoformat()}Z\n"
            f"Focus: {focus}\n\n"
            f"Context:\n{context}\n\n"
            f"Question:\n{question}\n"
        )

        resp = client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
        )

        answer = (resp.choices[0].message.content or "").strip()
        if not answer:
            return _fallback_answer(question, focus)

        return answer

    except Exception:
        # Never fail the endpoint, always return a safe answer quickly.
        return _fallback_answer(question, focus)


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest, user=Depends(get_current_user)):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="Message is required")

    focus = (req.focus or "house").strip().lower()

    if not openai_available():
        return ChatResponse(answer=_fallback_answer(req.message, focus), sources=[])

    answer = _openai_answer(req.message, focus)
    return ChatResponse(answer=answer, sources=[])
