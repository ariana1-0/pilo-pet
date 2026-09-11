#!/usr/bin/env python3
"""Gate D runner: automated exam for a compiled philosopher package.

Usage:
  python3 tools/run_gate_d.py [slug] [--only known|misreading|rhythm] [--workers N]

Suites:
  known      packages/{slug}/eval/known-answers.yaml
  misreading shared/eval/generic-misreadings.yaml + packages/{slug}/eval/misreadings.yaml
  rhythm     shared/eval/rhythm-cases.yaml

Per case: run the scripted conversation against the compiled system prompt,
apply mechanical rule checks, then an LLM judge with the case's criteria.
Output: console summary + packages/{slug}/build/gate-d-report.md
Exit code: number of failed cases (0 = gate passed).
"""
import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import yaml
import anthropic

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chat import resolve_credentials  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
SUBJECT_MODEL = "claude-opus-5"
JUDGE_MODEL = "claude-opus-5"

JUDGE_SYSTEM = """你是一个严格的对话质量裁判。你会收到一段"哲学家产品"的对话记录和一份判定标准。
只依据给出的标准判定，不引入自己的偏好。轻微瑕疵不算 FAIL，标准里写明的失败条件命中才算。
只输出 JSON：{"verdict": "PASS" 或 "FAIL", "reason": "≤60字的理由，FAIL 时指出命中哪条"}"""


def load_yaml(path):
    return yaml.safe_load(path.read_text(encoding="utf-8")) if path.exists() else []


def run_conversation(client, system, turns):
    """Play scripted user turns; return list of assistant replies."""
    messages, replies = [], []
    for u in turns:
        messages.append({"role": "user", "content": u})
        with client.beta.messages.stream(
            model=SUBJECT_MODEL, max_tokens=8000,
            betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            system=[{"type": "text", "text": system,
                     "cache_control": {"type": "ephemeral"}}],
            messages=messages,
        ) as st:
            reply = "".join(st.text_stream)
        replies.append(reply)
        messages.append({"role": "assistant", "content": reply})
    return replies


def ends_with_question(text):
    return text.rstrip().rstrip('"”』」）)').endswith(("？", "?"))


def has_list(text):
    return bool(re.search(r"^\s*(\d+[\.、）)]\s|[-•*]\s)", text, re.M))


def rule_check(rules, turns, replies):
    """Return list of rule violations."""
    v = []
    if rules.get("no_list") and any(has_list(r) for r in replies):
        v.append("出现清单/编号")
    mcq = rules.get("max_consecutive_question_endings")
    if mcq is not None:
        run = best = 0
        for r in replies:
            run = run + 1 if ends_with_question(r) else 0
            best = max(best, run)
        if best > mcq:
            v.append(f"连续问题收尾 {best} 轮（上限 {mcq}）")
    return v


def transcript(turns, replies):
    out = []
    for u, a in zip(turns, replies):
        out.append(f"用户：{u}\n哲学家：{a}")
    return "\n\n".join(out)


def judge(client, tx, criteria):
    resp = client.messages.create(
        model=JUDGE_MODEL, max_tokens=1000,
        system=JUDGE_SYSTEM,
        messages=[{"role": "user", "content":
                   f"## 对话记录\n\n{tx}\n\n## 判定标准\n\n{criteria}"}],
    )
    text = "".join(b.text for b in resp.content if b.type == "text")
    m = re.search(r'\{[^{}]*"verdict"[^{}]*\}', text, re.S)
    try:
        d = json.loads(m.group(0))
        return d["verdict"].upper(), d.get("reason", "")
    except Exception:
        return "ERROR", f"judge output unparseable: {text[:100]}"


def run_case(client, system, case, suite):
    if suite == "known":
        turns = [case["question"]]
        criteria = (f"期望方向：\n{case['expected']}\n失败信号（命中即 FAIL）：{case['fail_signals']}\n"
                    "判三项：方向一致、框架一致（用他的推理路径而非泛泛道理）、"
                    "不冒充（原文未涉处不硬答）。三项皆可才 PASS。")
        rules = {}
    else:
        turns = case["turns"]
        criteria = case.get("fail_criteria") or case.get("judge")
        rules = case.get("rules", {})

    replies = run_conversation(client, system, turns)
    tx = transcript(turns, replies)
    violations = rule_check(rules, turns, replies)
    verdict, reason = judge(client, tx, criteria)
    if violations:
        verdict = "FAIL"
        reason = ("规则违例：" + "；".join(violations) + ("｜" + reason if reason else ""))
    return {"suite": suite, "id": case["id"], "name": case.get("name", case["id"]),
            "verdict": verdict, "reason": reason, "transcript": tx}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug", nargs="?", default="marcus-aurelius")
    ap.add_argument("--only", choices=["known", "misreading", "rhythm"])
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    pkg = ROOT / "packages" / args.slug
    system_path = pkg / "build" / "system-prompt.md"
    if not system_path.exists():
        sys.exit(f"not built: {system_path}")
    system = system_path.read_text(encoding="utf-8")

    cases = []
    if args.only in (None, "known"):
        cases += [(c, "known") for c in load_yaml(pkg / "eval" / "known-answers.yaml")]
    if args.only in (None, "misreading"):
        cases += [(c, "misreading") for c in load_yaml(ROOT / "shared" / "eval" / "generic-misreadings.yaml")]
        cases += [(c, "misreading") for c in load_yaml(pkg / "eval" / "misreadings.yaml")]
    if args.only in (None, "rhythm"):
        cases += [(c, "rhythm") for c in load_yaml(ROOT / "shared" / "eval" / "rhythm-cases.yaml")]

    resolve_credentials()
    client = anthropic.Anthropic()
    print(f"[gate-d] {args.slug}: {len(cases)} cases, {args.workers} workers")

    with ThreadPoolExecutor(args.workers) as ex:
        results = list(ex.map(lambda t: run_case(client, system, *t), cases))

    fails = [r for r in results if r["verdict"] != "PASS"]
    lines = [f"# Gate D 报告：{args.slug}（{date.today()}）\n",
             f"**{len(results) - len(fails)} / {len(results)} PASS**\n",
             "| 卷 | 用例 | 结果 | 理由 |", "|---|---|---|---|"]
    for r in results:
        mark = "✅" if r["verdict"] == "PASS" else "❌"
        lines.append(f"| {r['suite']} | {r['name']} | {mark} {r['verdict']} | {r['reason']} |")
    if fails:
        lines.append("\n## 失败用例对话记录\n")
        for r in fails:
            lines.append(f"### {r['id']}（{r['reason']}）\n\n{r['transcript']}\n")
    report = pkg / "build" / "gate-d-report.md"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")

    for r in results:
        mark = "PASS" if r["verdict"] == "PASS" else f"FAIL({r['reason'][:40]})"
        print(f"  {r['suite']:<11} {r['id']:<28} {mark}")
    print(f"[gate-d] {len(results) - len(fails)}/{len(results)} PASS -> {report.relative_to(ROOT)}")
    return len(fails)


if __name__ == "__main__":
    sys.exit(main())
