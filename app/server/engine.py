"""引擎产物加载：system-prompt / quotes / 困境标签树（全部只读，engine-api.md §1）。

taxonomy 是 YAML，但运行环境未装 pyyaml；这里针对该文件的规整结构写一个
轻量解析器，只取应用侧需要的字段（clusters / tags / signals）。内容侧若改动
结构会先更新契约，届时同步此解析器即可。
"""
import json
import re
from functools import lru_cache

from . import config


class Package:
    def __init__(self, slug: str, system_prompt: str, quotes: list):
        self.slug = slug
        self.system_prompt = system_prompt
        self.quotes = quotes


def load_package(slug: str) -> Package:
    paths = config.build_paths(slug)
    sp = paths["system_prompt"]
    q = paths["quotes"]
    if not sp.exists():
        raise FileNotFoundError(f"system-prompt 未编译：{sp}")
    # 把文件时间纳入缓存键。重新导出弹语后，长驻服务无需继续读取旧作者或旧出处。
    return _load_package_files(
        slug,
        sp.stat().st_mtime_ns,
        q.stat().st_mtime_ns if q.exists() else -1,
    )


@lru_cache(maxsize=32)
def _load_package_files(slug: str, _sp_mtime_ns: int, _q_mtime_ns: int) -> Package:
    paths = config.build_paths(slug)
    sp = paths["system_prompt"]
    q = paths["quotes"]
    system_prompt = sp.read_text(encoding="utf-8")
    quotes = json.loads(q.read_text(encoding="utf-8")) if q.exists() else []
    return Package(slug, system_prompt, quotes)


@lru_cache(maxsize=8)
def load_concept_plains(slug: str) -> dict:
    """从概念卡只读提取“说人话”段，不调用远程模型。"""
    concepts_dir = config.build_paths(slug)["concepts"]
    plains = {}
    if not concepts_dir.exists():
        return plains
    for path in concepts_dir.glob("*.md"):
        text = path.read_text(encoding="utf-8")
        corpus = re.search(r"(?m)^\s{2}corpus_id:\s*([^\n]+)$", text)
        plain = re.search(
            r"(?ms)^## 说人话（plain）\s*\n+(.*?)(?=^## |\Z)", text
        )
        if corpus and plain:
            plains[corpus.group(1).strip().strip('"\'')] = plain.group(1).strip()
    return plains


def concept_plain(slug: str, corpus_id: str) -> dict:
    """返回概念卡的本地 plain 层及对应弹语元数据。"""
    plain = load_concept_plains(slug).get(corpus_id)
    if plain is None:
        return None
    quote = next(
        (q for q in load_package(slug).quotes if q.get("corpus_id") == corpus_id),
        {},
    )
    return {
        "plain": plain,
        "concept": quote.get("concept"),
        "locus": quote.get("locus"),
        "quote": quote.get("quote"),
        "corpus_id": corpus_id,
    }


class Taxonomy:
    def __init__(self, clusters: dict, tags: list):
        self.clusters = clusters
        self.tags = tags
        self.tag_ids = [t["id"] for t in tags if t["id"] != "crisis-signal"]
        self.name_by_id = {t["id"]: t["name"] for t in tags}
        # self 类 = 低情绪标签，供 requires-stable-mood 判定（排除 crisis-signal）
        self.self_tag_ids = {
            t["id"] for t in tags
            if t.get("cluster") == "self" and t["id"] != "crisis-signal"
        }

    def few_shot_lines(self) -> str:
        """给分类器的标签清单 + few-shot 示例（用 taxonomy 的 signals）。"""
        out = []
        for t in self.tags:
            if t["id"] == "crisis-signal":
                continue
            eg = t["signals"][0] if t.get("signals") else ""
            line = f'- {t["id"]}（{t["name"]}）'
            if eg:
                line += f'  例："{eg}"'
            out.append(line)
        return "\n".join(out)


def _parse_taxonomy(text: str):
    clusters, tags = {}, []
    cur, section, in_signals = None, None, False
    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip() or line.strip().startswith("#"):
            continue
        if line == "clusters:":
            section = "clusters"
            continue
        if line == "tags:":
            section = "tags"
            continue
        if section == "clusters":
            m = re.match(r"^  ([\w-]+):\s*(.+)$", line)
            if m:
                clusters[m.group(1)] = m.group(2).strip()
            continue
        if section == "tags":
            m = re.match(r"^  - id:\s*(.+)$", line)
            if m:
                cur = {"id": m.group(1).strip(), "cluster": None,
                       "name": None, "signals": [], "note": None}
                tags.append(cur)
                in_signals = False
                continue
            if cur is None:
                continue
            if re.match(r"^    signals:\s*$", line):
                in_signals = True
                continue
            m = re.match(r"^    (cluster|name|note):\s*(.*)$", line)
            if m:
                cur[m.group(1)] = m.group(2).strip()
                in_signals = False
                continue
            if in_signals:
                m = re.match(r"^      -\s*(.+)$", line)
                if m:
                    cur["signals"].append(m.group(1).strip().strip('"').strip("'"))
    return clusters, tags


@lru_cache(maxsize=1)
def load_taxonomy() -> Taxonomy:
    text = config.TAXONOMY_PATH.read_text(encoding="utf-8")
    clusters, tags = _parse_taxonomy(text)
    return Taxonomy(clusters, tags)
