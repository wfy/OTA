from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import LasFile, Task
from app.schemas import TaskCreateRequest, TaskOut
from app.tasks import process_las_task

router = APIRouter()


def to_out(t: Task) -> TaskOut:
    return TaskOut(
        id=t.id,
        las_file_id=t.las_file_id,
        pipeline=t.pipeline,
        status=t.status.value,
        progress=t.progress,
        message=t.message,
        result_las_key=t.result_las_key,
        error=t.error,
        created_at=t.created_at.isoformat(),
        updated_at=t.updated_at.isoformat(),
    )


@router.post("", response_model=TaskOut)
def create_task(body: TaskCreateRequest, db: Session = Depends(get_db)):
    las = db.get(LasFile, body.las_file_id)
    if not las or not las.uploaded:
        raise HTTPException(status_code=400, detail="las file not uploaded")
    task = Task(las_file_id=body.las_file_id, pipeline=body.pipeline)
    db.add(task)
    db.commit()
    db.refresh(task)
    process_las_task.delay(task.id)
    return to_out(task)


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: str, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="task not found")
    return to_out(task)
