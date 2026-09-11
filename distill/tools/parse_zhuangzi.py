#!/usr/bin/env python3
"""Parse Zhuangzi inner chapters (raw sentence-per-line files) into corpus JSONL.

Segmentation: the raw files are one sentence per line with no paragraph marks.
We group consecutive sentences greedily into segments of <= MAX_CHARS, which
approximates fable/argument units well enough for anchoring; famous passages
stay intact because they are shorter than the cap. id: zz-{chapter}.{seq}.
"""
import json
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "packages/zhuangzi/corpus/raw"
OUT = Path(__file__).resolve().parents[1] / "packages/zhuangzi/corpus/neipian.jsonl"

CHAPTERS = ["逍遥游", "齐物论", "养生主", "人间世", "德充符", "大宗师", "应帝王"]
MAX_CHARS = 420


def main():
    entries = []
    for ci, ch in enumerate(CHAPTERS, 1):
        lines = [l.strip() for l in (RAW / f"{ch}.txt").read_text(encoding="utf-8").splitlines()
                 if l.strip()]
        segs, cur = [], ""
        for l in lines:
            if cur and len(cur) + len(l) > MAX_CHARS:
                segs.append(cur)
                cur = l
            else:
                cur += l
        if cur:
            segs.append(cur)
        for si, text in enumerate(segs, 1):
            entries.append({
                "id": f"zz-{ci}.{si}",
                "work": "庄子",
                "book": ci,
                "entry": si,
                "locus": f"{ch}·第 {si} 段",
                "lang": "zh",
                "source": "先秦公版原典（转自 NiuTrans/Classical-Modern source.txt，需与权威底本校对）",
                "text": text,
            })
    with OUT.open("w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    per = {}
    for e in entries:
        per[e["book"]] = per.get(e["book"], 0) + 1
    print(f"total segments: {len(entries)}; per chapter: {per}")


if __name__ == "__main__":
    main()
