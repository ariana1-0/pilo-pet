# corpus/ 说明

- `meditations.jsonl`：《沉思录》全文语料，487 条，每行一个 JSON 对象：
  `{id, work, book, entry, locus, lang, source, text}`
  - `id` 形如 `med-5.1`（卷.条），是全部卡片引用的锚点
  - 文本为 George Long 英译（公版），来源 Project Gutenberg #15877
    https://www.gutenberg.org/ebooks/15877
  - 清洗规则见 `tools/parse_meditations.py`：脚注定义段落已剔除，行内 [A] 式脚注标记已去除
- `raw/pg15877.txt`：Gutenberg 原始文件，只读，勿改（它是引文校验的最终依据来源）
- 注意：Long 译本的分条与现代译本（如 Hays）个别地方不一致，引用条目号一律以本语料为准

## Gate A

所有卡片中的 `quote` 必须通过 `tools/verify_quotes.py` 逐字校验：

```bash
python3 tools/verify_quotes.py          # 报告
python3 tools/verify_quotes.py --fix    # 把"仅规范化匹配"的引文改写为语料逐字文本
python3 tools/verify_quotes.py --write  # 为逐字通过的引文置 verified: true
```

`verified: true` 只能由脚本写入，不许手工设置。
