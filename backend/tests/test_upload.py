import os
import shutil

os.environ["MINIO_ENDPOINT"] = ""
os.environ["MINIO_FALLBACK_DIR"] = "data/test_uploads"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.storage import FALLBACK_DIR  # noqa: E402


def test_upload_flow():
    with TestClient(app) as client:
        r = client.post("/api/files/init", json={"filename": "tiny.las", "size": 1000})
        assert r.status_code == 200
        upload_id = r.json()["upload_id"]
        r = client.put(f"/api/files/{upload_id}/chunks/0", content=b"x" * 1000)
        assert r.status_code == 200
        r = client.post(f"/api/files/{upload_id}/complete")
        assert r.status_code == 200
        key = r.json()["storage_key"]
        assert key.startswith("las/")
        r = client.get(f"/api/files/raw/{key}")
        assert r.status_code == 200
        assert r.content == b"x" * 1000
    shutil.rmtree(FALLBACK_DIR, ignore_errors=True)
