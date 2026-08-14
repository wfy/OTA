from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from starlette.staticfiles import StaticFiles as StarletteStaticFiles

from app.db import init_db
from app.routers import annotations
from app.routers import files
from app.routers import tasks
from app.storage import FALLBACK_DIR
from app import ws as ws_module


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    ws_module.loop = asyncio.get_running_loop()
    yield


app = FastAPI(title="OTA Power Inspection API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(files.router, prefix="/api/files", tags=["files"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(annotations.router, prefix="/api/annotations", tags=["annotations"])
app.include_router(ws_module.router)


class InlineBinStaticFiles(StarletteStaticFiles):
    """Serve .bin with inline disposition so browsers never offer to download them."""

    def file_response(self, full_path, stat_result, scope, status_code=200):
        resp = super().file_response(full_path, stat_result, scope, status_code)
        if str(full_path).lower().endswith(".bin"):
            resp.headers["Content-Disposition"] = "inline"
            resp.headers["X-Content-Type-Options"] = "nosniff"
        return resp


app.mount(
    "/api/potree",
    InlineBinStaticFiles(directory=str(Path(FALLBACK_DIR) / "potree"), check_dir=False),
    name="potree",
)


@app.get("/api/health")
def health():
    return {"status": "ok"}
