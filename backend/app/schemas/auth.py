from pydantic import BaseModel

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str


class UserProfile(BaseModel):
    id: str
    username: str
    full_name: str | None = None
    role: UserRole
    department_id: str

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfile


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
