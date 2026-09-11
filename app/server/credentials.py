"""智谱开放平台凭据解析。

优先读取进程环境变量；本地开发也可放在 ``app/.env.local``。该文件已被
gitignore，避免把密钥提交到仓库。
"""
import os
from pathlib import Path

_KEYS = ("ZAI_API_KEY", "ZAI_BASE_URL", "PHILO_CHAT_MODEL",
         "PHILO_CLASSIFIER_MODEL")
_LOCAL_ENV = Path(__file__).resolve().parents[1] / ".env.local"


def _unquote(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
        return value[1:-1]
    return value


def resolve_credentials() -> None:
    """加载本地配置；已经存在的进程环境变量优先。"""
    if not _LOCAL_ENV.exists():
        return
    for raw in _LOCAL_ENV.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key in _KEYS:
            os.environ.setdefault(key, _unquote(value))


def api_key() -> str:
    """返回普通 API 的 key；未配置时返回空串。"""
    return os.environ.get("ZAI_API_KEY", "").strip()
