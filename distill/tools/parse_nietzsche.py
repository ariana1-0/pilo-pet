#!/usr/bin/env python3
"""Parse Gutenberg #1998 (Thus Spake Zarathustra, Thomas Common trans.) into corpus JSONL.

Entries: prologue sections tsz-0.N; chapters tsz-{part}.{n} (n = chapter index
within part). Text cleaning: lines joined per paragraph, paragraphs kept as \n\n.
"""
import json
import re
from pathlib import Path

RAW = Path(__file__).resolve().parents[1] / "packages/nietzsche/corpus/raw/pg1998.txt"
OUT = Path(__file__).resolve().parents[1] / "packages/nietzsche/corpus/zarathustra.jsonl"

TITLES_ZH = {
    "THE THREE METAMORPHOSES": "论三种变形", "THE ACADEMIC CHAIRS OF VIRTUE": "论道德的讲座",
    "BACKWORLDSMEN": "论彼岸世界论者", "THE DESPISERS OF THE BODY": "论蔑视身体者",
    "JOYS AND PASSIONS": "论快乐与热情", "THE PALE CRIMINAL": "论苍白的罪犯",
    "READING AND WRITING": "论读与写", "THE TREE ON THE HILL": "论山上的树",
    "THE PREACHERS OF DEATH": "论死亡的说教者", "WAR AND WARRIORS": "论战争与战士",
    "THE NEW IDOL": "论新偶像", "THE FLIES IN THE MARKET-PLACE": "论市场之蝇",
    "CHASTITY": "论贞洁", "THE FRIEND": "论朋友",
    "THE THOUSAND AND ONE GOALS": "论一千零一个目标", "NEIGHBOUR-LOVE": "论爱邻人",
    "THE WAY OF THE CREATING ONE": "论创造者之路", "OLD AND YOUNG WOMEN": "论老妇与少女",
    "THE BITE OF THE ADDER": "论毒蛇的咬啮", "CHILD AND MARRIAGE": "论孩子与婚姻",
    "VOLUNTARY DEATH": "论自愿的死", "THE BESTOWING VIRTUE": "论赠予的美德",
    "THE CHILD WITH THE MIRROR": "持镜的孩子", "IN THE HAPPY ISLES": "在幸福岛上",
    "THE PITIFUL": "论同情者", "THE PRIESTS": "论祭司", "THE VIRTUOUS": "论有德者",
    "THE RABBLE": "论贱众", "THE TARANTULAS": "论毒蜘蛛", "THE FAMOUS WISE ONES": "论著名的智者",
    "THE NIGHT-SONG": "夜歌", "THE DANCE-SONG": "舞歌", "THE GRAVE-SONG": "坟墓之歌",
    "SELF-SURPASSING": "论自我超越", "THE SUBLIME ONES": "论崇高者",
    "THE LAND OF CULTURE": "论文化之邦", "IMMACULATE PERCEPTION": "论无玷的认识",
    "SCHOLARS": "论学者", "POETS": "论诗人", "GREAT EVENTS": "论重大事件",
    "THE SOOTHSAYER": "预言者", "REDEMPTION": "论救赎", "MANLY PRUDENCE": "论人的聪明",
    "THE STILLEST HOUR": "最寂静的时刻", "THE WANDERER": "漫游者",
    "THE VISION AND THE ENIGMA": "幻影与谜", "INVOLUNTARY BLISS": "不情愿的幸福",
    "BEFORE SUNRISE": "日出之前", "THE BEDWARFING VIRTUE": "论使人渺小的美德",
    "ON THE OLIVE-MOUNT": "在橄榄山上", "ON PASSING-BY": "论走过去",
    "THE APOSTATES": "论背离者", "THE RETURN HOME": "归乡",
    "THE THREE EVIL THINGS": "论三件恶事", "THE SPIRIT OF GRAVITY": "论沉重的精神",
    "OLD AND NEW TABLES": "论新旧法版", "THE CONVALESCENT": "康复者",
    "THE GREAT LONGING": "大渴望", "THE SECOND DANCE-SONG": "第二支舞歌",
    "THE SEVEN SEALS": "七印", "THE HONEY SACRIFICE": "蜂蜜祭",
    "THE CRY OF DISTRESS": "求救的呼声", "TALK WITH THE KINGS": "与王者交谈",
    "THE LEECH": "水蛭", "THE MAGICIAN": "魔术师", "OUT OF SERVICE": "退职者",
    "THE UGLIEST MAN": "最丑陋的人", "THE VOLUNTARY BEGGAR": "自愿的乞丐",
    "THE SHADOW": "影子", "NOONTIDE": "正午", "THE GREETING": "欢迎",
    "THE SUPPER": "晚餐", "THE HIGHER MAN": "论更高的人",
    "THE SONG OF MELANCHOLY": "忧郁之歌", "SCIENCE": "论科学",
    "AMONG DAUGHTERS OF THE DESERT": "在沙漠的女儿们中间", "THE AWAKENING": "唤醒",
    "THE ASS-FESTIVAL": "驴节", "THE DRUNKEN SONG": "醉歌", "THE SIGN": "预兆",
}

CN_NUM = ["一", "二", "三", "四"]


def clean(lines):
    paras, cur = [], []
    for l in lines:
        if l.strip():
            cur.append(l.strip())
        elif cur:
            paras.append(" ".join(cur))
            cur = []
    if cur:
        paras.append(" ".join(cur))
    return "\n\n".join(re.sub(r"\s+", " ", p).strip() for p in paras).strip()


def main():
    lines = RAW.read_text(encoding="utf-8").splitlines()
    body_start = next(i for i, l in enumerate(lines)
                      if l.strip() == "FIRST PART. ZARATHUSTRA’S DISCOURSES.")
    body_end = next(i for i, l in enumerate(lines)
                    if i > body_start and l.strip() == "APPENDIX.")

    part_marks = {"FIRST PART. ZARATHUSTRA’S DISCOURSES.": 1,
                  "THUS SPAKE ZARATHUSTRA. SECOND PART.": 2,
                  "THIRD PART.": 3, "FOURTH AND LAST PART.": 4}

    entries = []
    part, ch_in_part = 0, 0
    # prologue handling
    in_prologue, pro_no, buf, cur_meta = False, 0, [], None

    def flush():
        nonlocal buf, cur_meta
        if cur_meta and buf:
            text = clean(buf)
            if text:
                cur_meta["text"] = text
                entries.append(cur_meta)
        buf, cur_meta = [], None

    for i in range(body_start, body_end):
        l = lines[i]
        s = l.strip()
        if s in part_marks:
            flush()
            part, ch_in_part, in_prologue = part_marks[s], 0, False
            continue
        if s == "ZARATHUSTRA’S PROLOGUE.":
            flush()
            in_prologue = True
            continue
        if in_prologue and re.fullmatch(r"(\d+)\.", s):
            flush()
            pro_no = int(s[:-1])
            cur_meta = {"id": f"tsz-0.{pro_no}", "work": "查拉图斯特拉如是说",
                        "book": 0, "entry": pro_no, "locus": f"序言·第 {pro_no} 节",
                        "lang": "en", "source": "Thomas Common 英译（公版，Project Gutenberg #1998）"}
            continue
        m = re.fullmatch(r"([IVXLC]+)\. ([A-Z][A-Z\-’, .]+)\.", s)
        if m and s.isupper():
            flush()
            in_prologue = False
            ch_in_part += 1
            title_en = m.group(2).strip().rstrip(".")
            zh = TITLES_ZH.get(title_en, title_en)
            cur_meta = {"id": f"tsz-{part}.{ch_in_part}", "work": "查拉图斯特拉如是说",
                        "book": part, "entry": ch_in_part,
                        "locus": f"第{CN_NUM[part-1]}部·{zh}",
                        "lang": "en", "source": "Thomas Common 英译（公版，Project Gutenberg #1998）"}
            continue
        if cur_meta is not None:
            buf.append(l)
    flush()

    with OUT.open("w", encoding="utf-8") as f:
        for e in entries:
            f.write(json.dumps(e, ensure_ascii=False) + "\n")
    per = {}
    for e in entries:
        per[e["book"]] = per.get(e["book"], 0) + 1
    print(f"total entries: {len(entries)}; per part: {dict(sorted(per.items()))}")


if __name__ == "__main__":
    main()
