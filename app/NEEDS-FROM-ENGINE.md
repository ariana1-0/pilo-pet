# NEEDS-FROM-ENGINE — 产品应用侧对引擎/内容侧的请求

> 边界约定：应用侧（`app/`）不改 `distill/` 和 `docs/`。这里记录应用侧希望引擎侧补的能力，作为联调沟通清单（替代 engine-api §0 里建议的 `docs/contracts/requests.md`，因为不能写 `docs/`）。

## 1. 概念卡「说人话」层（plain）—— 已完成

**场景**：桌宠弹语（`GET /quote`）和网页端都想给一个「说人话」按钮，把这条 quote 背后的概念用大白话讲两三句。

**完成方式**：应用引擎提供 `GET /concept?corpus_id=<id>&slug=<slug>`，只读提取对应概念卡的 `## 说人话（plain）` 段。桌宠直接读取该端点，不再调用远程模型。

**接口**：
```
GET /concept?corpus_id=<id>   →   { "concept": { "plain": "...", "concept": "...", "locus": "...", "quote": "..." } }
```

**契约要求**：`quote`/`locus` 仍逐字回传不改写（§4）；plain 层是额外释义，不替代原文。

---

_（后续新请求往下追加）_
