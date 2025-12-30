from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from .db import get_db
from .models import Document
from .auth import get_current_user

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/docs")
def list_docs(db: Session = Depends(get_db), user=Depends(get_current_user)):
    docs = (
        db.query(Document)
        .order_by(Document.doc_date.desc(), Document.created_at.desc())
        .all()
    )

    return [
        {
            "id": d.id,
            "name": d.name,
            "source": d.source,
            "source_kind": getattr(d, "source_kind", None),
            "doc_date": d.doc_date.isoformat() if d.doc_date else "",
            "created_at": d.created_at.isoformat() if d.created_at else "",
        }
        for d in docs
    ]


@router.get("/stats")
def stats(db: Session = Depends(get_db), user=Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    last24 = now - timedelta(hours=24)

    total_docs = db.query(func.count(Document.id)).scalar() or 0

    uploaded_manual = (
        db.query(func.count(Document.id))
        .filter(Document.source_kind == "upload")
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

    emails_ingested_last_24h = (
        db.query(func.count(Document.id))
        .filter(Document.source_kind == "email_body")
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
