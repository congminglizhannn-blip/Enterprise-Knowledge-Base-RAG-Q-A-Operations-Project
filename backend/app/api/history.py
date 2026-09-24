from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.history import HistoryOptions, HistoryPage, HistoryQuery
from app.services.history import history_options, list_history

router = APIRouter()


@router.get("", response_model=HistoryPage)
def get_history(query: Annotated[HistoryQuery, Query()], current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list_history(db, current_user, query)


@router.get("/filter-options", response_model=HistoryOptions)
def get_options(org_id: UUID | None = None, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return history_options(db, current_user, str(org_id) if org_id else None)
