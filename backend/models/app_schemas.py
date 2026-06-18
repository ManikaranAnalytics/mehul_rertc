from pydantic import BaseModel, Field


class AppLoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=128)


class AppUserInfo(BaseModel):
    id: int
    username: str


class AppLoginResponse(BaseModel):
    success: bool = True
    user: AppUserInfo
