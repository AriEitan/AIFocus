import os
import time
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from imap_tools import MailBox, AND

from app.ingest import ingest_text_document, ingest_uploaded_file_bytes

_STATUS_LOCK = threading.Lock()

EMAIL_STATUS: Dict[str, Any] = {
    "ok": None,  # None = unknown, True/False after attempts
    "last_attempt_utc": None,
    "last_success_utc": None,
    "last_error": None,
    "last_unseen_count": None,
    "last_ingested_count": None,
}


def _now_utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _update_status(**kwargs: Any) -> None:
    with _STATUS_LOCK:
        for k, v in kwargs.items():
            EMAIL_STATUS[k] = v


def get_email_status() -> Dict[str, Any]:
    with _STATUS_LOCK:
        return dict(EMAIL_STATUS)


def _safe_log(msg: str) -> None:
    try:
        ts = datetime.now(timezone.utc).isoformat()
        print(f"[{ts}] {msg}", flush=True)
    except Exception:
        pass


def _get_env(name: str) -> Optional[str]:
    v = os.getenv(name)
    if v is None:
        return None
    v = v.strip()
    return v if v else None


def _get_imap_creds() -> Dict[str, str]:
    host = _get_env("IMAP_HOST") or "imap.gmail.com"
    folder = _get_env("IMAP_FOLDER") or "INBOX"

    # support both naming styles
    user = _get_env("IMAP_USER") or _get_env("EMAIL_USER") or _get_env("GMAIL_USER")
    password = (
        _get_env("IMAP_PASS")
        or _get_env("IMAP_PASSWORD")
        or _get_env("EMAIL_PASSWORD")
        or _get_env("GMAIL_APP_PASSWORD")
    )

    if not user or not password:
        raise RuntimeError("Missing IMAP credentials (IMAP_USER/IMAP_PASS or EMAIL_USER/EMAIL_PASSWORD)")

    return {"host": host, "folder": folder, "user": user, "password": password}


def _extract_message_id(msg: Any) -> str:
    try:
        mid = getattr(msg, "message_id", None)
        if mid:
            return str(mid).strip()
    except Exception:
        pass
    return ""


def _poll_once() -> Dict[str, Any]:
    _update_status(last_attempt_utc=_now_utc_iso())
    creds = _get_imap_creds()

    host = creds["host"]
    folder = creds["folder"]
    user = creds["user"]
    password = creds["password"]

    ingested_count = 0
    unseen_count = 0

    _safe_log("[INFO] 📧 Email Poller: connecting to IMAP")
    try:
        # IMPORTANT: do NOT pass folder= to login (not supported in some imap-tools versions)
        mailbox = MailBox(host).login(user, password)
        try:
            _safe_log(f"[INFO] 📧 Email Poller: connected to {host}")

            # Select folder explicitly
            mailbox.folder.set(folder)
            _safe_log(f"[INFO] 📧 Email Poller: selected folder {folder}")

            unseen = list(mailbox.fetch(AND(seen=False), mark_seen=False))
            unseen_count = len(unseen)
            _safe_log(f"[INFO] 📧 Email Poller: UNSEEN messages in {folder}: {unseen_count}")

            for msg in unseen:
                msg_date = getattr(msg, "date", None) or datetime.now(timezone.utc)
                doc_date = msg_date.date().isoformat()

                subject = (getattr(msg, "subject", None) or "(no subject)").strip()
                message_id = _extract_message_id(msg)

                ok_body = True
                ok_attachments = True

                # Ingest body (text + html)
                try:
                    parts: List[str] = []
                    if getattr(msg, "text", None):
                        parts.append(str(getattr(msg, "text")))
                    if getattr(msg, "html", None):
                        parts.append(str(getattr(msg, "html")))
                    body = "\n\n".join([p for p in parts if p and p.strip()]).strip()

                    if body:
                        ingest_text_document(
                            text=body,
                            filename=f"Email|{subject}|{doc_date}",
                            source="Email",
                            doc_date=doc_date,
                            email_message_id=message_id,
                            source_kind="email_body",
                        )
                except Exception as e:
                    ok_body = False
                    _safe_log(f'[ERROR] 📧 Failed ingest email body "{subject}": {e}')

                # Ingest attachments
                try:
                    attachments = list(getattr(msg, "attachments", []) or [])
                    for att in attachments:
                        try:
                            filename = getattr(att, "filename", None) or "attachment"
                            payload = getattr(att, "payload", None)
                            if not payload:
                                continue
                            ingest_uploaded_file_bytes(
                                filename=filename,
                                content=payload,
                                source="Email",
                                doc_date=doc_date,
                                email_message_id=message_id,
                                source_kind="email_attachment",
                            )
                        except Exception as e:
                            ok_attachments = False
                            _safe_log(f'[ERROR] 📧 Failed ingest attachment "{subject}": {e}')
                except Exception as e:
                    ok_attachments = False
                    _safe_log(f'[ERROR] 📧 Failed list attachments "{subject}": {e}')

                # Mark as seen only if we ingested successfully
                if ok_body and ok_attachments:
                    try:
                        mailbox.flag(msg.uid, "\\Seen", True)
                        ingested_count += 1
                        _safe_log(f'[INFO] 📧 Email ingested: "{subject}" | Date: {doc_date} | Marked SEEN')
                    except Exception as e:
                        _safe_log(f'[WARN] 📧 Failed mark SEEN "{subject}": {e}')
                else:
                    _safe_log(f'[WARN] 📧 Email left UNSEEN due to errors: "{subject}"')

            _update_status(
                ok=True,
                last_success_utc=_now_utc_iso(),
                last_error=None,
                last_unseen_count=unseen_count,
                last_ingested_count=ingested_count,
            )
            return {"ok": True, "unseen": unseen_count, "ingested": ingested_count}

        finally:
            try:
                mailbox.logout()
            except Exception:
                pass

    except Exception as e:
        _update_status(
            ok=False,
            last_error=str(e),
            last_unseen_count=unseen_count if unseen_count else None,
            last_ingested_count=ingested_count if ingested_count else None,
        )
        raise


def poll_now() -> Dict[str, Any]:
    return _poll_once()


def run_email_poller_forever(interval_seconds: int = 300) -> None:
    _safe_log(f"[INFO] 📧 Email Poller started, interval={interval_seconds}s")

    while True:
        try:
            _poll_once()
        except Exception as e:
            _safe_log(f"[ERROR] 📧 Email Poller: unexpected error: {e}")

        _safe_log(f"[INFO] 📧 Email Poller: sleeping {interval_seconds}s")
        time.sleep(interval_seconds)


def start_email_poller_background(interval_seconds: int = 300) -> None:
    if getattr(start_email_poller_background, "_started", False):
        return

    t = threading.Thread(
        target=run_email_poller_forever,
        args=(interval_seconds,),
        daemon=True,
    )
    t.start()
    start_email_poller_background._started = True  # type: ignore

    _safe_log("[INFO] 📧 Email Poller thread started")
