import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()
loop: asyncio.AbstractEventLoop | None = None


class Hub:
    def __init__(self):
        self.connections: dict[str, set[WebSocket]] = {}
        self.latest: dict[str, dict] = {}

    async def connect(self, task_id: str, ws: WebSocket):
        await ws.accept()
        self.connections.setdefault(task_id, set()).add(ws)
        if task_id in self.latest:
            await ws.send_json(self.latest[task_id])

    def disconnect(self, task_id: str, ws: WebSocket):
        self.connections.get(task_id, set()).discard(ws)

    def notify(self, task_id: str, payload: dict):
        self.latest[task_id] = payload
        if loop and loop.is_running():
            asyncio.run_coroutine_threadsafe(self._broadcast(task_id, payload), loop)

    async def _broadcast(self, task_id: str, payload: dict):
        for ws in list(self.connections.get(task_id, set())):
            try:
                await ws.send_json(payload)
            except Exception:
                self.disconnect(task_id, ws)


hub = Hub()


@router.websocket("/ws/tasks/{task_id}")
async def ws_task(websocket: WebSocket, task_id: str):
    await hub.connect(task_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(task_id, websocket)
