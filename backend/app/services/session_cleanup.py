from datetime import UTC, datetime, timedelta

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models.auth_session import AuthSession


def cleanup_expired_sessions(db: Session, revoked_retention_days: int = 30) -> int:
    now = datetime.now(UTC)
    revoked_cutoff = now - timedelta(days=revoked_retention_days)
    stmt = delete(AuthSession).where(
        (AuthSession.absolute_expires_at <= now)
        | (AuthSession.expires_at <= now)
        | ((AuthSession.revoked_at.is_not(None)) & (AuthSession.revoked_at <= revoked_cutoff))
    )
    result = db.execute(stmt)
    db.commit()
    return result.rowcount or 0
