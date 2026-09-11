#!/usr/bin/env python3
"""Parse Analects (Classical-Modern source.txt, 20 chapter files) into corpus JSONL.

Entry unit: 则 (saying/dialog block), split on strong speaker-opening markers at
line starts. Dialog chapters may split into several entries (each still coherent);
locus therefore reads 学而·第 N 则 in THIS corpus's own ordering — may deviate
slightly from canonical 章 numbering (noted in meta.yaml).

Output: corpus/lunyu.jsonl  {id: lun-{篇序}.{则序}, work, book, entry, locus, lang, source, text}
"""
import json
import re
from pathlib import Path

PKG = Path(__file__).resolve().parents[1] / "packages/confucius"
RAW = PKG / "corpus/raw"
OUT = PKG / "corpus/lunyu.jsonl"

CHAPTERS = ["学而", "为政", "八佾", "里仁", "公冶长", "雍也", "述而", "泰伯", "子罕", "乡党",
            "先进", "颜渊", "子路", "宪问", "卫灵公", "季氏", "阳货", "微子", "子张", "尧曰"]

SPEAKERS = ("子曰|孔子曰|有子曰|曾子曰|子夏曰|子贡曰|子游曰|子张曰|子路曰|颜渊曰|仲弓|司马牛|樊迟|宰我|"
            "或曰|或问|哀公|定公|季康子|季氏|叶公|齐景公|陈司败|太宰|达巷|棘子成|林放|王孙贾|孟懿子|"
            "孟武伯|孟孙|三家|仪封人|微生|阳货|孺悲|长沮|楚狂|齐人|周公谓|舜|子禽|宪问|南宫适|"
            "原思|冉子|冉有|闵子|公西华|曾皙|颜渊、|颜渊季路|子谓|子见|子入|子在|子与|子食|子之|"
            "子于|子问|厩焚|色斯|凤鸟|唐棣|巍巍|大哉|泰伯|民之")
OPEN_RE = re.compile(rf"^({SPEAKERS})")


def split_entries(lines):
    blocks, cur = [], []
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        # mid-line new saying: "……鲜矣仁！ 子曰： ……" → split it out
        parts = re.split(r"(?<=[。！？]) (?=(?:子曰|孔子曰|有子曰|曾子曰|子夏曰|子贡曰)：)", ln)
        for j, part in enumerate(parts):
            part = part.strip()
            if not part:
                continue
            is_open = bool(OPEN_RE.match(part)) or j > 0
            if is_open and cur:
                blocks.append(cur)
                cur = [part]
            else:
                cur.append(part)
    if cur:
        blocks.append(cur)
    return ["\n".join(b) for b in blocks]


def main():
    entries = []
    for bi, name in enumerate(CHAPTERS, 1):
        f = RAW / f"{name}篇.txt"
        text_blocks = split_entries(f.read_text(encoding="utf-8").splitlines())
        for ei, text in enumerate(text_blocks, 1):
            entries.append({
                "id": f"lun-{bi}.{ei}",
                "work": "论语",
                "book": bi,
                "entry": ei,
                "locus": f"{name}·第 {ei} 则",
                "lang": "zh",
                "source": "论语（公版原典，NiuTrans/Classical-Modern source.txt）",
                "text": text,
            })
    with OUT.open("w", encoding="utf-8") as fp:
        for e in entries:
            fp.write(json.dumps(e, ensure_ascii=False) + "\n")
    per = {}
    for e in entries:
        per[e["book"]] = per.get(e["book"], 0) + 1
    print(f"total: {len(entries)}")
    print("per chapter:", dict(sorted(per.items())))


if __name__ == "__main__":
    main()
