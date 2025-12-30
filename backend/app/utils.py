import os
from datetime import datetime, timezone
from typing import Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def safe_yyyymmdd(dt: Optional[datetime]) -> str:
    if not dt:
        return datetime.now().strftime("%Y-%m-%d")
    return dt.strftime("%Y-%m-%d")
