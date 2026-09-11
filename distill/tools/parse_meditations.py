#!/usr/bin/env python3
"""Parse Gutenberg #15877 (Meditations, George Long trans.) into corpus JSONL.

Output: one JSON object per entry:
  {id, work, book, entry, locus, lang, source, text}
Text cleaning: footnote definition paragraphs dropped, inline [A]-style
markers stripped, lines joined within paragraphs, paragraphs kept as \n\n.
"""
import json
import re
import sys
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "packages/marcus-aurelius/corpus/raw/pg15877.txt"
OUT = Path(__file__).resolve().parents[1] / "packages/marcus-aurelius/corpus/meditations.jsonl"

ROMAN = {r: i + 1 for i, r in enumerate(
    ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"])}

CN_NUM = "零一二三四五六七八九十"


def cn_book(n: int) -> str:
    names = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"]
    return names[n - 1]


def clean_paragraph(lines):
    text = " ".join(l.strip() for l in lines)
    text = re.sub(r"\[[A-Z]\]", "", text)          # inline footnote markers
    text = re.sub(r"\s+", " ", text).strip()
    return text


def main():
    lines = RAW.read_text(encoding="utf-8").splitlines()

    # THOUGHTS section: from first book marker to INDEXES.
    book_starts = [i for i, l in enumerate(lines)
                   if re.fullmatch(r"[IVXL]+\.", l.strip()) and l.strip()[:-1] in ROMAN]
    end = next(i for i, l in enumerate(lines) if l.strip() == "INDEXES.")
    book_starts = [i for i in book_starts if i < end]
    assert len(book_starts) == 12, f"expected 12 books, got {len(book_starts)}"

    entries = []
    for bi, start in enumerate(book_starts):
        book = ROMAN[lines[start].strip()[:-1]]
        stop = book_starts[bi + 1] if bi + 1 < 12 else end
        body = lines[start + 1:stop]

        # split into paragraphs
        paras, cur = [], []
        for l in body:
            if l.strip():
                cur.append(l)
            elif cur:
                paras.append(cur)
                cur = []
        if cur:
            paras.append(cur)

        # drop footnote-definition paragraphs
        paras = [p for p in paras if not re.match(r"^\s*\[[A-Z]\]", p[0])]

        # group paragraphs into entries; "N. " at paragraph start opens entry N
        current_no, buf, book_entries = 1, [], {}
        for p in paras:
            m = re.match(r"^\s*(\d+)\.\s+(.*)", p[0])
            if m and int(m.group(1)) > current_no:
                if buf:
                    book_entries[current_no] = buf
                current_no = int(m.group(1))
                buf = [[m.group(2)] + p[1:]]
            else:
                buf.append(p)
        if buf:
            book_entries[current_no] = buf

        for no, ps in sorted(book_entries.items()):
            text = "\n\n".join(clean_paragraph(p) for p in ps).strip()
            if not text:
                continue
            entries.append({
                "id": f"med-{book}.{no}",
                "work": "沉思录",
                "book": book,
                "entry": no,
                "locus": f"卷{cn_book(book)}·第 {no} 条",
                "lang": "en",
                "source": "George Long 英译（公版，Project Gutenberg #15877）",
                "text": text,
            })

    with OUT.open("w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")

    per_book = {}
    for e in entries:
        per_book[e["book"]] = per_book.get(e["book"], 0) + 1
    print(f"total entries: {len(entries)}")
    print("per book:", dict(sorted(per_book.items())))


if __name__ == "__main__":
    sys.exit(main())
