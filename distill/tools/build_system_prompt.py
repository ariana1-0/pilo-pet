#!/usr/bin/env python3
"""Compile a distillation package into a single system prompt.

Usage: python3 tools/build_system_prompt.py [slug]   (default: marcus-aurelius)

Assembly order:
  1. packages/{slug}/persona.md            (who he is and how he speaks)
  2. shared/conversation-constitution.md   (shared boundaries, no turn choreography)
  3. frameworks/*  (condensed: definition + enactment + misuse)
  4. concepts/*    (condensed: quote ref + literal + plain + one_liner + misreadings)
  5. mappings.yaml (routing table, verbatim)
  6. exemplars/*   (few-shot dialogues)
Refuses to include any anchor whose verified flag is not true.
Output: packages/{slug}/build/system-prompt.md
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def front_and_body(path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    return (m.group(1), m.group(2).strip()) if m else ("", text.strip())


def field(front, name):
    m = re.search(rf"^{name}: (.+)$", front, re.M)
    return m.group(1).strip() if m else ""


def check_verified(front, path):
    flags = re.findall(r"verified: (\w+)", front)
    if not flags or any(f not in ("true", "paraphrase") for f in flags):
        sys.exit(f"REFUSED: unverified quote in {path} — run tools/verify_quotes.py first")
    return "paraphrase" in flags


def section(body, header):
    m = re.search(rf"## {re.escape(header)}[^\n]*\n(.*?)(?=\n## |\Z)", body, re.S)
    return m.group(1).strip() if m else ""


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    slug = args[0] if args else "marcus-aurelius"
    deep = "--pet" not in flags          # 深场景默认：原文优先，不喂"说人话"层
    pkg = ROOT / "packages" / slug
    out = pkg / "build" / ("system-prompt.md" if deep else "system-prompt-pet.md")
    out.parent.mkdir(exist_ok=True)

    parts = []
    display = re.search(r"display_name: (.+)", (pkg / "meta.yaml").read_text()).group(1).strip()

    parts.append(f"# 角色：{display}\n\n"
                 f"你是{display}。人格卡决定你如何思考与表达；对话宪法规定所有人物共同遵守的边界。"
                 f"宪法未规定的表达选择，由你的人格、可靠语料和当下对话决定。")

    # 1. persona (identity outranks process)
    parts.append("\n\n# 第一层：人格卡\n\n" + (pkg / "persona.md").read_text(encoding="utf-8").strip())

    # 2. constitution
    parts.append("\n\n# 第二层：对话宪法\n\n"
                 + (ROOT / "shared" / "conversation-constitution.md").read_text(encoding="utf-8").strip())

    # 3. frameworks
    fw = ["\n\n# 第三层：思维框架（对话施展的工具箱）\n",
          "每张框架卡给出：定义、原文锚点（引文逐字可信，出处供界面展示，台词中不掉书袋）、"
          "思考与施展方式、误用警戒。施展方式是理解问题的资源，不是固定顺序或回合脚本。"]
    for p in sorted((pkg / "frameworks").glob("*.md")):
        front, body = front_and_body(p)
        is_para = check_verified(front, p)
        name = field(front, "name")
        definition = field(front, "definition")
        tags = field(front, "dilemma_tags")
        anchors = re.findall(r'corpus_id: ([\w.\-]+)\n\s*quote: "([^"\n]*)"', front)
        mark = "〔转述〕" if is_para else ""
        anchor_lines = "\n".join(f"  - [{cid}]{mark} \"{q}\"" for cid, q in anchors)
        fw.append(f"\n## 框架：{name}\n"
                  f"定义：{definition}\n适用困境：{tags}\n原文锚点：\n{anchor_lines}\n"
                  f"施展步骤：\n{section(body, '对话施展方式')}\n"
                  f"误用警戒：\n{section(body, '误用风险')}")
    parts.append("\n".join(fw))

    # 4. concepts
    cc = ["\n\n# 第四层：概念卡（原文弹药库）\n",
          "以下原文与直译是可用材料。是否引用由当下相关性与人物的自然表达决定；引用时保留其语言特征，不把它统一磨成流畅的现代汉语。"
          if deep else
          "literal 中经精选复核的条目用于桌宠署名弹窗；plain 用于\"说人话\"场景；"
          "one_liner 仅为编辑提炼，不得冒充哲学家原话；引文逐字可信。"]
    for p in sorted((pkg / "concepts").glob("*.md")):
        front, body = front_and_body(p)
        is_para = check_verified(front, p)
        name = field(front, "name")
        tags = field(front, "dilemma_tags")
        cid = field(front, "corpus_id")
        quote = field(front, "quote").strip('"')
        one = section(body, "一句话版（one_liner）")
        qlabel = "出处思想（转述，非逐字）" if is_para else "原文"
        entry = (f"\n## 概念：{name}\n出处：{cid}｜适用：{tags}\n"
                 f"{qlabel}：\"{quote}\"\n"
                 f"直译：{section(body, '忠实直译（literal）')}\n")
        if not deep:
            entry += (f"说人话：{section(body, '说人话（plain）')}\n"
                      f"一句话版：{one}\n")
        entry += f"常见误读：\n{section(body, '常见误读（misreadings）')}"
        cc.append(entry)
    parts.append("\n".join(cc))

    # 5. mappings
    parts.append("\n\n# 第五层：困境路由表\n\n"
                 "识别用户消息的困境标签后，按此表选取本轮的框架/概念（weight 高者优先，"
                 "when 条件分流）。crisis-signal 空映射：命中即走破角色规则。\n\n```yaml\n"
                 + (pkg / "mappings.yaml").read_text(encoding="utf-8").strip() + "\n```")

    # 6. exemplars
    ex = ["\n\n# 第六层：范例对话（人物在不同情境中的可能表达）\n",
          "范例展示可能性，不规定固定流程。只提供正面对话；设计批注、反例和修订历史不进入运行时提示词。"]
    for p in sorted((pkg / "exemplars").glob("*.md")):
        front, body = front_and_body(p)
        dialogue = section(body, "对话")
        if not dialogue:
            sys.exit(f"REFUSED: exemplar has no ## 对话 section: {p}")
        ex.append(f"\n## 范例：{field(front, 'user_opening')}\n\n{dialogue}")
    parts.append("\n".join(ex))

    text = "".join(parts) + "\n"
    out.write_text(text, encoding="utf-8")
    print(f"built: {out.relative_to(ROOT)}")
    print(f"chars: {len(text):,}  (~{len(text)//3:,} tokens rough est. for zh/en mix)")


if __name__ == "__main__":
    main()
