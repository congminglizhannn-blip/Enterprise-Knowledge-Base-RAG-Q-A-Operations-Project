from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class ApiUsageLog(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "api_usage_logs"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    model_used: Mapped[str | None] = mapped_column(String(120))
    response_time_ms: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(30), default="success")
    error_msg: Mapped[str | None] = mapped_column(Text)
    detail_json: Mapped[dict | None] = mapped_column(JSONB)
