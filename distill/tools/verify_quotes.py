#!/usr/bin/env python3
"""Gate A: verify every quote in distillation cards against the corpus.

Scans packages/*/ for markdown cards containing anchor blocks:
    corpus_id: med-5.1
    quote: "..."
    verified: true|false

A quote PASSes when its normalized token sequence appears contiguously in
the normalized text of the referenced corpus entry.

Modes:
  (default)  report PASS / PASS* (normalized-only) / FAIL per anchor
  --fix      rewrite each PASS* quote to the corpus-verbatim substring
  --write    set 'verified: true' on the line following each verbatim PASS

verified: true is only ever written for verbatim matches; run --fix first.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


TOKEN_RE = r"[a-z0-9']+|[一-鿿]"


def normalize_tokens(s):
    s = s.lower().replace("’", "'").replace("‘", "'")
    return re.findall(TOKEN_RE, s)


def token_spans(s):
    """tokens plus their (start,end) char offsets in s"""
    out = []
    for m in re.finditer(r"[A-Za-z0-9'‘’]+|[一-鿿]", s):
        out.append((m.group(0).lower().replace("’", "'").replace("‘", "'"),
                    m.start(), m.end()))
    return out


def find_window(corpus_text, quote):
    """return (start,end) char span in corpus_text matching quote tokens, else None"""
    q = normalize_tokens(quote)
    if not q:
        return None
    spans = token_spans(corpus_text)
    toks = [t for t, _, _ in spans]
    for i in range(len(toks) - len(q) + 1):
        if toks[i:i + len(q)] == q:
            start = spans[i][1]
            end = spans[i + len(q) - 1][2]
            # extend over trailing sentence punctuation
            while end < len(corpus_text) and corpus_text[end] in ".,;:!?)”'\"。，；：！？、）…":
                end += 1
            return start, end
    return None


def load_corpus():
    corpus = {}
    for jl in ROOT.glob("packages/*/corpus/*.jsonl"):
        for line in jl.read_text(encoding="utf-8").splitlines():
            e = json.loads(line)
            corpus[e["id"]] = e["text"]
    return corpus


ANCHOR_RE = re.compile(
    r'(corpus_id:\s*(?P<cid>[\w.\-]+)\s*\n'
    r'\s*quote:\s*"(?P<quote>[^"\n]*)"\s*\n'
    r'\s*verified:\s*(?P<ver>true|false|paraphrase))',
    re.M)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix", action="store_true")
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    corpus = load_corpus()
    n_pass = n_norm = n_fail = n_para = 0
    para_pkgs = set()

    for md in sorted(ROOT.glob("packages/*/**/*.md")):
        text = md.read_text(encoding="utf-8")
        changed = False
        out = text
        for m in list(ANCHOR_RE.finditer(text)):
            cid, quote = m.group("cid"), m.group("quote")
            rel = md.relative_to(ROOT)
            if quote.startswith("待"):
                print(f"SKIP  {rel} :: {cid} (placeholder quote)")
                continue
            if m.group("ver") == "paraphrase":
                n_para += 1
                para_pkgs.add(rel.parts[1] if len(rel.parts) > 1 else str(rel))
                print(f"PARA  {rel} :: {cid} (declared paraphrase — NOT verified against any corpus)")
                continue
            entry = corpus.get(cid)
            if entry is None:
                n_fail += 1
                print(f"FAIL  {rel} :: {cid} — corpus id not found")
                continue
            win = find_window(entry, quote)
            if win is None:
                n_fail += 1
                print(f"FAIL  {rel} :: {cid} — quote not found in entry")
                continue
            # verbatim test: quote must equal the corpus substring at the window start
            if entry[win[0]:win[0] + len(quote)] == quote:
                verbatim = quote
            else:
                verbatim = entry[win[0]:win[1]]
            if verbatim == quote:
                n_pass += 1
                print(f"PASS  {rel} :: {cid} (verbatim)")
                if args.write and m.group("ver") == "false":
                    block = m.group(1)
                    out = out.replace(block, block.replace("verified: false", "verified: true"))
                    changed = True
            else:
                n_norm += 1
                print(f"PASS* {rel} :: {cid} (normalized only — quote differs from corpus verbatim)")
                if args.fix:
                    if '"' in verbatim:
                        print(f"      cannot --fix (corpus text contains double quote), fix by hand")
                    else:
                        block = m.group(1)
                        out = out.replace(block, block.replace(f'quote: "{quote}"',
                                                               f'quote: "{verbatim}"'))
                        changed = True
                        print(f"      fixed -> {verbatim[:80]}...")
        if changed:
            md.write_text(out, encoding="utf-8")

    print(f"\nverbatim: {n_pass}  normalized-only: {n_norm}  fail: {n_fail}  paraphrase(unverified): {n_para}")
    if n_para:
        print(
            f"\n⚠️  {n_para} 处锚点未经任何语料校验（转述路线，包：{', '.join(sorted(para_pkgs))}）。\n"
            f"    fail: 0 不代表这些引文为真——它们只是没被检查。\n"
            f"    仅限自用；公开发行前必须建 corpus/ 并逐条对回真实文本（SCHEMA.md §5.2）。"
        )
    return 1 if n_fail else 0


if __name__ == "__main__":
    sys.exit(main())
