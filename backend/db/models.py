from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from db.database import Base


class AppState(Base):
    """Key-value JSON store for optimizer config, multi-day results, etc."""

    __tablename__ = "app_state"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ScheduleRun(Base):
    """Optional audit log of schedule API runs."""

    __tablename__ = "schedule_runs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    date: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    request: Mapped[dict] = mapped_column(JSONB, nullable=False)
    response: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class GenerationInput(Base):
    """User-uploaded wind/solar generation inputs per date and block."""

    __tablename__ = "generation_inputs"

    date: Mapped[str] = mapped_column(String(10), primary_key=True)
    block: Mapped[int] = mapped_column(Integer, primary_key=True)
    time: Mapped[str] = mapped_column(String(8), nullable=False, default="00:00:00")
    wind_speed: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    solar_mw: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class GenerationUploadMeta(Base):
    """Per-date upload metadata (solar capacity at upload, CSV format). Survives redeploys."""

    __tablename__ = "generation_upload_meta"

    date: Mapped[str] = mapped_column(String(10), primary_key=True)
    solar_ac_mw: Mapped[float] = mapped_column(Float, nullable=False, default=60.0)
    solar_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="absolute")
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
