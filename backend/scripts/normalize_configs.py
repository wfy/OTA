"""把 Unity StreamingAssets 的 JSON 配置规范化到 backend/app/config。"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json5

SRC = Path(r"E:\unity\3dTrack\Assets\StreamingAssets")
DST = Path(__file__).resolve().parent.parent / "app" / "config"
MAP = {
    "uav.temp": "uav_models.json",
    "OTASetting.json": "ota_settings.json",
    "WireSetting.json": "wire_settings.json",
    "guidelines.json": "guidelines.json",
}


def main():
    DST.mkdir(parents=True, exist_ok=True)
    for src_name, dst_name in MAP.items():
        text = (SRC / src_name).read_text(encoding="utf-8")
        data = json5.loads(text)
        (DST / dst_name).write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"{src_name} -> {dst_name}")


if __name__ == "__main__":
    main()
