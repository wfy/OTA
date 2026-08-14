"""OTAB: single-file compact point cloud binary for the browser runtime viewer.

Layout (little endian):
  magic "OTAB"         4 bytes
  version              1 byte
  flags                1 byte  (bit0 = has color, bit1 = has intensity)
  reserved             2 bytes
  pointCount           4 bytes
  bounds minX..maxZ    6 x float32
  positions            pointCount x 3 x float32
  colors               pointCount x 3 x uint8   (optional)
  classification       pointCount x uint8
  intensity            pointCount x uint16      (optional)
"""

from __future__ import annotations

import struct
from pathlib import Path
from typing import Any

import numpy as np

MAGIC = b"OTAB"
VERSION = 1
HEADER_SIZE = 36
FLAG_HAS_COLOR = 1
FLAG_HAS_INTENSITY = 2


def _channel_to_u8(raw: Any) -> np.ndarray:
    arr = np.asarray(raw, dtype=np.uint32)
    if arr.size == 0:
        return np.zeros(0, dtype=np.uint8)
    mx = int(arr.max())
    if mx > 255:
        return np.right_shift(arr, 8).astype(np.uint8)
    return arr.astype(np.uint8)


def _has_color(las: Any) -> bool:
    if not all(hasattr(las, name) for name in ("red", "green", "blue")):
        return False
    return bool(
        int(np.asarray(las.red).max() or 0)
        + int(np.asarray(las.green).max() or 0)
        + int(np.asarray(las.blue).max() or 0)
        > 0
    )


def write_otab(las_path: str | Path, out_path: str | Path) -> dict[str, Any]:
    import laspy

    las = laspy.read(str(las_path))
    count = int(len(las.points))
    if count <= 0:
        raise ValueError("empty LAS, cannot write OTAB")

    x = np.asarray(las.x, dtype=np.float32)
    y = np.asarray(las.y, dtype=np.float32)
    z = np.asarray(las.z, dtype=np.float32)
    classification = np.asarray(las.classification, dtype=np.uint8)
    intensity = np.asarray(las.intensity, dtype=np.uint16)
    has_color = _has_color(las)
    flags = FLAG_HAS_INTENSITY | (FLAG_HAS_COLOR if has_color else 0)

    min_x, max_x = float(x.min()), float(x.max())
    min_y, max_y = float(y.min()), float(y.max())
    min_z, max_z = float(z.min()), float(z.max())

    with open(out_path, "wb") as f:
        f.write(MAGIC)
        f.write(struct.pack("<BBHI", VERSION, flags, 0, count))
        f.write(
            np.array(
                [min_x, min_y, min_z, max_x, max_y, max_z], dtype=np.float32
            ).tobytes()
        )
        xyz = np.empty((count, 3), dtype=np.float32)
        xyz[:, 0] = x
        xyz[:, 1] = y
        xyz[:, 2] = z
        f.write(xyz.tobytes())
        if has_color:
            colors = np.empty((count, 3), dtype=np.uint8)
            colors[:, 0] = _channel_to_u8(las.red)
            colors[:, 1] = _channel_to_u8(las.green)
            colors[:, 2] = _channel_to_u8(las.blue)
            f.write(colors.tobytes())
        f.write(classification.tobytes())
        if flags & FLAG_HAS_INTENSITY:
            f.write(intensity.tobytes())

    return {
        "point_count": count,
        "has_color": has_color,
        "has_intensity": bool(flags & FLAG_HAS_INTENSITY),
        "bounds": {
            "minX": min_x,
            "minY": min_y,
            "minZ": min_z,
            "maxX": max_x,
            "maxY": max_y,
            "maxZ": max_z,
        },
    }


def read_otab(path: str | Path) -> dict[str, Any]:
    data = Path(path).read_bytes()
    if len(data) < HEADER_SIZE or data[:4] != MAGIC:
        raise ValueError("invalid OTAB file")
    version, flags, _reserved, count = struct.unpack_from("<BBHI", data, 4)
    if version != VERSION:
        raise ValueError(f"unsupported OTAB version {version}")
    min_x, min_y, min_z, max_x, max_y, max_z = struct.unpack_from("<6f", data, 12)
    offset = HEADER_SIZE

    positions = np.frombuffer(data, dtype="<f4", count=count * 3, offset=offset).reshape(
        -1, 3
    )
    offset += count * 3 * 4

    colors = None
    if flags & FLAG_HAS_COLOR:
        colors = np.frombuffer(data, dtype=np.uint8, count=count * 3, offset=offset).reshape(
            -1, 3
        )
        offset += count * 3

    classification = np.frombuffer(data, dtype=np.uint8, count=count, offset=offset)
    offset += count

    intensity = None
    if flags & FLAG_HAS_INTENSITY:
        intensity = np.frombuffer(data, dtype="<u2", count=count, offset=offset)

    return {
        "version": version,
        "flags": flags,
        "point_count": count,
        "bounds": {
            "minX": min_x,
            "minY": min_y,
            "minZ": min_z,
            "maxX": max_x,
            "maxY": max_y,
            "maxZ": max_z,
        },
        "positions": positions,
        "colors": colors,
        "classification": classification,
        "intensity": intensity,
    }
