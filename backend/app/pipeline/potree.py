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
    # auto-extract the shipped zips once, preferring 1.7 (reliable LAS
    # attribute extraction; 2.1.3 silently drops RGB/classification/intensity)
    exe_dir = TOOLS_DIR / "PotreeConverter"
    for zname, pat in (
        ("PotreeConverter_1.7_windows_x64.zip", "PotreeConverter_1.7_windows_x64"),
        ("PotreeConverter_2.1.3_x64_windows.zip", "PotreeConverter_2.1.3_x64_windows"),
    ):
        exe = exe_dir / pat / "PotreeConverter.exe"
        if exe.exists():
            return exe
        zip_path = TOOLS_DIR / zname
        if zip_path.exists():
            with zipfile.ZipFile(zip_path) as zf:
                zf.extractall(exe_dir)
            exe = exe_dir / pat / "PotreeConverter.exe"
            if exe.exists():
                return exe
    raise FileNotFoundError(
        "PotreeConverter 未找到，请将 PotreeConverter_1.7_windows_x64.zip 放到 backend/tools/"
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
            "--output-attributes",
            "RGB",
            "CLASSIFICATION",
            "INTENSITY",
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if proc.returncode != 0:
            raise RuntimeError(f"PotreeConverter failed: {proc.stderr[-2000:] or proc.stdout[-2000:]}")
    # 1.7 writes cloud.js; 2.x writes metadata.json
    metadata = out / "metadata.json"
    cloud = out / "cloud.js"
    if not metadata.exists() and not cloud.exists():
        raise RuntimeError("PotreeConverter 未生成 metadata.json/cloud.js")
    if cloud.exists():
        _patch_cloud_js(cloud)
    return {
        "output": str(out),
        "metadata_exists": metadata.exists(),
        "cloud_js_exists": cloud.exists(),
        "converter_version": "1.7" if cloud.exists() else "2.x",
    }


def _patch_cloud_js(cloud: Path) -> None:
    """potree-core 老格式 loader 的 PointAttributes 构造按属性名查表
    （只认 POSITION_CARTESIAN/COLOR_PACKED/RGBA_PACKED/CLASSIFICATION/INTENSITY
    等），1.7 输出的对象数组（{name,size,...}）与 "RGBA" 名都查不到：
    对象作 key 得 undefined，worker 解析时崩溃于 switch(e.name)。
    改写为 1.6 时代的字符串数组，并把 RGBA 映射为 COLOR_PACKED。"""
    import json

    txt = cloud.read_text(encoding="utf-8")
    data = json.loads(txt[txt.find("{"):])
    names = []
    for pa in data["pointAttributes"]:
        name = pa["name"] if isinstance(pa, dict) else pa
        names.append(
            {
                "RGBA": "COLOR_PACKED",
                "classification": "CLASSIFICATION",
                "intensity": "INTENSITY",
            }.get(name, name)
        )
    data["pointAttributes"] = names
    cloud.write_text(json.dumps(data, indent=4), encoding="utf-8")


def _repair_bounds(input_las: str | Path, output_las: str | Path) -> None:
    import laspy

    las = laspy.read(str(input_las))
    las.header.mins = [float(las.x.min()), float(las.y.min()), float(las.z.min())]
    las.header.maxs = [float(las.x.max()), float(las.y.max()), float(las.z.max())]
    las.write(str(output_las))


def clean_potree_dir(out_dir: str | Path) -> None:
    shutil.rmtree(out_dir, ignore_errors=True)
