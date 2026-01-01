import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.db import Base, engine, SessionLocal
from app.models import User
from app.auth import router as auth_router, get_password_hash
from app.ingest import router as ingest_router
from app.admin import router as admin_router
from app.chat import router as chat_router
from app.email_poller import start_email_poller_background


def _parse_origins() -> list[str]:
    origins_raw = os.getenv("CORS_ORIGINS", "")
    allow_origins = [o.strip() for o in origins_raw.split(",") if o.strip()]
    return allow_origins or ["*"]


app = FastAPI(title="FocusAI", version="0.1.0")

# CORS middleware (once)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _ensure_users_role_column() -> None:
    db = SessionLocal()
    try:
        cols = db.execute(text("PRAGMA table_info(users)")).fetchall()
        col_names = {row[1] for row in cols}  # row[1] = column name

        if "role" not in col_names:
            try:
                db.execute(
                    text("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'")
                )
                db.commit()
                print("[INFO] DB migration: added users.role (default=user)", flush=True)
            except Exception as e:
                msg = str(e).lower()
                if "duplicate" in msg or "already exists" in msg:
                    pass
                else:
                    raise
    finally:
        db.close()


def ensure_default_admin_local() -> None:
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.username == "admin").first()
        if admin is None:
            admin = User(
                username="admin",
                hashed_password=get_password_hash("admin"),
                role="admin",
            )
            db.add(admin)
            db.commit()
            print("[INFO] Created default admin user admin/admin", flush=True)
        else:
            if getattr(admin, "role", None) != "admin":
                admin.role = "admin"
                db.commit()
                print("[INFO] Updated existing admin user role=admin", flush=True)
    finally:
        db.close()


@app.on_event("startup")
def on_startup() -> None:
    # Ensure base tables exist
    Base.metadata.create_all(bind=engine)

    # Run migrations BEFORE querying models
    _ensure_users_role_column()

    # Ensure default admin exists
    ensure_default_admin_local()

    # Start email poller in background
    interval = int(os.getenv("EMAIL_POLL_INTERVAL_SECONDS", "300"))
    start_email_poller_background(interval_seconds=interval)


@app.get("/api/health")
def health():
    return {"ok": True}


# Routers
app.include_router(auth_router)
app.include_router(ingest_router)
app.include_router(admin_router)
app.include_router(chat_router)
