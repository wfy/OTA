from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import LasFile
from app.schemas import UploadInitRequest, UploadInitResponse
from app.storage import Storage

router = APIRouter()


def _storage() -> Storage:
    return Storage()


@router.post("/init", response_model=UploadInitResponse)
def init_upload(body: UploadInitRequest, db: Session = Depends(get_db)):
    row = LasFile(filename=body.filename, size=body.size)
    db.add(row)
    db.commit()
    db.refresh(row)
    return UploadInitResponse(upload_id=row.id)


@router.put("/{upload_id}/chunks/{index}")
async def upload_chunk(upload_id: str, index: int, request: Request):
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="empty chunk")
    _storage().save_chunk(upload_id, index, data)
    return {"ok": True, "chunk": index}


@router.post("/{upload_id}/complete")
def complete_upload(upload_id: str, db: Session = Depends(get_db)):
    row = db.get(LasFile, upload_id)
    if not row:
        raise HTTPException(status_code=404, detail="upload not found")
    row.storage_key = _storage().complete(upload_id, row.filename)
    row.uploaded = True
    db.commit()
    return {"las_file_id": row.id, "storage_key": row.storage_key}


@router.get("/raw/{key:path}")
def raw(key: str):
    path = _storage().fallback / key
    if not path.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(path, filename=path.name)
