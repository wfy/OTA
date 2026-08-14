"""Potree octree conversion via PotreeConverter 2.x."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

TOOLS_DIR = Path(__file__).resolve().parent.parent.parent / "tools"


def _ensure_converter() -> Path:
    env_path = os.getenv("POTREE_CONVERTER_PATH", "").strip()
    if env_path:
        exe = Path(env_path)
        if exe.exists():
            return exe
    # auto-extract the shipped zip once
    zips = list(TOOLS_DIR.glob("PotreeConverter_*_x64_windows.zip"))
    extracted = list(TOOLS_DIR.glob("PotreeConverter/PotreeConverter_*_x64_windows/PotreeConverter.exe"))
    if extracted:
        return extracted[0]
    if zips:
        dest = TOOLS_DIR / "PotreeConverter"
        with zipfile.ZipFile(zips[0]) as zf:
            zf.extractall(dest)
        extracted = list(dest.glob("*/PotreeConverter.exe"))
        if extracted:
            return extracted[0]
    raise FileNotFoundError(
        "PotreeConverter 未找到，请将 PotreeConverter_2.1.3_x64_windows.zip 放到 backend/tools/"
    )


def convert_to_potree(input_las: str | Path, out_dir: str | Path) -> dict:
    exe = _ensure_converter()
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        repaired = Path(tmp) / "repaired.las"
        _repair_bounds(input_las, repaired)
        cmd = [
            str(exe),
            str(repaired),
            "-o",
            str(out),
            "--encoding",
            "UNCOMPRESSED",
            "--attributes",
            "RGB,classification,intensity",
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if proc.returncode != 0:
            raise RuntimeError(f"PotreeConverter failed: {proc.stderr[-2000:] or proc.stdout[-2000:]}")
    metadata = out / "metadata.json"
    if not metadata.exists():
        raise RuntimeError("PotreeConverter 未生成 metadata.json")
    return {
        "output": str(out),
        "metadata_exists": metadata.exists(),
    }


def _repair_bounds(input_las: str | Path, output_las: str | Path) -> None:
    import laspy

    las = laspy.read(str(input_las))
    las.header.mins = [float(las.x.min()), float(las.y.min()), float(las.z.min())]
    las.header.maxs = [float(las.x.max()), float(las.y.max()), float(las.z.max())]
    las.write(str(output_las))


def clean_potree_dir(out_dir: str | Path) -> None:
    shutil.rmtree(out_dir, ignore_errors=True)
