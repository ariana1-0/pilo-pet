#!/usr/bin/env python3
"""声纹 lint：检查 persona 声纹证据、范例引文出处与跨包句式碰撞。

人工盲测（shared/eval/voice-discrimination.md）太贵，不能每次改动都跑；本脚本抓的是
可机械判断的回归。v4 不检查首轮引文或每轮引文密度。

用法：
    python3 tools/lint_voice.py              # 全部包
    python3 tools/lint_voice.py zhuangzi     # 指定包
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PKGS = ROOT / "packages"

QUOTE_RE = re.compile(r"[「『“]([^」』”]{6,})[」』”]")
# 范例里标记哲学家发言的行首（各包统一用 **哲学家** / **马可** 之类的粗体说话人）
SPEAKER_RE = re.compile(r"^\*\*(.+?)\*\*[:：]")
VOICE_SECTION_RE = re.compile(r"声纹|voice[- ]print", re.I)


def norm(s: str) -> str:
    """归一化：去空白、统一标点，用于逐字比对（与 verify_quotes.py 同策略）。"""
    s = unicodedata.normalize("NFKC", s)
    s = re.sub(r"\s+", "", s)
    for a, b in [("，", ","), ("。", "."), ("；", ";"), ("：", ":"),
                 ("！", "!"), ("？", "?"), ("、", ","), ("’", "'"), ("‘", "'")]:
        s = s.replace(a, b)
    return s


def load_corpus(pkg: Path):
    """返回 (归一化全文, corpus_id 集合, 是否中文语料)。"""
    blob, ids, langs = [], set(), set()
    for f in sorted((pkg / "corpus").glob("*.jsonl")):
        for line in f.open(encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            blob.append(rec.get("text", ""))
            if rec.get("id"):
                ids.add(rec["id"])
            langs.add(rec.get("lang", ""))
    is_zh = any(l.startswith("zh") for l in langs)
    return norm("\n".join(blob)), ids, is_zh


def lint_persona(pkg: Path, out: list) -> bool:
    p = pkg / "persona.md"
    if not p.exists():
        out.append(("FAIL", "persona.md 缺失"))
        return False
    text = p.read_text(encoding="utf-8")
    heads = [h for h in re.findall(r"^#{2,3}\s*(.+)$", text, re.M)
             if VOICE_SECTION_RE.search(h)]
    if not heads:
        out.append(("FAIL", "persona.md 无声纹样本层"))
        return False
    # 声纹层里必须有真实句子样本，而非只有形容词描述
    n = len(QUOTE_RE.findall(text))
    if n < 5:
        out.append(("WARN", f"persona.md 声纹层仅 {n} 条引号样本，建议补充可追溯的语言证据"))
        return True
    out.append(("ok", f"persona.md 声纹层在位（{n} 条样本）"))
    return True


def lint_exemplar(f: Path, corpus: str, ids: set, is_zh: bool, out: list) -> bool:
    text = f.read_text(encoding="utf-8")
    # 只看对话部分：批注区（## 批注 / annotations 之后）不计入密度
    cut = re.split(r"^#{2,3}\s*(?:批注|annotations?|语感自检)", text, 1, re.M)[0]
    turns = []
    cur = None
    for line in cut.splitlines():
        m = SPEAKER_RE.match(line.strip())
        if m:
            cur = [line]
            turns.append((m.group(1), cur))
        elif cur is not None:
            cur.append(line)
    # 用户轮不计
    phil = [(who, "\n".join(body)) for who, body in turns
            if not re.search(r"用户|user", who, re.I)]
    if not phil:
        out.append(("WARN", f"{f.name}: 未识别出说话人标记，跳过引文检查"))
        return True

    quotes = [q for _, body in phil for q in QUOTE_RE.findall(body)]

    ok = True
    # 范例使用引文时必须在 frontmatter 声明出处；v4 不要求每篇必须引用。
    declared = re.findall(r"^quotes_used:\s*\[(.*?)\]", text, re.M)
    used = [x.strip() for x in declared[0].split(",")] if declared else []
    if quotes and not used:
        out.append(("FAIL", f"{f.name}: 使用了引文但 frontmatter 缺 quotes_used"))
        ok = False
    for cid in used:
        if cid and cid not in ids:
            out.append(("FAIL", f"{f.name}: quotes_used 中 {cid} 不在语料中"))
            ok = False

    if is_zh and quotes:
        # 中文语料：中文引文可直接逐字比对
        for q in quotes:
            if norm(q) not in corpus:
                out.append(("FAIL", f"{f.name}: 引文未逐字命中语料 → 「{q[:36]}…」"))
                ok = False
    elif quotes:
        # 英译语料：范例里是保留句法的中文直译，无法与英文原文机械比对；
        # 逐字校验由 verify_quotes.py 在卡片锚点（英文）一侧完成，此处只校验出处存在。
        out.append(("ok", f"{f.name}: 英译语料，中文直译的逐字校验依赖卡片锚点"))

    if ok:
        if quotes:
            out.append(("ok", f"{f.name}: {len(quotes)} 处标记原文，出处 {len(used)} 条全部有效"))
        else:
            out.append(("ok", f"{f.name}: 未使用引文（v4 允许，由人物与情境决定）"))
    return ok


ID_LEAK_RE = re.compile(r"\b(?:med|zz|dao|lun|tsz)-\d+(?:\.\d+)?\b")


def lint_id_leak(f: Path, out: list) -> bool:
    """内部 corpus_id 不得出现在对话正文（用户可见）——出处要说人话。

    frontmatter 的 quotes_used 与批注区里的 id 是给维护者看的，不算泄漏。
    """
    text = f.read_text(encoding="utf-8")
    body = re.split(r"^#{2,3}\s*(?:批注|annotations?|语感自检)", text, 1, re.M)[0]
    body = re.sub(r"^---.*?^---", "", body, count=1, flags=re.S | re.M)
    leaks = sorted(set(ID_LEAK_RE.findall(body)))
    if leaks:
        out.append(("FAIL",
                    f"{f.name}: 对话正文出现内部语料 id {', '.join(leaks)}"
                    "（出处须为人话，如「卷八第四十七」）"))
        return False
    return True


def phil_lines(f: Path) -> list:
    """范例里哲学家说出口的句子（切到标点），用于跨包碰撞检测。"""
    text = f.read_text(encoding="utf-8")
    cut = re.split(r"^#{2,3}\s*(?:批注|annotations?|语感自检)", text, 1, re.M)[0]
    lines, cur = [], None
    for line in cut.splitlines():
        m = SPEAKER_RE.match(line.strip())
        if m:
            cur = not re.search(r"用户|user", m.group(1), re.I)
            line = line.strip()[m.end():]
        if not cur:
            continue
        # 引文内部是原文，不算声纹碰撞；剥掉后再切句
        line = QUOTE_RE.sub("", line)
        for s in re.split(r"[。！？；\n]", line):
            s = norm(re.sub(r"[*（）()]", "", s))
            if len(s) >= 8:
                lines.append(s)
    return lines


def lint_collisions(samples: dict, out_lines: list) -> int:
    """检测两包共有的 8 字以上句首骨架，作为人工盲测前的便宜预警。"""
    heads: dict = {}
    for name, lines in samples.items():
        for s in lines:
            heads.setdefault(s[:8], set()).add(name)
    bad = 0
    for head, pkgs in sorted(heads.items()):
        if len(pkgs) > 1:
            out_lines.append(f"   ❌ 「{head}…」同时出现在：{', '.join(sorted(pkgs))}")
            bad += 1
    return bad


def main() -> int:
    want = sys.argv[1:]
    names = sorted(p.name for p in PKGS.iterdir() if (p / "persona.md").exists())
    if want:
        names = [n for n in names if n in want]
    bad = 0
    samples: dict = {}
    for name in names:
        pkg = PKGS / name
        out: list = []
        corpus, ids, is_zh = load_corpus(pkg)
        lint_persona(pkg, out)
        ex = sorted((pkg / "exemplars").glob("*.md"))
        if not ex:
            out.append(("WARN", "exemplars/ 为空"))
        if not corpus:
            out.append(("WARN", "语料为空（如加缪的版权约束），引文真实性改为人工判定"))
        else:
            for f in ex:
                lint_exemplar(f, corpus, ids, is_zh, out)
        for f in ex:
            lint_id_leak(f, out)
            samples.setdefault(name, []).extend(phil_lines(f))
        fails = [m for lv, m in out if lv == "FAIL"]
        bad += len(fails)
        icon = "❌" if fails else "✅"
        print(f"\n{icon} {name}")
        for lv, m in out:
            print(f"   {'❌' if lv == 'FAIL' else '⚠️ ' if lv == 'WARN' else '  '} {m}")
    # 跨包碰撞只在全量跑时有意义（单包跑不出对照）
    if len(samples) > 1:
        coll: list = []
        n = lint_collisions(samples, coll)
        bad += n
        print(f"\n{'❌' if n else '✅'} 跨包声纹碰撞")
        for line in coll:
            print(line)
        if not n:
            print(f"      {sum(len(v) for v in samples.values())} 句无跨包重合句首")

    print(f"\n{'─' * 50}\n{'FAIL: ' + str(bad) + ' 项' if bad else '全部通过'}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
