"""跨哲学家弹语选择（engine-api.md §4，桌宠轻场景）。

content_flags 过滤不可协商：mortality / requires-stable-mood 的暂停条件消费
危机日志与时间线状态（memory §6）。宁可少弹，不可弹错。
text 只允许逐字校验的中文原典或概念卡忠实直译；quote / locus 为逐字校验原文（§4）。
"""
import random

from . import config, engine, memory


def _public(q: dict) -> dict:
    """回传展示所需字段；直译与原文都不在运行时改写。"""
    return {
        "id": q["id"],
        "slug": q["slug"],
        "author": q["author"],
        "text": q["text"],
        "text_kind": q["text_kind"],
        "source_text_verified": q.get("source_text_verified", False),
        "translation_reviewed": q["translation_reviewed"],
        "concept": q.get("concept"),
        "locus": q.get("locus"),
        "quote": q.get("quote"),          # 逐字校验原文，展示不许改写
        "source": q.get("source"),
        "corpus_id": q.get("corpus_id"),
        "dilemma_tags": q.get("dilemma_tags", []),
    }


def _memory_id(q: dict) -> str:
    return f"{q['slug']}:{q['id']}"


def _reviewed_display(q: dict) -> bool:
    """只接收忠实直译，或与锚点逐字相同的中文原典。"""
    if q.get("paraphrase") is not False:
        return False
    if q.get("text_kind") == "source_original":
        return (
            q.get("source_text_verified") is True
            and q.get("text") == q.get("quote")
        )
    if q.get("text_kind") == "literal_translation":
        return (
            q.get("translation_reviewed") is True
            and bool(q.get("translation_review_sha256"))
        )
    return False


def _eligible_quotes(slug: str = None) -> list:
    """读取每位哲学家精选榜的 top N；拒绝转述和未复核文本。"""
    slugs = (slug,) if slug else config.QUOTE_SLUGS
    quotes = []
    for package_slug in slugs:
        package = engine.load_package(package_slug)
        for quote in package.quotes[:config.QUOTE_TOP_N]:
            if not _reviewed_display(quote):
                continue
            # 作者身份由精选目录中的 package slug 唯一决定。即使旧进程曾
            # 缓存过带错误 author/slug 的构建条目，也不能把别人的原文署给马可。
            quotes.append({
                **quote,
                "slug": package_slug,
                "author": config.QUOTE_AUTHORS.get(
                    package_slug, quote.get("author", "哲学家")
                ),
            })
    return quotes


def select(user_id: str, slug: str = None) -> dict:
    """按用户状态跨哲学家挑一条忠实直译；显式 slug 时只从该包选择。"""
    tax = engine.load_taxonomy()

    low_mood = memory.self_tag_majority(
        user_id, tax.self_tag_ids, config.STABLE_MOOD_WINDOW_DAYS)
    mortality_blocked = low_mood or memory.had_crisis_since(
        user_id, config.CRISIS_MORTALITY_PAUSE_DAYS)
    stable_blocked = low_mood
    shown = memory.recently_shown_quote_ids(user_id, config.QUOTE_NO_REPEAT_DAYS)
    freq = memory.recent_tag_freq(user_id, config.STABLE_MOOD_WINDOW_DAYS)

    def safe(q: dict) -> bool:
        flags = q.get("content_flags") or []
        if "mortality" in flags and mortality_blocked:
            return False
        if "requires-stable-mood" in flags and stable_blocked:
            return False
        return True

    safe_cands = [q for q in _eligible_quotes(slug) if safe(q)]
    cands = [
        q for q in safe_cands
        if _memory_id(q) not in shown and q["id"] not in shown
    ]
    if not cands:
        # 7 天去重池耗尽后开始下一轮，同时避开刚展示的那一句。
        last_shown = memory.last_shown_quote_id(user_id)
        cands = [
            q for q in safe_cands
            if _memory_id(q) != last_shown and q["id"] != last_shown
        ]
    if not cands:
        return None

    # 优先匹配用户近期高频困境标签；无记忆则随机
    if freq:
        def score(q):
            return sum(freq.get(t, 0) for t in (q.get("dilemma_tags") or []))
        best = max(score(q) for q in cands)
        if best > 0:
            cands = [q for q in cands if score(q) == best]

    chosen = random.choice(cands)
    memory.mark_quote_shown(user_id, _memory_id(chosen))
    return _public(chosen)
