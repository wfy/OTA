"""MVP 几何分类管线：地面/杆塔/导线/植被 + 拓扑校验。"""
import time
import tracemalloc

import numpy as np
import laspy

from app.pipeline.classification.ground_separator import separate_ground
from app.pipeline.classification.tower_detector import detect_towers
from app.pipeline.classification.powerline_extractor import extract_and_track_powerlines
from app.pipeline.classification.topology_validator import validate_tower_topology


def classify_las(input_path: str, output_path: str, limit: int | None = None) -> dict:
    t0 = time.time()
    tracemalloc.start()
    las = laspy.read(input_path)
    if limit and len(las.points) > limit:
        idx = _spatial_sample_xyz(
            np.asarray(las.x, dtype=np.float32),
            np.asarray(las.y, dtype=np.float32),
            np.asarray(las.z, dtype=np.float32),
            limit,
        )
        las = las[idx]
    xs = np.asarray(las.x, dtype=np.float32)
    ys = np.asarray(las.y, dtype=np.float32)
    zs = np.asarray(las.z, dtype=np.float32)
    points = np.column_stack((xs, ys, zs))
    del xs, ys, zs
    is_ground, ground_idx, off_ground_idx, off_ground_pts, rel_z = separate_ground(points)
    is_tower, is_tower_arm, is_near_tower_high_arm, tower_infos = detect_towers(
        off_ground_pts, rel_z, off_ground_idx
    )
    cable_pts_idx, _, _, _, _ = extract_and_track_powerlines(
        points=points,
        off_ground_pts=off_ground_pts,
        off_ground_idx=off_ground_idx,
        rel_z=rel_z,
        is_tower=is_tower,
        is_near_tower_high_arm=is_near_tower_high_arm,
        tower_infos=tower_infos,
    )
    cable_pts_idx = np.asarray(cable_pts_idx, dtype=np.int64)
    tower_pts_idx, valid_tower_count, _ = validate_tower_topology(
        points=points,
        off_ground_idx=off_ground_idx,
        rel_z=rel_z,
        tower_infos=tower_infos,
        cable_pts_idx=cable_pts_idx,
    )
    tower_pts_idx = np.asarray(tower_pts_idx, dtype=np.int64)
    classification = np.zeros(len(points), dtype=np.uint8)
    classification[ground_idx] = 2       # ASPRS Ground
    classification[tower_pts_idx] = 16   # ASPRS Tower
    classification[cable_pts_idx] = 14   # ASPRS Wire
    las.classification = classification
    las.write(output_path)
    elapsed = time.time() - t0
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    return {
        "points": int(len(points)),
        "ground": int(len(ground_idx)),
        "tower": int(len(tower_pts_idx)),
        "cable": int(len(cable_pts_idx)),
        "vegetation": int(len(points) - len(ground_idx) - len(tower_pts_idx) - len(cable_pts_idx)),
        "towers": valid_tower_count,
        "seconds": round(elapsed, 2),
        "peak_memory_mb": round(peak / 1024 / 1024, 1),
    }


def _spatial_sample_indices(points: np.ndarray, limit: int, seed: int = 0) -> np.ndarray:
    """空间分块分层抽样：按 3D 网格分块，每块按点数比例保留，避免随机抽样破坏局部密度。"""
    return _spatial_sample_xyz(points[:, 0], points[:, 1], points[:, 2], limit, seed)


def _spatial_sample_xyz(
    xs: np.ndarray, ys: np.ndarray, zs: np.ndarray, limit: int, seed: int = 0
) -> np.ndarray:
    n = len(xs)
    if n <= limit:
        return np.arange(n)
    rng = np.random.default_rng(seed)
    lo = np.array([xs.min(), ys.min(), zs.min()])
    span = np.maximum(np.array([xs.max(), ys.max(), zs.max()]) - lo, 1.0)
    dims = max(1, int(round((n / limit) ** (1 / 3))))
    bs = span / dims
    gx = np.floor((xs - lo[0]) / max(bs[0], 1e-9)).clip(0, dims - 1).astype(np.int32)
    gy = np.floor((ys - lo[1]) / max(bs[1], 1e-9)).clip(0, dims - 1).astype(np.int32)
    gz = np.floor((zs - lo[2]) / max(bs[2], 1e-9)).clip(0, dims - 1).astype(np.int32)
    keys = gx * (dims * dims) + gy * dims + gz
    key_dtype = np.uint8 if dims ** 3 <= 255 else np.uint16 if dims ** 3 <= 65535 else np.uint32
    keys = keys.astype(key_dtype)
    order = np.argsort(keys, kind="stable")
    sorted_keys = keys[order]
    change = np.empty(n, dtype=np.bool_)
    change[0] = True
    np.not_equal(sorted_keys[1:], sorted_keys[:-1], out=change[1:])
    starts = np.flatnonzero(change)
    ends = np.append(starts[1:], n)
    selected = []
    for b in range(len(starts)):
        cnt = int(ends[b] - starts[b])
        target = min(cnt, max(1, int(round(limit * cnt / n))))
        idx = order[starts[b]:starts[b] + cnt]
        if target < cnt:
            idx = idx[rng.choice(cnt, target, replace=False)]
        selected.append(idx)
    out = np.concatenate(selected)
    if len(out) > limit:
        out = out[rng.choice(len(out), limit, replace=False)]
    return np.sort(out)
