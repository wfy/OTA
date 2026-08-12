from pydantic import BaseModel, Field


class UploadInitRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size: int = Field(ge=1)


class UploadInitResponse(BaseModel):
    upload_id: str
    chunk_size: int = 8 * 1024 * 1024


class TaskCreateRequest(BaseModel):
    las_file_id: str
    pipeline: str = "geometry-v1"


class TaskOut(BaseModel):
    id: str
    las_file_id: str
    pipeline: str
    status: str
    progress: int
    message: str
    result_las_key: str
    error: str
    created_at: str
    updated_at: str


class AnnotationCreate(BaseModel):
    las_file_id: str
    label: str = Field(min_length=1, max_length=32)
    source: str = "box"
    bbox: dict[str, float] | None = None
    points: list[int] | None = None


class AnnotationOut(BaseModel):
    id: str
    las_file_id: str
    label: str
    source: str
    bbox: dict[str, float] | None = None
    points_count: int
    created_at: str


class AnnotationExportRequest(BaseModel):
    las_file_id: str


class AnnotationExportOut(BaseModel):
    key: str
    url: str
    counts: dict[str, int]
