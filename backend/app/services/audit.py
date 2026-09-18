from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.user import User


def write_audit_log(
    db: Session,
    event_type: str,
    user: User | None = None,
    org_id: str | None = None,
    ip: str | None = None,
    user_agent: str | None = None,
    metadata: dict | None = None,
) -> AuditLog:
    log = AuditLog(
        org_id=org_id or (user.org_id if user else None),
        user_id=user.id if user else None,
        event_type=event_type,
        ip=ip,
        user_agent=user_agent,
        metadata_json=metadata,
    )
    db.add(log)
    return log
