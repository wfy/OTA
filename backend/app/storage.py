import io
import os
import shutil
from pathlib import Path

from minio import Minio

FALLBACK_DIR = Path(os.getenv("MINIO_FALLBACK_DIR", "data/uploads"))
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "").strip()
MINIO_ACCESS = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "ota")


class Storage:
    def __init__(self):
        self.minio = None
        if MINIO_ENDPOINT:
            self.minio = Minio(
                MINIO_ENDPOINT,
                access_key=MINIO_ACCESS,
                secret_key=MINIO_SECRET,
                secure=False,
            )
            if not self.minio.bucket_exists(MINIO_BUCKET):
                self.minio.make_bucket(MINIO_BUCKET)

    def _chunk_dir(self, upload_id: str) -> Path:
        d = FALLBACK_DIR / "chunks" / upload_id
        d.mkdir(parents=True, exist_ok=True)
        return d

    def save_chunk(self, upload_id: str, index: int, data: bytes) -> None:
        if self.minio:
            self.minio.put_object(
                MINIO_BUCKET,
                f"chunks/{upload_id}/{index:06d}",
                io.BytesIO(data),
                len(data),
            )
        else:
            (self._chunk_dir(upload_id) / f"{index:06d}.part").write_bytes(data)

    def complete(self, upload_id: str, filename: str) -> str:
        key = f"las/{upload_id}_{Path(filename).name}"
        if self.minio:
            chunk_keys = sorted(
                o.object_name
                for o in self.minio.list_objects(MINIO_BUCKET, prefix=f"chunks/{upload_id}/")
            )
            merged = b"".join(
                self.minio.get_object(MINIO_BUCKET, ck).read() for ck in chunk_keys
            )
            self.minio.put_object(MINIO_BUCKET, key, io.BytesIO(merged), len(merged))
        else:
            out = FALLBACK_DIR / key
            out.parent.mkdir(parents=True, exist_ok=True)
            with out.open("wb") as f:
                for part in sorted(self._chunk_dir(upload_id).glob("*.part")):
                    f.write(part.read_bytes())
            shutil.rmtree(self._chunk_dir(upload_id))
        return key

    def open(self, key: str) -> io.BytesIO:
        if self.minio:
            return io.BytesIO(self.minio.get_object(MINIO_BUCKET, key).read())
        return io.BytesIO((FALLBACK_DIR / key).read_bytes())

    def save_result(self, key: str, data: bytes) -> str:
        if self.minio:
            self.minio.put_object(MINIO_BUCKET, key, io.BytesIO(data), len(data))
        else:
            p = FALLBACK_DIR / key
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
        return key

    def url(self, key: str) -> str:
        if self.minio:
            return self.minio.presigned_get_object(MINIO_BUCKET, key)
        return f"/api/files/raw/{key}"
