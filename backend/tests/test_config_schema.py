import json
from pathlib import Path

CONFIG_DIR = Path(__file__).resolve().parent.parent / "app" / "config"


def load(name: str):
    return json.loads((CONFIG_DIR / name).read_text(encoding="utf-8"))


def test_uav_models():
    data = load("uav_models.json")
    assert isinstance(data, list) and len(data) >= 5
    for m in data:
        assert {"name", "pitchmin", "pitchmax", "cameras"} <= set(m)


def test_ota_settings():
    data = load("ota_settings.json")
    for voltage in ("35kV", "110kV", "220kV", "500kV"):
        assert voltage in data


def test_wire_settings():
    data = load("wire_settings.json")
    assert len(data) >= 1
    for _, v in data.items():
        assert {"area", "diameter", "weight", "tearforce"} <= set(v)


def test_guidelines():
    data = load("guidelines.json")
    assert any("回路" in k for k in data)
