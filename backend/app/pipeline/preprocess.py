"""预处理：去噪/地面滤波/归一化。优先 PDAL，未安装时降级为几何地面分离。"""
import json


def _pdal_available() -> bool:
    try:
        import pdal  # noqa: F401
        return True
    except Exception:
        return False


def preprocess_las(input_path: str, output_path: str) -> dict:
    if _pdal_available():
        return _preprocess_pdal(input_path, output_path)
    return _preprocess_geometric(input_path, output_path)


def _preprocess_pdal(input_path: str, output_path: str) -> dict:
    import pdal

    pipeline = pdal.Pipeline(json.dumps({
        "pipeline": [
            input_path,
            {"type": "filters.elm"},
            {"type": "filters.outlier"},
            {"type": "filters.smrf"},
            {"type": "writers.las", "filename": output_path},
        ]
    }))
    pipeline.execute()
    return {"method": "pdal", "stage": "preprocess"}


def _preprocess_geometric(input_path: str, output_path: str) -> dict:
    import numpy as np
    import laspy
    from app.pipeline.classification.ground_separator import separate_ground

    las = laspy.read(input_path)
    points = np.column_stack((
        np.asarray(las.x, dtype=np.float32),
        np.asarray(las.y, dtype=np.float32),
        np.asarray(las.z, dtype=np.float32),
    ))
    is_ground, ground_idx, _, _, _ = separate_ground(points)
    las.classification = np.where(is_ground, 2, 0).astype(np.uint8)
    las.write(output_path)
    return {"method": "geometric-ground", "ground_points": int(ground_idx.size)}
