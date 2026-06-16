from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from db.database import get_db
from models.app_schemas import AppLoginRequest, AppLoginResponse, AppUserInfo
from services.admin.user_service import authenticate_app_user

router = APIRouter(tags=["Authentication"])


@router.post("/login", response_model=AppLoginResponse)
def app_login(body: AppLoginRequest, db: Session = Depends(get_db)):
    """Authenticate application users against the PostgreSQL users table."""
    user = authenticate_app_user(db, body.username, body.password)
    return AppLoginResponse(
        user=AppUserInfo(id=user.id, username=user.username),
    )
