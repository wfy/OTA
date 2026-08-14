import os
import shutil
from pathlib import Path

os.environ["CELERY_TASK_ALWAYS_EAGER"] = "1"
os.environ["DATABASE_URL"] = "sqlite:///data/test_tasks.db"
os.environ["MINIO_ENDPOINT"] = ""
os.environ["MINIO_FALLBACK_DIR"] = "data/test_task_uploads"

import numpy as np  # noqa: E402
import laspy  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.db import Base  # noqa: E402
from app.models import LasFile, Task, TaskStatus  # noqa: E402
from app.storage import FALLBACK_DIR, Storage  # noqa: E402
from app.tasks import process_las_task  # noqa: E402


def test_process_las_task(tmp_path):
    engine = create_engine(os.environ["DATABASE_URL"])
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    las_path = tmp_path / "tiny.las"
    rng = np.random.default_rng(1)
    las = laspy.create(point_format=6, file_version="1.4")
    las.x = rng.uniform(0, 50, 2000).astype(np.float64)
    las.y = rng.uniform(0, 50, 2000).astype(np.float64)
    las.z = rng.uniform(0, 25, 2000).astype(np.float64)
    las.write(las_path)
    storage = Storage()
    key = storage.save_result("test/tiny.las", las_path.read_bytes())
    with Session(engine) as db:
        las_row = LasFile(
            filename="tiny.las",
            size=las_path.stat().st_size,
            storage_key=key,
            uploaded=True,
        )
        db.add(las_row)
        db.commit()
        db.refresh(las_row)
        task = Task(las_file_id=las_row.id)
        db.add(task)
        db.commit()
        db.refresh(task)
        task_id = task.id
    process_las_task(task_id)
    with Session(engine) as db:
        task = db.get(Task, task_id)
        assert task.status == TaskStatus.DONE
        assert task.progress == 100
        assert task.result_las_key.startswith("result/")
        assert task.result_bin_key.startswith("result/")
        assert task.result_potree_dir == task_id
        potree_meta = (
            FALLBACK_DIR / "potree" / task_id / "metadata.json"
        )
        assert potree_meta.exists(), "PotreeConverter 未生成 metadata.json"
    shutil.rmtree(os.environ["MINIO_FALLBACK_DIR"], ignore_errors=True)
