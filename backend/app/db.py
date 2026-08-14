import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///data/ota.db")
_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _sqlite else {},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def init_db():
    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    if DATABASE_URL.startswith("sqlite"):
        from sqlalchemy import inspect, text

        insp = inspect(engine)
        if "tasks" in insp.get_table_names():
            cols = {c["name"] for c in insp.get_columns("tasks")}
            if "result_bin_key" not in cols:
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            "ALTER TABLE tasks "
                            "ADD COLUMN result_bin_key VARCHAR(512) DEFAULT ''"
                        )
                    )
            if "result_potree_dir" not in cols:
                with engine.begin() as conn:
                    conn.execute(
                        text(
                            "ALTER TABLE tasks "
                            "ADD COLUMN result_potree_dir VARCHAR(512) DEFAULT ''"
                        )
                    )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
