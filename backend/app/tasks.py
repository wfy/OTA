import os
import tempfile
from pathlib import Path

from celery import Celery
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models import LasFile, Task, TaskStatus
from app.pipeline.classify import classify_las
from app.pipeline.otab import write_otab
from app.pipeline.preprocess import preprocess_las
from app.storage import Storage
from app.ws import hub

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
celery_app = Celery("ota", broker=REDIS_URL, backend=REDIS_URL)
celery_app.conf.task_always_eager = os.getenv("CELERY_TASK_ALWAYS_EAGER", "1") == "1"
celery_app.conf.task_eager_propagates = True


def _engine():
    url = os.getenv("DATABASE_URL", "sqlite:///data/ota.db")
    return create_engine(
        url,
        connect_args={"check_same_thread": False} if url.startswith("sqlite") else {},
    )


@celery_app.task(bind=True)
def process_las_task(self, task_id: str):
    storage = Storage()
    with Session(_engine()) as db:
        task = db.get(Task, task_id)
        if not task:
            return {"error": "task not found"}
        las = db.get(LasFile, task.las_file_id)

        def set_state(progress: int, message: str):
            task.status = TaskStatus.PROCESSING
            task.progress = progress
            task.message = message
            db.commit()
            hub.notify(task_id, {"progress": progress, "message": message})

        try:
            set_state(5, "下载点云")
            raw = storage.open(las.storage_key)
            with tempfile.TemporaryDirectory() as tmp:
                in_path = Path(tmp) / las.filename
                out_path = Path(tmp) / f"{in_path.stem}_sign.las"
                in_path.write_bytes(raw.getvalue())
                set_state(20, "预处理")
                preprocess_las(str(in_path), str(out_path))
                set_state(50, "分类推理")
                res = classify_las(str(in_path), str(out_path))
                set_state(90, "结果写回")
                result_key = storage.save_result(
                    f"result/{task_id}_{out_path.name}", out_path.read_bytes()
                )
                bin_path = Path(tmp) / f"{in_path.stem}.otabin"
                write_otab(str(out_path), str(bin_path))
                bin_key = storage.save_result(
                    f"result/{task_id}_{bin_path.name}", bin_path.read_bytes()
                )
                task.result_las_key = result_key
                task.result_bin_key = bin_key
                task.status = TaskStatus.DONE
                task.progress = 100
                task.message = f"分类完成 {res}"
                db.commit()
                hub.notify(
                    task_id,
                    {
                        "progress": 100,
                        "status": "done",
                        "result": result_key,
                        "result_bin": bin_key,
                    },
                )
        except Exception as exc:
            task.status = TaskStatus.FAILED
            task.error = str(exc)
            db.commit()
            hub.notify(task_id, {"status": "failed", "error": str(exc)})
            if celery_app.conf.task_always_eager:
                raise
    return {"task_id": task_id}
