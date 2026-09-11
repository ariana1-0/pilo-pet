"""记忆存储（本地 SQLite，memory-design.md）。

M1 范围：困境时间线（§2.2）+ 危机日志（§2.5）+ 弹语去重记录。
用户侧写 / 透镜账本 / 巩固任务留待 M2/M3。
写入路径只在请求路径追加时间线一条（§3.1），其余离线。
"""
import json
import sqlite3
import threading
from datetime import datetime, timedelta, timezone

from . import config

_LOCAL = threading.local()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cutoff(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def _conn() -> sqlite3.Connection:
    c = getattr(_LOCAL, "conn", None)
    if c is None:
        config.DATA_DIR.mkdir(parents=True, exist_ok=True)
        c = sqlite3.connect(config.DATA_DIR / "philo.db")
        c.row_factory = sqlite3.Row
        _LOCAL.conn = c
    return c


def init_db() -> None:
    c = _conn()
    c.executescript(
        """
        CREATE TABLE IF NOT EXISTS timeline (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL, user_id TEXT NOT NULL,
            source TEXT NOT NULL, tags TEXT NOT NULL, note TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_timeline_user ON timeline(user_id, ts);
        CREATE TABLE IF NOT EXISTS crisis_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL, user_id TEXT NOT NULL, trigger TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_crisis_user ON crisis_log(user_id, ts);
        CREATE TABLE IF NOT EXISTS quote_shown (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT NOT NULL, user_id TEXT NOT NULL, quote_id TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_shown_user ON quote_shown(user_id, ts);
        """
    )
    c.commit()


# ── 写入路径 ────────────────────────────────────────────────
def append_timeline(user_id: str, source: str, tags: list, note: str = None) -> None:
    c = _conn()
    c.execute(
        "INSERT INTO timeline (ts, user_id, source, tags, note) VALUES (?,?,?,?,?)",
        (_now(), user_id, source, json.dumps(tags, ensure_ascii=False), note),
    )
    c.commit()


def log_crisis(user_id: str, trigger: str) -> None:
    """安全日志：只记发生过，不记用户说了什么（memory §2.5）。"""
    c = _conn()
    c.execute(
        "INSERT INTO crisis_log (ts, user_id, trigger) VALUES (?,?,?)",
        (_now(), user_id, trigger),
    )
    c.commit()


def mark_quote_shown(user_id: str, quote_id: str) -> None:
    c = _conn()
    c.execute(
        "INSERT INTO quote_shown (ts, user_id, quote_id) VALUES (?,?,?)",
        (_now(), user_id, quote_id),
    )
    c.commit()


# ── 读取路径 ────────────────────────────────────────────────
def had_crisis_since(user_id: str, days: int) -> bool:
    c = _conn()
    row = c.execute(
        "SELECT 1 FROM crisis_log WHERE user_id=? AND ts>=? LIMIT 1",
        (user_id, _cutoff(days)),
    ).fetchone()
    return row is not None


def recent_tag_freq(user_id: str, days: int) -> dict:
    """近 N 天困境标签频次（含 note 权重外的纯计数）。"""
    c = _conn()
    rows = c.execute(
        "SELECT tags FROM timeline WHERE user_id=? AND ts>=?",
        (user_id, _cutoff(days)),
    ).fetchall()
    freq: dict = {}
    for r in rows:
        for t in json.loads(r["tags"]):
            freq[t] = freq.get(t, 0) + 1
    return freq


def self_tag_majority(user_id: str, self_tag_ids: set, days: int) -> bool:
    """近 N 天 self 类标签是否占比过半（低情绪期判定，memory §6）。"""
    freq = recent_tag_freq(user_id, days)
    total = sum(freq.values())
    if total == 0:
        return False
    self_count = sum(v for k, v in freq.items() if k in self_tag_ids)
    return self_count / total > config.SELF_TAG_MAJORITY


def recently_shown_quote_ids(user_id: str, days: int) -> set:
    c = _conn()
    rows = c.execute(
        "SELECT DISTINCT quote_id FROM quote_shown WHERE user_id=? AND ts>=?",
        (user_id, _cutoff(days)),
    ).fetchall()
    return {r["quote_id"] for r in rows}


def last_shown_quote_id(user_id: str):
    """返回最近展示的一条弹语，用于换轮后避免连续重复。"""
    c = _conn()
    row = c.execute(
        "SELECT quote_id FROM quote_shown WHERE user_id=? ORDER BY id DESC LIMIT 1",
        (user_id,),
    ).fetchone()
    return row["quote_id"] if row else None


def forget_user(user_id: str) -> dict:
    """用户主权：物理删除（memory §7）。危机日志的保留 v1 先随删（§7 待拍板）。"""
    c = _conn()
    counts = {}
    for tbl in ("timeline", "quote_shown", "crisis_log"):
        cur = c.execute(f"DELETE FROM {tbl} WHERE user_id=?", (user_id,))
        counts[tbl] = cur.rowcount
    c.commit()
    return counts
