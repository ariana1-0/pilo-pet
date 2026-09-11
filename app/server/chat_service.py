"""哲学家对话（engine-api.md §2，深场景）。

system 构造顺序固定：system-prompt.md 原文 → 追加记忆块。
一字不改 system-prompt，不注入额外人格指令（§2 / §6）。主对话模型不降级。
"""
from . import config, engine, memory


def build_system_text(slug: str, memory_block: str = None) -> str:
    """构造 system 文本：编译产物原文在前，记忆块在后。"""
    pkg = engine.load_package(slug)
    if not memory_block:
        return pkg.system_prompt
    return pkg.system_prompt + "\n\n" + memory_block


def build_memory_digest(user_id: str, mortality_paused: bool) -> str:
    """确定性拼装记忆摘要（memory-design §4，不在请求路径调 LLM）。

    M1：近两周困境频次 + 当前内容指令。侧写/话头/透镜账本待 M2。
    """
    tax = engine.load_taxonomy()
    freq = memory.recent_tag_freq(user_id, config.STABLE_MOOD_WINDOW_DAYS)
    lines = []
    if freq:
        top = sorted(freq.items(), key=lambda kv: -kv[1])[:3]
        names = "、".join(tax.name_by_id.get(k, k) for k, _ in top)
        lines.append(f"- 近两周困境：{names}")
    if mortality_paused:
        lines.append("- 内容指令：mortality 类内容暂停中，勿主动引入死亡冥想类框架。")
    if not lines:
        return None
    digest = "# 关于这位用户（记忆摘要，仅哲学家可见）\n" + "\n".join(lines)
    return digest[: config.MEMORY_DIGEST_MAX_CHARS]


def normalize_messages(messages: list) -> list:
    """只保留 role/content 传给 API（无状态，每次全量）。"""
    out = []
    for m in messages:
        if m.get("role") in ("user", "assistant"):
            out.append({"role": m["role"], "content": m["content"]})
    return out


def stream_reply(client, system_text: str, messages: list):
    """流式一轮，逐块 yield 事件；最后 yield done（含 refusal 检测）。"""
    stop_reason = None
    for event in client.stream(
        model=config.MODEL_CHAT,
        max_tokens=config.CHAT_MAX_TOKENS,
        timeout=config.CHAT_TIMEOUT_SECONDS,
        thinking=config.CHAT_THINKING,
        messages=[{"role": "system", "content": system_text}] + messages,
    ):
        choices = event.get("choices") or []
        if not choices:
            continue
        choice = choices[0]
        delta = choice.get("delta") or {}
        text = delta.get("content")
        if isinstance(text, str) and text:
            yield {"type": "delta", "text": text}
        if choice.get("finish_reason") is not None:
            stop_reason = choice["finish_reason"]
    yield {"type": "done", "stop_reason": stop_reason or "stop", "refusal": None}
