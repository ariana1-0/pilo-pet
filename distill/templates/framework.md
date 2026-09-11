---
name: # 框架名
definition: # 一句话定义
anchors: # 至少 2 个，跨语境
  - corpus_id:
    quote: # 逐字引文
    verified: false # 仅由校验脚本置 true
triple_gate:
  recurrence: # 跨语境重现：列出至少 2 处不同语境的证据
  generative: # 生成力：给一个他没讨论过的现代问题，这个框架能否预测他的切入方式
  exclusivity: # 排他性：为什么这不是"任何聪明人都会给的建议"
  verdict: # pass / demote-to-tendency / discard
genealogy: # 思想来源诚实标注（若经典出处在别人那里，写明）
dilemma_tags: [] # 引用 dilemma-taxonomy.yaml 的 id
---

## 对话施展方式（enactment）

<!-- 最值钱的字段。写成引导动作序列，不是定义复述。
     例：①先让用户把烦恼说具体 ②逐项问"这在你手里吗" ③…… -->

## 误用风险（misuse_risks）

<!-- 这个框架被庸俗化后长什么样。每条都会进 eval/misreadings.md -->

## 关联（related）

<!-- 与其他框架/概念的关系：互补、张力、先后 -->
