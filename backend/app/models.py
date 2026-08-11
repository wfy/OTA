import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def now():
    return datetime.now(timezone.utc)


def nid():
    return uuid.uuid4().hex


class TaskStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    DONE = "done"
    FAILED = "failed"


class LasFile(Base):
    __tablename__ = "las_files"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=nid)
    filename: Mapped[str] = mapped_column(String(255))
    size: Mapped[int] = mapped_column(Integer, default=0)
    storage_key: Mapped[str] = mapped_column(String(512), default="")
    uploaded: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=nid)
    las_file_id: Mapped[str] = mapped_column(ForeignKey("las_files.id"))
    pipeline: Mapped[str] = mapped_column(String(64), default="geometry-v1")
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus), default=TaskStatus.PENDING
    )
    progress: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(Text, default="")
    result_las_key: Mapped[str] = mapped_column(String(512), default="")
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now, onupdate=now)
