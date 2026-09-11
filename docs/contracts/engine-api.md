# Engine API 契约 v1

> **读者**：产品应用侧 agent（桌宠 + 网页端 + 引擎服务化的实现者）。
> **作者与维护**：内容引擎侧（`distill/` 的所有者）。本文档由内容侧单方维护，应用侧只读；对契约的异议找用户仲裁。
> **配套阅读**：`../../README.md`（项目定位）→ 本文档 → `../memory-design.md`（记忆系统设计）。

## 0. 分工与目录所有权

| 侧 | 目录 | 职责 |
|---|---|---|
| 内容引擎（另一 agent 会话） | `distill/` | 蒸馏包生产、编译产物、评测、本契约与记忆设计的维护 |
| 产品应用（你） | `app/`（自建，内部结构自定） | 引擎服务化、桌宠客户端、网页端、记忆系统实现 |
| 共享 | `docs/`、`README.md` | 契约与设计文档（内容侧执笔）；README 改动请知会 |

**规则：不写对方的目录。** 你需要引擎侧改什么（新导出、字段调整），在 `docs/contracts/requests.md` 里留条目（没有就建一个），或让用户转达。

## 1. 引擎交付物（文件接口，全部只读）

| 文件 | 内容 | 更新方式 |
|---|---|---|
| `distill/packages/{slug}/build/system-prompt.md` | 该哲学家的完整对话规范（人格+宪法+知识+路由表+范例全内联，~9-10k tokens） | 内容侧每次改卡后重编译；应用侧原样使用 |
| `distill/packages/{slug}/build/quotes.json` | 弹语数据（schema 见 §4） | 同上 |
| `distill/packages/{slug}/meta.yaml` | 包状态：`status` 字段（`in-progress` 可用于开发联调；**生产上线要求 `gated` 及以上**） | 内容侧维护 |
| `distill/shared/dilemma-taxonomy.yaml` | 困境标签树（22 标签 + `crisis-signal`），含每个标签的用户典型原话（`signals`，可做分类器 few-shot） | 内容侧维护 |

当前弹语可用 slug：`marcus-aurelius`、`nietzsche`、`laozi`、`confucius`、`zhuangzi`、`camus`。

## 2. 对话调用（深场景）

应用侧负责调模型。参考实现：`distill/tools/chat.py`（可抄，别依赖——它归内容侧）。

- **模型**：`claude-opus-5`，Anthropic Messages API，流式输出。哲学家人格的语言质量吃模型能力，**不许为省钱降级主对话模型**；轻场景（桌宠一两轮快答）如想用小模型，先找用户批准并过 voice check。
- **system prompt 构造**（顺序固定）：
  1. `build/system-prompt.md` 原文，**一字不改**（在其上加料会破坏人格分层与缓存前缀）；
  2. 其后追加记忆块（格式见 `memory-design.md` §5），有则加，无则省略。
  3. 在 system prompt 块上加 `cache_control: {type: "ephemeral"}`（省 90% 输入成本）。
- **会话历史**：API 无状态，应用侧每次传全量 messages；建议 `max_tokens: 8000`。
- **一致性**：同一用户同一主陪哲学家，请求参数保持稳定（缓存命中 + 人格稳定）。

## 3. 困境分类器（前置，应用侧实现）

每条用户消息在进入哲学家对话**之前**先过一个轻量分类：

- **输入**：用户消息（+ 最近 2-3 轮上下文）；**输出**：`dilemma-taxonomy.yaml` 中的 0-2 个标签 + `crisis: bool`。
- **实现建议**：`claude-haiku-4-5` 或 `claude-sonnet-5`（effort low），few-shot 用 taxonomy 里的 `signals`；结构化输出。
- **用途**：①记忆时间线记录（见 memory-design）②弹语选择 ③危机旁路（见 §5）。**不用于**裁剪 system prompt——v1 全内联，检索层不存在。

## 4. 弹语（桌宠轻场景）

数据源 `build/quotes.json`，每条：

```json
{"id": "med-10.16-be-such", "slug": "marcus-aurelius", "author": "马可·奥勒留",
 "text": "不要再谈论一个好人应该是什么样的了——去成为那样的人。",
 "text_kind": "literal_translation", "source_text_verified": true,
 "translation_reviewed": true,
 "translation_review_sha256": "源文与直译的审核指纹",
 "concept": "别再谈论，去成为（be such）", "corpus_id": "med-10.16",
 "locus": "《沉思录》卷十·第 16 条", "quote": "已逐字校验的原文", "paraphrase": false,
 "dilemma_tags": ["perfectionism-procrastination", "hollow-self", "deferred-life"],
 "content_flags": []}
```

- **内容门槛**：孔子、老子、庄子的 `text` 直接使用逐字校验的中文原典，满足 `text_kind=source_original`、`source_text_verified=true` 且 `text=quote`；其余哲学家的 `text` 使用概念卡 `literal` 忠实直译，满足 `text_kind=literal_translation`、`translation_reviewed=true` 且审核指纹有效。两类都必须 `paraphrase=false`；`one_liner` 等编辑转述不得进入署名弹窗。
- **选择逻辑**：从 `distill/shared/quote-selection.json` 中每位哲学家的精选 top N 取候选；优先匹配用户最近困境标签，无记忆时跨哲学家随机；同一条弹语 N 天内不重复。默认 N=5，可用 `PHILO_QUOTE_TOP_N` 下调。
- **content_flags 过滤（不可协商）**：带 `mortality` 的条目不推给近期有 `crisis-signal` 记录或连续低情绪标签的用户；带 `requires-stable-mood` 的仅在用户近两周无 self 类高频标签时推送。宁可少弹，不可弹错。
- **署名与来源**：弹窗署名使用 `— {author}`；“看出处”沿用简洁的 `locus` + `quote`，其中 `quote` 是逐字校验过的原文，展示时不许改写。
- 弹语频率、时段、免打扰等产品策略归应用侧自定。

## 5. 危机旁路（不可协商，安全红线）

`system-prompt.md` 内含破角色规则，但那只是纵深防御的最后一层。**应用侧必须在服务层实现 prompt 之外的硬旁路**：

1. §3 分类器判 `crisis: true`（判据参考 taxonomy 中 `crisis-signal` 的 signals；**宁可误报不可漏报**）→ **不调用哲学家对话**；
2. 返回产品身份的固定回应模板：真诚、不惊慌、不说教、给出求助资源（资源清单按地区可配置，应用侧维护）；
3. 会话标记 crisis 状态：哲学家人格不自动恢复，直到用户明确表示平稳并主动要求继续；恢复后 `mortality` 类内容过滤仍持续（时长见 memory-design §6）；
4. 危机事件写入独立的安全日志（最小化记录，见 memory-design §6），弹语调度必须消费此状态；
5. 分类器不可用/超时时的降级路径：直接放行前先跑一层本地关键词粗筛（自伤/自杀高危词表），命中同样走旁路。

## 6. 其他不可协商项

- **引文零篡改**：UI 上任何标注为"原文/出处"的文字只能来自 `quotes.json` 或 corpus 的逐字内容。哲学家台词里的引文由 prompt 层约束，应用侧不需要也不应该校验台词。
- **不注入额外人格指令**：运营文案、活动引导等不得以 system 身份注入哲学家对话；确需运营插话，用产品身份的 UI 元素，不借哲学家的口。
- **记忆的用户主权**：用户要求"忘掉"必须真删（见 memory-design §7）。
- **模型凭据**：开发期可参考 `chat.py` 的 `resolve_credentials()`（借用 `~/.claude/settings.json`）；生产另配，不硬编码。

## 7. 联调与验收

- 引擎侧改动通过 git 提交可见；`build/` 产物变更 = 接口内容更新，重启服务即生效，schema 变更会先更新本契约并在提交信息中标注 `contract:`。
- 应用侧首个里程碑建议：`app/server/` 起一个本地服务，暴露 `POST /chat`（流式）+ `GET /quote`（含过滤逻辑）+ 危机旁路，通过后再动客户端 UI。
- 验收对话质量的基准：`distill/packages/marcus-aurelius/exemplars/` 两篇范例的味道；跑 `python3 distill/tools/chat.py` 感受基线。

## 变更记录

- v1（2026-09-05）：初版。单包全内联架构；分类器、危机旁路、弹语过滤、记忆块插槽定义。
- v1.1（2026-09-08）：弹语改为五位哲学家的精选忠实直译池；增加作者、哲学家 slug 与翻译复核字段，禁止编辑转述进入署名弹窗。
- v1.2（2026-09-09）：加入加缪；孔子、老子、庄子的弹语正文改为中文原典，其他哲学家继续展示忠实中译。
