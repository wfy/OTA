from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import Base
from app.models import LasFile, Task, TaskStatus


def test_task_crud():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        las = LasFile(filename="a.las", size=100)
        db.add(las)
        db.commit()
        db.refresh(las)
        task = Task(las_file_id=las.id)
        db.add(task)
        db.commit()
        db.refresh(task)
        assert task.status == TaskStatus.PENDING
        task.status = TaskStatus.DONE
        task.progress = 100
        db.commit()
        loaded = db.get(Task, task.id)
        assert loaded.progress == 100
