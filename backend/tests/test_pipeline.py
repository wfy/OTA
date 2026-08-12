import numpy as np
import laspy
from app.pipeline.classify import classify_las
from app.pipeline.classify import _spatial_sample_indices
from app.pipeline.preprocess import preprocess_las


def make_fixture(path: str, n: int = 5000):
    rng = np.random.default_rng(0)
    x = rng.uniform(0, 100, n)
    y = rng.uniform(0, 100, n)
    z = rng.uniform(0, 30, n)
    las = laspy.create(point_format=6, file_version="1.4")
    las.x = x.astype(np.float64)
    las.y = y.astype(np.float64)
    las.z = z.astype(np.float64)
    las.write(path)


def test_preprocess_and_classify(tmp_path):
    src = str(tmp_path / "tiny.las")
    out = str(tmp_path / "tiny_sign.las")
    make_fixture(src)
    pre = preprocess_las(src, out)
    assert "method" in pre
    res = classify_las(src, out)
    assert res["points"] == 5000
    assert res["ground"] + res["tower"] + res["cable"] + res["vegetation"] == 5000
    assert res["seconds"] >= 0
    assert res["peak_memory_mb"] > 0
    assert laspy.read(out).classification.max() <= 16


def test_spatial_sample_preserves_cluster():
    rng = np.random.default_rng(7)
    n = 100_000
    points = rng.uniform(0, 100, (n, 3))
    cluster = rng.uniform(0, 5, (300, 3))  # 高密度区域（模拟杆塔）
    all_points = np.vstack((points, cluster))
    idx = _spatial_sample_indices(all_points, 5000)
    assert len(idx) <= 5000
    assert len(np.unique(idx)) == len(idx)
    kept_cluster = int(np.isin(idx, np.arange(n, n + 300)).sum())
    assert kept_cluster > 0
