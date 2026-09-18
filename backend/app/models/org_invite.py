from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin
from app.models.enums import UserRole
from app.models.types import value_enum


class OrgInvite(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "org_invites"

    org_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    role: Mapped[UserRole] = mapped_column(value_enum(UserRole, "user_role"))
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    used_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))

    organization = relationship("Organization")
    department = relationship("Department")
