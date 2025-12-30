import os
import time
import threading
from datetime import datetime, timezone
from typing import List

from imap_tools import MailBox, AND

from app.ingest import ingest_text_document, ingest_uploaded_file_bytes


def _safe_log(msg: str) -> None:
    """
    Print log line with UTC timestamp.
    Never raises.
    """
    try:
        ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
        print(f"[{ts}] {msg}", flush=True)
    except Exception:
        pass


def _imap_folder() -> str:
    return os.getenv("EMAIL_FOLDER", "INBOX")


def _extract_message_id(msg) -> str:
    """
    imap_tools versions differ, so we try multiple options.
    """
    mid = ""
    try:
        mid = (getattr(msg, "message_id", "") or "").strip()
    except Exception:
        mid = ""

    if not mid:
        try:
            mid = (msg.headers.get("message-id") or msg.headers.get("Message-ID") or "").strip()
        except Exception:
            mid = ""

    if not mid:
        uid = str(getattr(msg, "uid", "") or "").strip()
        dt = ""
        try:
            dt = (msg.date.isoformat() if msg.date else "")
        except Exception:
            dt = ""
        mid = f"uid:{uid}|date:{dt}|subj:{(msg.subject or '').strip()}"
    return mid


def _poll_once() -> None:
    email_user = os.getenv("EMAIL_USER", "").strip()
    email_password = os.getenv("EMAIL_PASSWORD", "").strip()
    host = os.getenv("EMAIL_HOST", "imap.gmail.com").strip()
    folder = _imap_folder()

    if not email_user or not email_password:
        _safe_log("[INFO] 📧 Email Poller: disabled (missing EMAIL_USER / EMAIL_PASSWORD)")
        return

    _safe_log("[INFO] 📧 Email Poller: connecting to IMAP")

    with MailBox(host).login(email_user, email_password, folder) as mailbox:
        _safe_log(f"[INFO] 📧 Email Poller: connected to {host}")
        _safe_log(f"[INFO] 📧 Email Poller: selected folder {folder}")

        unseen = list(mailbox.fetch(AND(seen=False), mark_seen=False))
        _safe_log(f"[INFO] 📧 Email Poller: UNSEEN messages in {folder}: {len(unseen)}")

        for msg in unseen:
            msg_date = msg.date or datetime.now(timezone.utc)
            doc_date = msg_date.date().isoformat()

            subject = (msg.subject or "(no subject)").strip()
            message_id = _extract_message_id(msg)

            body_parts: List[str] = []
            if msg.text:
                body_parts.append(msg.text)
            if msg.html:
                body_parts.append("\n\n[HTML]\n" + msg.html)

            body_text = "\n".join(body_parts).strip()
            body_name = f"Email: {subject}"

            ok_body = True
            ok_attachments = True
            attachments_count = 0

            try:
                ingest_text_document(
                    name=body_name,
                    text=body_text or "(empty email body)",
                    source="Email",
                    doc_date=doc_date,
                    email_message_id=message_id,
                    source_kind="email_body",
                )
            except Exception as e:
                ok_body = False
                _safe_log(f'[ERROR] 📧 Failed ingest email body "{subject}": {e}')

            try:
                for att in msg.attachments or []:
                    attachments_count += 1
                    filename = att.filename or f"attachment-{attachments_count}"
                    ingest_uploaded_file_bytes(
                        filename=filename,
                        content=att.payload,
                        source="Email",
                        doc_date=doc_date,
                        email_message_id=message_id,
                        source_kind="email_attachment",
                    )
            except Exception as e:
                ok_attachments = False
                _safe_log(f'[ERROR] 📧 Failed ingest attachment(s) "{subject}": {e}')

            if ok_body and ok_attachments:
                try:
                    mailbox.flag(msg.uid, "\\Seen", True)
                    _safe_log(
                        f'[INFO] 📧 Email ingested: "{subject}" | Date: {doc_date} | Attachments: {attachments_count}'
                    )
                except Exception as e:
                    _safe_log(f'[WARN] 📧 Failed mark SEEN "{subject}": {e}')
            else:
                _safe_log(f'[WARN] 📧 Email left UNSEEN due to errors: "{subject}"')


def run_email_poller_forever(interval_seconds: int = 300) -> None:
    _safe_log(f"[INFO] 📧 Email Poller started, interval={interval_seconds}s")

    while True:
        try:
            _poll_once()
        except Exception as e:
            _safe_log(f"[ERROR] 📧 Email Poller: unexpected error: {e}")

        next_ts = datetime.now(timezone.utc).timestamp() + interval_seconds
        next_iso = datetime.fromtimestamp(next_ts, tz=timezone.utc).isoformat(timespec="seconds")
        _safe_log(f"[INFO] 📧 Email Poller: sleeping {interval_seconds}s, next poll at {next_iso}")
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
