#!/usr/bin/env python3
"""Chat with a compiled distillation package in the terminal.

Usage:
  python3 tools/chat.py [slug]        # default: marcus-aurelius
  python3 tools/chat.py --once "..."  # single turn, for smoke tests

Auth: uses ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN from the environment;
falls back to the env block in ~/.claude/settings.json (Claude Code's config).
Commands in chat: /reset clears history, /quit exits.
"""
import json
import os
import sys
from pathlib import Path

import anthropic

ROOT = Path(__file__).resolve().parents[1]
MODEL = "claude-opus-5"


def resolve_credentials():
    """If no API credentials in env, borrow Claude Code's settings.json env block."""
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return
    settings = Path.home() / ".claude" / "settings.json"
    if settings.exists():
        env = json.loads(settings.read_text()).get("env", {})
        for k in ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL"):
            if k in env:
                os.environ.setdefault(k, env[k])


def load_system_prompt(slug):
    p = ROOT / "packages" / slug / "build" / "system-prompt.md"
    if not p.exists():
        sys.exit(f"not built: {p}\nrun: python3 tools/build_system_prompt.py {slug}")
    return p.read_text(encoding="utf-8")


def turn(client, system, messages):
    """One streamed assistant turn; returns the full text."""
    out = []
    with client.beta.messages.stream(
        model=MODEL,
        max_tokens=8000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=[{"type": "text", "text": system,
                 "cache_control": {"type": "ephemeral"}}],
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)
            out.append(text)
        final = stream.get_final_message()
    print()
    if final.stop_reason == "refusal":
        detail = final.stop_details.explanation if final.stop_details else ""
        print(f"[refused: {detail}]")
    return "".join(out)


def main():
    args = [a for a in sys.argv[1:]]
    once = None
    if "--once" in args:
        i = args.index("--once")
        once = args[i + 1]
        args = args[:i] + args[i + 2:]
    slug = args[0] if args else "marcus-aurelius"

    system = load_system_prompt(slug)
    resolve_credentials()
    client = anthropic.Anthropic()
    messages = []

    if once:
        messages.append({"role": "user", "content": once})
        turn(client, system, messages)
        return

    print(f"[{slug}] 对话开始（/reset 清空，/quit 退出）\n")
    while True:
        try:
            user = input("你: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not user:
            continue
        if user == "/quit":
            break
        if user == "/reset":
            messages.clear()
            print("[已清空]\n")
            continue
        messages.append({"role": "user", "content": user})
        print("他: ", end="")
        reply = turn(client, system, messages)
        messages.append({"role": "assistant", "content": reply})
        print()


if __name__ == "__main__":
    main()
