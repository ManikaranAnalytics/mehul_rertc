from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

LoginStatusLiteral = Literal["ACTIVE", "INACTIVE", "LOCKED"]


class AdminLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class AdminLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class UserCreateRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    login_status: LoginStatusLiteral = "ACTIVE"

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Username cannot be empty")
        return cleaned


class UserUpdateRequest(BaseModel):
    username: str | None = Field(None, min_length=2, max_length=64)
    password: str | None = Field(None, min_length=6, max_length=128)
    login_status: LoginStatusLiteral | None = None

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Username cannot be empty")
        return cleaned


class ResetPasswordRequest(BaseModel):
    password: str = Field(..., min_length=6, max_length=128)


class UserResponse(BaseModel):
    id: int
    username: str
    login_status: LoginStatusLiteral
    created_at: datetime
    updated_at: datetime


class UserListResponse(BaseModel):
    items: list[UserResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class UserStatsResponse(BaseModel):
    total_users: int
    active_users: int
    inactive_users: int
    locked_users: int
