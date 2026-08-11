from fastapi import APIRouter

router = APIRouter()


class Hub:
    def __init__(self):
        self.latest: dict[str, dict] = {}
        self.connections: dict[str, set] = {}

    def notify(self, task_id: str, payload: dict):
        self.latest[task_id] = payload


hub = Hub()
