from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class ApiUsageLog(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "api_usage_logs"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    model_used: Mapped[str | None] = mapped_column(String(120))
    response_time_ms: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="success")
    error_msg: Mapped[str | None] = mapped_column(Text)
    detail_json: Mapped[dict | None] = mapped_column(JSONB)


class AuditLog(UUIDMixin, Base):
    __tablename__ = "audit_logs"

    org_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id", ondelete="SET NULL"), index=True)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    event_type: Mapped[str] = mapped_column(String(120), index=True)
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
