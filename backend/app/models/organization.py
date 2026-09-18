from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Organization(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(160), unique=True, index=True)

    departments = relationship("Department")
    users = relationship("User")
    knowledge_bases = relationship("KnowledgeBase")
