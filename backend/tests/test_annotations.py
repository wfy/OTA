import os
import shutil

os.environ["MINIO_ENDPOINT"] = ""
os.environ["MINIO_FALLBACK_DIR"] = "data/test_ann_uploads"

import numpy as np  # noqa: E402
import laspy  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.db import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import LasFile  # noqa: E402
from app.storage import FALLBACK_DIR, Storage  # noqa: E402


def test_annotation_create_list_export(tmp_path):
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        las_path = tmp_path / "tiny.las"
        rng = np.random.default_rng(2)
        las = laspy.create(point_format=6, file_version="1.4")
        las.x = rng.uniform(0, 20, 1000).astype(np.float64)
        las.y = rng.uniform(0, 20, 1000).astype(np.float64)
        las.z = rng.uniform(0, 10, 1000).astype(np.float64)
        las.write(las_path)
        storage = Storage()
        key = storage.save_result("test/ann_tiny.las", las_path.read_bytes())
        with TestingSession() as db:
            row = LasFile(filename="tiny.las", size=las_path.stat().st_size, storage_key=key, uploaded=True)
            db.add(row)
            db.commit()
            db.refresh(row)
            las_file_id = row.id
        client = TestClient(app)
        with client:
            r = client.post("/api/annotations", json={
                "las_file_id": las_file_id,
                "label": "vegetation",
                "source": "box",
                "bbox": {"minX": 0, "minY": 0, "minZ": 0, "maxX": 20, "maxY": 20, "maxZ": 10},
            })
            assert r.status_code == 200
            r = client.get(f"/api/annotations?las_file_id={las_file_id}")
            assert r.status_code == 200
            assert len(r.json()) == 1
            r = client.post("/api/annotations/export", json={"las_file_id": las_file_id})
            assert r.status_code == 200
            data = r.json()
            assert data["counts"]["vegetation"] == 1000
            exported_path = tmp_path / "exported.las"
            exported_path.write_bytes(storage.open(data["key"]).getvalue())
            exported = laspy.read(exported_path)
            assert int(np.unique(exported.classification).max()) == 5
    finally:
        app.dependency_overrides.clear()
        shutil.rmtree(FALLBACK_DIR, ignore_errors=True)
