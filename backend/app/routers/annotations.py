import json
import tempfile
import time
from pathlib import Path

import laspy
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Annotation, LasFile
from app.schemas import (
    AnnotationCreate,
    AnnotationExportOut,
    AnnotationExportRequest,
    AnnotationOut,
)
from app.storage import Storage

router = APIRouter()

LABEL_CODES = {"ground": 2, "vegetation": 5, "wire": 14, "tower": 16, "insulator": 17}


def _storage() -> Storage:
    return Storage()


@router.post("", response_model=AnnotationOut)
def create_annotation(body: AnnotationCreate, db: Session = Depends(get_db)):
    las = db.get(LasFile, body.las_file_id)
    if not las:
        raise HTTPException(status_code=404, detail="las file not found")
    ann = Annotation(
        las_file_id=body.las_file_id,
        label=body.label,
        source=body.source,
        bbox_json=json.dumps(body.bbox, ensure_ascii=False) if body.bbox else "",
        points_json=json.dumps(body.points) if body.points else "",
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return _to_out(ann)


@router.get("", response_model=list[AnnotationOut])
def list_annotations(las_file_id: str, db: Session = Depends(get_db)):
    rows = (
        db.query(Annotation)
        .filter(Annotation.las_file_id == las_file_id)
        .order_by(Annotation.created_at)
        .all()
    )
    return [_to_out(r) for r in rows]


@router.post("/export", response_model=AnnotationExportOut)
def export_annotations(body: AnnotationExportRequest, db: Session = Depends(get_db)):
    las_row = db.get(LasFile, body.las_file_id)
    if not las_row or not las_row.storage_key:
        raise HTTPException(status_code=404, detail="las file not found")
    anns = (
        db.query(Annotation)
        .filter(Annotation.las_file_id == body.las_file_id)
        .all()
    )
    raw = _storage().open(las_row.storage_key)
    with tempfile.TemporaryDirectory() as tmp:
        in_path = Path(tmp) / las_row.filename
        out_path = Path(tmp) / f"{Path(las_row.filename).stem}_labeled.las"
        in_path.write_bytes(raw.getvalue())
        las = laspy.read(in_path)
        pts = np.vstack((las.x, las.y, las.z)).T
        codes: dict[str, int] = {}
        for a in anns:
            code = LABEL_CODES.get(a.label)
            if code is None:
                continue
            mask = np.zeros(len(pts), dtype=bool)
            if a.points_json:
                idx = np.asarray(json.loads(a.points_json), dtype=np.int64)
                idx = idx[idx < len(pts)]
                mask[idx] = True
            elif a.bbox_json:
                b = json.loads(a.bbox_json)
                mask = (
                    (pts[:, 0] >= b["minX"]) & (pts[:, 0] <= b["maxX"])
                    & (pts[:, 1] >= b["minY"]) & (pts[:, 1] <= b["maxY"])
                    & (pts[:, 2] >= b["minZ"]) & (pts[:, 2] <= b["maxZ"])
                )
            las.classification[mask] = code
            codes[a.label] = int(mask.sum())
        las.write(out_path)
        key = _storage().save_result(
            f"annotations/{las_row.id}_{int(time.time())}_{out_path.name}",
            out_path.read_bytes(),
        )
    return AnnotationExportOut(key=key, url=_storage().url(key), counts=codes)


def _to_out(a: Annotation) -> AnnotationOut:
    return AnnotationOut(
        id=a.id,
        las_file_id=a.las_file_id,
        label=a.label,
        source=a.source,
        bbox=json.loads(a.bbox_json) if a.bbox_json else None,
        points_count=len(json.loads(a.points_json)) if a.points_json else 0,
        created_at=a.created_at.isoformat(),
    )
