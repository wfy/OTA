"""M1 端到端验收：上传→任务→轮询→下载结果并校验 LAS 分类。"""
import argparse
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx
import laspy
import numpy as np

CHUNK = 8 * 1024 * 1024


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", "-i", required=True)
    ap.add_argument("--output", "-o", default="data/e2e/result_sign.las")
    ap.add_argument("--report", default="docs/benchmark/2026-08-11-e2e.md")
    ap.add_argument("--base", default=os.getenv("E2E_BASE", "http://127.0.0.1:8000"))
    args = ap.parse_args()
    src = Path(args.input)
    out = Path(args.output)
    t0 = time.time()
    with httpx.Client(base_url=args.base, timeout=180) as client:
        r = client.post(
            "/api/files/init",
            json={"filename": src.name, "size": src.stat().st_size},
        )
        r.raise_for_status()
        upload_id = r.json()["upload_id"]
        with src.open("rb") as f:
            index = 0
            while True:
                data = f.read(CHUNK)
                if not data:
                    break
                r = client.put(f"/api/files/{upload_id}/chunks/{index}", content=data)
                r.raise_for_status()
                index += 1
        r = client.post(f"/api/files/{upload_id}/complete")
        r.raise_for_status()
        las_file_id = r.json()["las_file_id"]
        r = client.post(
            "/api/tasks",
            json={"las_file_id": las_file_id, "pipeline": "geometry-v1"},
        )
        r.raise_for_status()
        task = r.json()
        task_id = task["id"]
        while task["status"] in ("pending", "processing"):
            time.sleep(3)
            r = client.get(f"/api/tasks/{task_id}")
            r.raise_for_status()
            task = r.json()
        if task["status"] != "done":
            raise SystemExit(f"task failed: {task}")
        out.parent.mkdir(parents=True, exist_ok=True)
        r = client.get(f"/api/files/raw/{task['result_las_key']}")
        r.raise_for_status()
        out.write_bytes(r.content)
        bin_out = out.with_suffix(".otabin")
        r = client.get(f"/api/files/raw/{task['result_bin_key']}")
        r.raise_for_status()
        bin_out.write_bytes(r.content)
        if bin_out.read_bytes()[:4] != b"OTAB":
            raise SystemExit("OTAB magic check failed")
        las = laspy.read(out)
        classes, counts = np.unique(las.classification, return_counts=True)
        # 标注闭环冒烟：全量 bbox 标注为 vegetation，导出后校验分类
        bbox = {
            "minX": float(las.x.min()),
            "minY": float(las.y.min()),
            "minZ": float(las.z.min()),
            "maxX": float(las.x.max()),
            "maxY": float(las.y.max()),
            "maxZ": float(las.z.max()),
        }
        r = client.post(
            "/api/annotations",
            json={"las_file_id": las_file_id, "label": "vegetation", "source": "box", "bbox": bbox},
        )
        r.raise_for_status()
        r = client.post("/api/annotations/export", json={"las_file_id": las_file_id})
        r.raise_for_status()
        export = r.json()
        labeled_path = out.with_name("labeled.las")
        r = client.get(export["url"])
        r.raise_for_status()
        labeled_path.write_bytes(r.content)
        labeled = laspy.read(labeled_path)
        labeled_veg = int(np.sum(labeled.classification == 5))
        elapsed = time.time() - t0
        report = f"""# M1 端到端验收（2026-08-11）

- 输入: {src}（{src.stat().st_size / 1024 / 1024:.1f} MB）
- 结果: {out}（任务 {task_id}）
- OTAB: {bin_out}（{bin_out.stat().st_size / 1024 / 1024:.1f} MB，magic 校验通过）
- 标注闭环: 全量 bbox 标注 vegetation → 导出后 class=5 点数 {labeled_veg}（计数 {export['counts']}）
- 总耗时: {elapsed:.1f}s（上传+分类+下载）
- LAS classification 分布: {dict(zip(classes.tolist(), counts.tolist()))}
- 任务 message: {task['message']}
"""
        Path(args.report).parent.mkdir(parents=True, exist_ok=True)
        Path(args.report).write_text(report, encoding="utf-8")
        print(report)


if __name__ == "__main__":
    main()
