from sqlalchemy import Column, Integer, String, Date, DateTime, Text, func
from .db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)

    # "admin" / "user"
    role = Column(String, default="user", nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False)
    source = Column(String, nullable=False)  # "Upload" / "Email"
    source_kind = Column(String, nullable=False, default="upload")  # upload | email_body | email_attachment

    doc_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    content_text = Column(Text, nullable=False)

    # optional: link email docs/attachments
    email_message_id = Column(String, nullable=True)
