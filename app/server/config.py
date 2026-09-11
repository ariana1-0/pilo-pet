"""集中配置：路径、智谱模型名、可调阈值。

app/ 归产品应用侧；只读 distill/ 的编译产物（engine-api.md §1）。
"""
import json
import os
from pathlib import Path

from . import credentials

# 先加载 app/.env.local，让下面的模型和地址也能在该文件中覆盖。
credentials.resolve_credentials()

# app/server/config.py → app/server → app → philo-pet
ROOT = Path(__file__).resolve().parents[2]
DISTILL = ROOT / "distill"
WEB_DIR = ROOT / "app" / "web"
_DEFAULT_DATA_DIR = (
    Path("/tmp/philo-pet-data")
    if os.environ.get("RENDER")
    else Path(__file__).resolve().parent / "data"
)
DATA_DIR = Path(os.environ.get("PHILO_DATA_DIR", _DEFAULT_DATA_DIR)).expanduser()

# 智谱开放平台普通 API（OpenAI 兼容协议）。
ZAI_BASE_URL = os.environ.get(
    "ZAI_BASE_URL", "https://open.bigmodel.cn/api/paas/v4"
).rstrip("/")
MODEL_CHAT = os.environ.get("PHILO_CHAT_MODEL", "glm-5.2")
MODEL_CLASSIFIER = os.environ.get("PHILO_CLASSIFIER_MODEL", "glm-4.7-flash")
# Short conversational turns do not need the provider's default reasoning pass.
# Keep the same main model and full philosopher packages; allow deliberate opt-in.
CHAT_THINKING = os.environ.get("PHILO_CHAT_THINKING", "disabled")
if CHAT_THINKING not in ("enabled", "disabled"):
    raise ValueError("PHILO_CHAT_THINKING must be enabled or disabled")
CHAT_MAX_TOKENS = 8000
CLASSIFIER_MAX_TOKENS = 256
CLASSIFIER_TIMEOUT_SECONDS = 12
CHAT_TIMEOUT_SECONDS = 45

DEFAULT_SLUG = "marcus-aurelius"

# 桌宠弹语只消费经过人工精选与直译复核的哲学家包。未传 slug 时在这些包中随机。
QUOTE_SELECTION_PATH = DISTILL / "shared" / "quote-selection.json"
_quote_selection = json.loads(QUOTE_SELECTION_PATH.read_text(encoding="utf-8"))
QUOTE_SLUGS = tuple(_quote_selection["packages"])
QUOTE_AUTHORS = {
    slug: spec["author"] for slug, spec in _quote_selection["packages"].items()
}
QUOTE_TOP_N = max(
    1,
    int(os.environ.get("PHILO_QUOTE_TOP_N", _quote_selection["default_top_n"])),
)

# 弹语去重与内容过滤窗口
QUOTE_NO_REPEAT_DAYS = 7          # 同一条弹语 N 天内不重复（§4）
CRISIS_MORTALITY_PAUSE_DAYS = 30  # 危机后 mortality 类暂停（memory §6）
STABLE_MOOD_WINDOW_DAYS = 14      # requires-stable-mood 判定窗口
SELF_TAG_MAJORITY = 0.5           # self 类标签占比过半 → 视为低情绪期

# 记忆摘要预算（memory-design §4）
MEMORY_DIGEST_MAX_CHARS = 1200    # ≈600 tokens 的粗保守上限


def build_paths(slug: str) -> dict:
    """某个哲学家蒸馏包的只读产物路径。"""
    package = DISTILL / "packages" / slug
    pkg = package / "build"
    return {
        "system_prompt": pkg / "system-prompt.md",
        "quotes": pkg / "quotes.json",
        "concepts": package / "concepts",
    }


TAXONOMY_PATH = DISTILL / "shared" / "dilemma-taxonomy.yaml"
