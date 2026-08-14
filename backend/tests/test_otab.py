import numpy as np

from app.pipeline.otab import read_otab, write_otab


def test_write_read_roundtrip_with_color(tmp_path):
    import laspy

    n = 120
    header = laspy.LasHeader(point_format=3, version="1.2")
    header.scales = [0.01, 0.01, 0.01]
    header.offsets = [500000.0, 3000000.0, 100.0]
    las = laspy.LasData(header)
    las.x = np.linspace(0, 119, n, dtype=np.float64) + 500000
    las.y = np.linspace(0, 239, n, dtype=np.float64) + 3000000
    las.z = np.linspace(0, 59, n, dtype=np.float64) + 100
    red = (np.arange(n, dtype=np.uint32) * 513) % 65536
    green = (np.arange(n, dtype=np.uint32) * 257) % 65536
    blue = (np.arange(n, dtype=np.uint32) * 129) % 65536
    las.red = red.astype(np.uint16)
    las.green = green.astype(np.uint16)
    las.blue = blue.astype(np.uint16)
    las.classification = (np.arange(n) % 5 + 1).astype(np.uint8)
    las.intensity = (np.arange(n) * 997 % 65536).astype(np.uint16)

    las_path = tmp_path / "tiny.las"
    bin_path = tmp_path / "tiny.otabin"
    las.write(las_path)

    info = write_otab(las_path, bin_path)
    assert info["point_count"] == n
    assert info["has_color"] is True
    assert info["has_intensity"] is True

    out = read_otab(bin_path)
    assert out["point_count"] == n
    np.testing.assert_allclose(
        out["positions"],
        np.column_stack([las.x, las.y, las.z]),
        rtol=1e-4,
        atol=1e-3,
    )
    np.testing.assert_array_equal(out["classification"], np.asarray(las.classification))
    np.testing.assert_array_equal(out["intensity"], np.asarray(las.intensity))
    expected_r = np.right_shift(red, 8).astype(np.uint8)
    expected_g = np.right_shift(green, 8).astype(np.uint8)
    expected_b = np.right_shift(blue, 8).astype(np.uint8)
    np.testing.assert_array_equal(out["colors"][:, 0], expected_r)
    np.testing.assert_array_equal(out["colors"][:, 1], expected_g)
    np.testing.assert_array_equal(out["colors"][:, 2], expected_b)


def test_write_read_no_color(tmp_path):
    import laspy

    n = 40
    las = laspy.create(point_format=1, file_version="1.2")
    las.x = np.linspace(0, 39, n, dtype=np.float64)
    las.y = np.linspace(0, 79, n, dtype=np.float64)
    las.z = np.linspace(0, 19, n, dtype=np.float64)
    las.classification = np.full(n, 2, dtype=np.uint8)

    las_path = tmp_path / "nocolor.las"
    bin_path = tmp_path / "nocolor.otabin"
    las.write(las_path)

    info = write_otab(las_path, bin_path)
    assert info["has_color"] is False
    out = read_otab(bin_path)
    assert out["colors"] is None
    np.testing.assert_array_equal(out["classification"], np.full(n, 2, dtype=np.uint8))
