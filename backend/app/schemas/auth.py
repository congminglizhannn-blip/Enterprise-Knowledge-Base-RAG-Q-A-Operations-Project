from datetime import datetime

from pydantic import BaseModel

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: str | None = None
    full_name: str | None = None
    org_id: str | None = None
    organization_name: str | None = None
    department_name: str | None = None
    invite_code: str | None = None


class UserProfile(BaseModel):
    id: str
    username: str
    full_name: str | None = None
    role: UserRole
    org_id: str
    department_id: str
    must_change_password: bool = False

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfile


class OrgProfile(BaseModel):
    id: str
    name: str

    model_config = {"from_attributes": True}


class DepartmentProfile(BaseModel):
    id: str
    name: str

    model_config = {"from_attributes": True}


class AuthProfileResponse(BaseModel):
    user: UserProfile
    org: OrgProfile
    department: DepartmentProfile


class AuthUserResponse(TokenResponse):
    org: OrgProfile
    department: DepartmentProfile


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class RefreshTokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class CsrfTokenResponse(BaseModel):
    csrf_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class InviteCreateRequest(BaseModel):
    role: UserRole = UserRole.USER
    department_id: str | None = None
    expires_in_days: int = 7


class InviteRead(BaseModel):
    id: str
    org_id: str
    role: UserRole
    department_id: str
    expires_at: datetime
    used_by: str | None = None
    used_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class InviteCreateResponse(InviteRead):
    invite_code: str
    invite_url: str


class InviteValidateResponse(BaseModel):
    valid: bool
    org_name: str
    department_name: str
    role: UserRole
    expires_at: datetime


class ResetPasswordRequest(BaseModel):
    temporary_password: str | None = None


class ResetPasswordResponse(BaseModel):
    user_id: str
    temporary_password: str


class AuthSessionRead(BaseModel):
    id: str
    created_at: datetime
    updated_at: datetime
    expires_at: datetime
    absolute_expires_at: datetime
    revoked_at: datetime | None = None
    user_agent: str | None = None
    ip: str | None = None
    is_current: bool = False

    model_config = {"from_attributes": True}
