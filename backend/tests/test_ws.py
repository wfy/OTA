import os

os.environ["CELERY_TASK_ALWAYS_EAGER"] = "1"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.ws import hub  # noqa: E402


def test_ws_receives_progress():
    with TestClient(app) as client:
        with client.websocket_connect("/ws/tasks/demo-1") as ws:
            hub.notify("demo-1", {"progress": 42, "message": "分类推理"})
            data = ws.receive_json()
            assert data["progress"] == 42
