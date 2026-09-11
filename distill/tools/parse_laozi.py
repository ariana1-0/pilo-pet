#!/usr/bin/env python3
"""Download + parse Daodejing (NiuTrans/Classical-Modern, source.txt only) into corpus JSONL.

Usage:
  python3 tools/parse_laozi.py --download   # fetch raw chapter files
  python3 tools/parse_laozi.py              # parse raw -> corpus/daodejing.jsonl
"""
import json
import subprocess
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "packages/laozi/corpus/raw"
OUT = ROOT / "packages/laozi/corpus/daodejing.jsonl"

DIGITS = "零一二三四五六七八九"


def cn_num(n: int) -> str:
    if n <= 10:
        return DIGITS[n] if n < 10 else "十"
    if n < 20:
        return "十" + DIGITS[n - 10]
    tens, ones = divmod(n, 10)
    return DIGITS[tens] + "十" + (DIGITS[ones] if ones else "")


def chapter_name(n: int) -> str:
    return f"第{cn_num(n)}章"


def download():
    RAW.mkdir(parents=True, exist_ok=True)
    base = ("https://raw.githubusercontent.com/NiuTrans/Classical-Modern/main/"
            + urllib.parse.quote("双语数据/老子"))
    for n in range(1, 82):
        part = urllib.parse.quote("道经" if n <= 37 else "德经")
        name = chapter_name(n)
        url = f"{base}/{part}/{urllib.parse.quote(name)}/source.txt"
        dest = RAW / f"{n:02d}-{name}.txt"
        if dest.exists() and dest.stat().st_size > 0:
            continue
        r = subprocess.run(["curl", "-sL", "--max-time", "60", url, "-o", str(dest)])
        if r.returncode != 0 or not dest.stat().st_size:
            print(f"FAIL ch{n}", file=sys.stderr)
    print(f"downloaded -> {RAW}")


def parse():
    entries = []
    for n in range(1, 82):
        name = chapter_name(n)
        f = RAW / f"{n:02d}-{name}.txt"
        text = "\n".join(l.strip() for l in f.read_text(encoding="utf-8").splitlines()
                         if l.strip())
        if not text:
            sys.exit(f"empty chapter {n}")
        entries.append({
            "id": f"dao-{n}",
            "work": "道德经",
            "book": 1 if n <= 37 else 2,
            "entry": n,
            "locus": name,
            "lang": "zh",
            "source": "NiuTrans/Classical-Modern source.txt（网络转录，需与权威底本〔如王弼本〕抽样校对）",
            "text": text,
        })
    with OUT.open("w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    print(f"parsed {len(entries)} chapters -> {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    if "--download" in sys.argv:
        download()
    else:
        parse()
