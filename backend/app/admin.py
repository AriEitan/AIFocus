from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from .db import get_db
from .models import Document
from .auth import get_current_user
from .email_poller import get_email_status, poll_now

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/docs")
def list_docs(db: Session = Depends(get_db), user=Depends(get_current_user)):
    docs = (
        db.query(Document)
        .order_by(Document.created_at.desc())
        .limit(200)
        .all()
    )

    return [
        {
            "id": d.id,
            "name": d.name,
            "source": d.source,
            "source_kind": d.source_kind,
            "doc_date": d.doc_date,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in docs
    ]


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(get_current_user)):
    total_docs = db.query(func.count(Document.id)).scalar() or 0

    uploaded_manual = (
        db.query(func.count(Document.id))
        .filter(Document.source == "Upload")
        .scalar()
        or 0
    )

    emails_bodies = (
        db.query(func.count(Document.id))
        .filter(Document.source_kind == "email_body")
        .scalar()
        or 0
    )

    email_attachments = (
        db.query(func.count(Document.id))
        .filter(Document.source_kind == "email_attachment")
        .scalar()
        or 0
    )

    last24 = datetime.now(timezone.utc) - timedelta(hours=24)
    emails_ingested_last_24h = (
        db.query(func.count(Document.id))
        .filter(Document.source == "Email")
        .filter(Document.created_at >= last24)
        .scalar()
        or 0
    )

    return {
        "total_docs": int(total_docs),
        "uploaded_manual": int(uploaded_manual),
        "emails_bodies": int(emails_bodies),
        "email_attachments": int(email_attachments),
        "emails_ingested_last_24h": int(emails_ingested_last_24h),
    }


@router.get("/email/status")
def email_status(user=Depends(get_current_user)):
    return get_email_status()


@router.post("/email/poll-now")
def email_poll_now(user=Depends(get_current_user)):
    """
    Trigger a poll immediately, return whether new emails were processed.
    """
    try:
        res = poll_now()
        return res
    except Exception as e:
        # keep a consistent JSON shape
        return {"ok": False, "error": str(e)}
