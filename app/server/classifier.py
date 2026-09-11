"""困境分类器（engine-api.md §3，前置于哲学家对话）。

输入用户消息（+ 最近上下文），输出 0-2 个困境标签 + crisis 布尔。
双重危机判定：本地关键词粗筛（不依赖模型）∪ 模型判定，任一命中即危机。
分类器不可用/超时 → 降级为仅粗筛结果（§5.5），宁可误报不可漏报。
"""
import json
import re

from . import config, crisis, engine


def _system(tax: engine.Taxonomy) -> str:
    return (
        "你是困境分类器。读用户最新消息（结合上下文），从下列标签中选 0-2 个最贴切的，"
        "并判定是否存在危机信号（自伤/自杀意念、急性崩溃）。危机判定宁可误报不可漏报。\n\n"
        "可选标签：\n" + tax.few_shot_lines() +
        "\n\n只输出一个 JSON 对象，不要自然语言或 Markdown。格式必须是："
        '{"tags":["标签-id"],"crisis":false}'
    )


def _messages(user_text: str, context_tail: list) -> list:
    msgs = []
    for m in (context_tail or [])[-4:]:
        if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str):
            msgs.append({"role": m["role"], "content": m["content"]})
    if not msgs or msgs[-1]["role"] != "user" or msgs[-1]["content"] != user_text:
        msgs.append({"role": "user", "content": user_text})
    return msgs


def classify(client, user_text: str, context_tail: list = None) -> dict:
    """返回 {tags: [...], crisis: bool, degraded: bool}。"""
    crisis_local = crisis.local_prescreen(user_text)
    # 安全短路：本地粗筛已命中危机时立即旁路，不等模型网络调用——
    # 危机处理是安全红线，绝不能阻塞在分类器的网络往返上。
    if crisis_local:
        return {"tags": [], "crisis": True, "degraded": False}

    tax = engine.load_taxonomy()
    valid = set(tax.tag_ids)

    try:
        resp = client.complete(
            model=config.MODEL_CLASSIFIER,
            max_tokens=config.CLASSIFIER_MAX_TOKENS,
            timeout=config.CLASSIFIER_TIMEOUT_SECONDS,
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": _system(tax)}]
            + _messages(user_text, context_tail),
        )
        content = resp["choices"][0]["message"]["content"]
        # 兼容模型偶尔仍包一层 ```json ... ``` 的情况。
        if not isinstance(content, str):
            raise ValueError("classifier content is not text")
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            raise ValueError("classifier did not return JSON")
        data = json.loads(match.group(0))
        raw_tags = data.get("tags", [])
        if not isinstance(raw_tags, list):
            raise ValueError("classifier tags is not a list")
        tags = [t for t in raw_tags if isinstance(t, str) and t in valid][:2]
        crisis_model = bool(data.get("crisis"))
    except Exception:  # noqa: BLE001
        # 分类器不可用 → 仅凭本地粗筛，其余放行
        return {"tags": [], "crisis": crisis_local, "degraded": True}
    return {"tags": tags, "crisis": crisis_local or crisis_model, "degraded": False}
