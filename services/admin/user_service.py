from math import ceil

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from db.admin_models import LoginStatus, User
from services.admin.password import hash_password, verify_password


def _to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "login_status": user.login_status,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


def get_user_by_id(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def get_user_by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username))


def authenticate_app_user(db: Session, username: str, password: str) -> User:
    """Authenticate an application user from the users table."""
    user = get_user_by_username(db, username.strip())
    if not user or not verify_password(password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if user.login_status == LoginStatus.LOCKED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is locked",
        )
    if user.login_status == LoginStatus.INACTIVE.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive",
        )

    return user


def list_users(
    db: Session,
    *,
    page: int = 1,
    page_size: int = 20,
    search: str | None = None,
) -> tuple[list[dict], int]:
    filters = []
    if search:
        filters.append(User.username.ilike(f"%{search.strip()}%"))

    total_query = select(func.count()).select_from(User)
    list_query = select(User)
    for f in filters:
        total_query = total_query.where(f)
        list_query = list_query.where(f)

    total = db.scalar(total_query) or 0
    offset = (page - 1) * page_size
    rows = db.scalars(
        list_query.order_by(User.id.asc()).offset(offset).limit(page_size)
    ).all()
    return [_to_dict(row) for row in rows], total


def get_user_stats(db: Session) -> dict[str, int]:
    total = db.scalar(select(func.count()).select_from(User)) or 0
    active = db.scalar(
        select(func.count()).select_from(User).where(User.login_status == LoginStatus.ACTIVE.value)
    ) or 0
    inactive = db.scalar(
        select(func.count()).select_from(User).where(User.login_status == LoginStatus.INACTIVE.value)
    ) or 0
    locked = db.scalar(
        select(func.count()).select_from(User).where(User.login_status == LoginStatus.LOCKED.value)
    ) or 0
    return {
        "total_users": total,
        "active_users": active,
        "inactive_users": inactive,
        "locked_users": locked,
    }


def create_user(db: Session, *, username: str, password: str, login_status: str) -> dict:
    user = User(
        username=username.strip(),
        password=hash_password(password),
        login_status=login_status,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists") from exc
    return _to_dict(user)


def update_user(
    db: Session,
    user_id: int,
    *,
    username: str | None = None,
    password: str | None = None,
    login_status: str | None = None,
) -> dict:
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if username is not None:
        user.username = username.strip()
    if password is not None:
        user.password = hash_password(password)
    if login_status is not None:
        user.login_status = login_status

    try:
        db.commit()
        db.refresh(user)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists") from exc
    return _to_dict(user)


def delete_user(db: Session, user_id: int) -> None:
    user = get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    db.delete(user)
    db.commit()


def reset_user_password(db: Session, user_id: int, password: str) -> dict:
    return update_user(db, user_id, password=password)


def set_user_status(db: Session, user_id: int, status_value: str) -> dict:
    return update_user(db, user_id, login_status=status_value)


def paginate_meta(total: int, page: int, page_size: int) -> dict:
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, ceil(total / page_size)) if page_size else 1,
    }
