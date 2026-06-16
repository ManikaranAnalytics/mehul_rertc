from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db.admin_models import LoginStatus
from db.database import get_db
from dependencies.admin_auth import get_current_admin
from models.admin_schemas import (
    AdminLoginRequest,
    AdminLoginResponse,
    ResetPasswordRequest,
    UserCreateRequest,
    UserListResponse,
    UserResponse,
    UserStatsResponse,
    UserUpdateRequest,
)
from services.admin.admin_auth import validate_admin_credentials
from services.admin.jwt_service import create_admin_token
from services.admin.user_service import (
    create_user,
    delete_user,
    get_user_stats,
    list_users,
    paginate_meta,
    reset_user_password,
    set_user_status,
    update_user,
)

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/login", response_model=AdminLoginResponse)
def admin_login(body: AdminLoginRequest):
    username = validate_admin_credentials(body.username, body.password)
    token = create_admin_token(username)
    return AdminLoginResponse(access_token=token, username=username)


@router.get("/users/stats", response_model=UserStatsResponse)
def admin_user_stats(
    db: Session = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    return get_user_stats(db)


@router.get("/users", response_model=UserListResponse)
def admin_list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None, max_length=64),
    db: Session = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    items, total = list_users(db, page=page, page_size=page_size, search=search)
    meta = paginate_meta(total, page, page_size)
    return UserListResponse(items=items, **meta)


@router.post("/users", response_model=UserResponse, status_code=201)
def admin_create_user(
    body: UserCreateRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    return create_user(
        db,
        username=body.username,
        password=body.password,
        login_status=body.login_status,
    )


@router.put("/users/{user_id}", response_model=UserResponse)
def admin_update_user(
    user_id: int,
    body: UserUpdateRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    return update_user(
        db,
        user_id,
        username=body.username,
        password=body.password,
        login_status=body.login_status,
    )


@router.delete("/users/{user_id}", status_code=204)
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    delete_user(db, user_id)


@router.post("/users/{user_id}/reset-password", response_model=UserResponse)
def admin_reset_password(
    user_id: int,
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    return reset_user_password(db, user_id, body.password)


@router.post("/users/{user_id}/activate", response_model=UserResponse)
def admin_activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    return set_user_status(db, user_id, LoginStatus.ACTIVE.value)


@router.post("/users/{user_id}/deactivate", response_model=UserResponse)
def admin_deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    return set_user_status(db, user_id, LoginStatus.INACTIVE.value)


@router.post("/users/{user_id}/lock", response_model=UserResponse)
def admin_lock_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: dict = Depends(get_current_admin),
):
    return set_user_status(db, user_id, LoginStatus.LOCKED.value)
