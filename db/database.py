import os
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

DEFAULT_DATABASE_URL = os.getenv("DATABASE_URL", "")  # empty = no DB configured

DATABASE_URL = DEFAULT_DATABASE_URL


class Base(DeclarativeBase):
    pass


# Build the engine only if a URL is actually configured
if DATABASE_URL:
    try:
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
            max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
        )
        SessionLocal: sessionmaker | None = sessionmaker(
            autocommit=False, autoflush=False, bind=engine
        )
    except Exception as _e:
        print(f"[db] Could not initialise database engine: {_e}")
        engine = None  # type: ignore[assignment]
        SessionLocal = None
else:
    print("[db] DATABASE_URL not set — persistence endpoints will be unavailable.")
    engine = None  # type: ignore[assignment]
    SessionLocal = None


def get_db() -> Generator[Session, None, None]:
    if SessionLocal is None:
        # Import here to avoid circular imports at module level
        from fastapi import HTTPException
        raise HTTPException(
            status_code=503,
            detail="Database not configured. Set the DATABASE_URL environment variable to enable persistence.",
        )
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    if engine is None:
        return
    from db import models  # noqa: F401
    Base.metadata.create_all(bind=engine)


def check_db_connection() -> bool:
    if engine is None:
        return False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False

