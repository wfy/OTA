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
    points = np.vstack((las.x, las.y, las.z)).T
    if limit and len(points) > limit:
        idx = np.random.default_rng(0).choice(len(points), limit, replace=False)
        idx.sort()
        las = las[idx]
        points = points[idx]
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
