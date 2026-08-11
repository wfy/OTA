"""真实数据基准：跑 classify_las，输出 markdown 报告。"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.pipeline.classify import classify_las


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", "-i", required=True)
    ap.add_argument("--limit", type=int, default=2_000_000)
    ap.add_argument("--output", "-o", default=None)
    ap.add_argument("--report", default="docs/benchmark/2026-08-11-baseline.md")
    args = ap.parse_args()
    src = Path(args.input)
    out = Path(args.output) if args.output else src.with_name(f"{src.stem}_sign_bench.las")
    res = classify_las(str(src), str(out), limit=args.limit)
    report = f"""# 点云分类基准（2026-08-11）

- 输入: {src}
- 点数上限: {args.limit:,}
- 结果文件: {out}
- 耗时: {res['seconds']}s | 峰值内存: {res['peak_memory_mb']}MB
- 分类统计: 地面 {res['ground']:,} / 杆塔 {res['tower']:,} / 导线 {res['cable']:,} / 植被 {res['vegetation']:,}
- 识别杆塔数: {res['towers']}
"""
    Path(args.report).parent.mkdir(parents=True, exist_ok=True)
    Path(args.report).write_text(report, encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()
