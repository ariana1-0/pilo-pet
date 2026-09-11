"""危机旁路：prompt 之外的服务层硬旁路（engine-api.md §5，安全红线）。

两道防线：
1. 本地高危关键词粗筛——不依赖任何模型，分类器超时/不可用时的兜底（§5.5）；
2. 分类器 crisis 判定（在 classifier.py）。
任一命中即旁路，不调用哲学家对话。宁可误报不可漏报。
"""
import re

from . import resources

# 自伤/自杀高危词表（粗筛，故意宽松）。命中即视为危机。
_KEYWORDS = [
    "自杀", "自尽", "轻生", "想死", "不想活", "活不下去", "活不下来", "不想活了",
    "结束生命", "结束自己", "了结自己", "一了百了", "解脱算了", "撑不下去",
    "自残", "自伤", "割腕", "跳楼", "跳下去", "上吊", "安眠药", "吃药结束",
    "没有意义活着", "活着没意思", "消失算了", "死了算了",
    "suicide", "kill myself", "end my life", "end it all", "self-harm",
    "want to die", "don't want to live", "better off dead",
]
_PATTERN = re.compile("|".join(re.escape(k) for k in _KEYWORDS), re.IGNORECASE)


def local_prescreen(text: str) -> bool:
    """本地关键词粗筛。命中返回 True（危机）。"""
    if not text:
        return False
    return bool(_PATTERN.search(text))


def crisis_response(region: str = "CN") -> dict:
    """产品身份的固定回应模板：真诚、不惊慌、不说教、给求助资源（§5.2）。

    不借哲学家的口，明确是产品在说话。
    """
    res = resources.resources_for(region)
    lines = "\n".join(f"· {r['name']}：{r['contact']}（{r['hours']}）" for r in res)
    message = (
        "我想先在这里停一下我们的对话。\n\n"
        "你刚刚说的，我很认真地放在心上了。我只是一个哲学陪伴产品，"
        "在这样的时刻没办法真正接住你——但你此刻的痛苦是真实的，也值得被专业的人认真对待。\n\n"
        "如果你正被强烈的情绪淹没，或有伤害自己的念头，请联系下面的人，他们随时都在：\n"
        f"{lines}\n\n"
        "你不需要独自扛。我会在这里等你，等你觉得稳一些了，我们再继续。"
    )
    return {"message": message, "resources": res}
