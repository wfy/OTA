import numpy as np
import laspy
from app.pipeline.classify import classify_las
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
