# app/ —— 产品应用侧

philo-pet 的产品实现（引擎服务化、桌宠、网页端、记忆系统）。目录归应用 agent 所有；
只读 `distill/` 的编译产物，**不写 `distill/` 与 `docs/`**。接口契约见
[`../docs/contracts/engine-api.md`](../docs/contracts/engine-api.md)，记忆设计见
[`../docs/memory-design.md`](../docs/memory-design.md)。

## 里程碑 M1：本地引擎服务（`app/server/`）

契约 §7 的首个里程碑：起一个本地服务，暴露 `POST /chat`（流式）+ `GET /quote`
（含过滤）+ 危机旁路。跑通后再动客户端 UI。

### 跑法

在 **philo-pet 仓库根** 执行（作为 package 运行）：

```bash
python3 -m app.server.app          # 默认 127.0.0.1:8848
PHILO_PORT=9000 python3 -m app.server.app
```

- **模型接口**：智谱开放平台普通 API，使用 OpenAI 兼容的
  `https://open.bigmodel.cn/api/paas/v4/chat/completions`。
- **默认模型**：主对话 `glm-5.2`，困境分类 `glm-4.7-flash`。
- **零新增依赖**：API 客户端由 Python 标准库实现。
- **凭据**：复制配置模板并只在本机填 key；`.env.local` 已被 gitignore：

```bash
cp app/.env.example app/.env.local
chmod 600 app/.env.local
```

打开 `app/.env.local`，填写 `ZAI_API_KEY=` 后面的值。也可以直接用进程环境变量：

```bash
ZAI_API_KEY='你的普通 API key' python3 -m app.server.app
```

`ZAI_BASE_URL`、`PHILO_CHAT_MODEL`、`PHILO_CLASSIFIER_MODEL` 均可覆盖；
`PHILO_QUOTE_TOP_N` 控制每位哲学家进入弹语池的精选条数，默认 5；通常保留模板默认值即可。
- 本地状态落 `app/server/data/philo.db`（SQLite，已 gitignore）。

### 冒烟测试

```bash
bash app/server/smoke_test.sh            # 离线：/health、/quote、危机旁路
bash app/server/smoke_test.sh --online   # 追加正常 /chat（调智谱 GLM）
```

联调对话质量的基准：`python3 distill/tools/chat.py` 的味道 + `exemplars/` 两篇范例。

## 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 + 可用 slug + 模型名 |
| GET | `/quote?user_id&slug` | 忠实直译弹语；省略 `slug` 时从六位哲学家的精选 top N 中随机/按近期困境匹配；含内容过滤与 N 天去重。无合适条目时 `quote=null` |
| GET | `/concept?corpus_id&slug` | 从概念卡读取“说人话”层；纯本地、无需模型 API |
| POST | `/chat` | 流式对话（SSE）；前置分类器 → 危机旁路 or 哲学家对话 |
| POST | `/forget` | 用户主权：物理删除某 `user_id` 的全部记忆（记忆设计 §7） |

### `POST /chat` 请求体

```json
{ "user_id": "u1", "source": "web", "slug": "marcus-aurelius",
  "region": "CN", "messages": [{"role": "user", "content": "..."}] }
```

### `/chat` SSE 事件

| event | data | 时机 |
|---|---|---|
| `classify` | `{tags, crisis, degraded}` | 每次，最先 |
| `crisis` | `{message, resources}` | 命中危机旁路时（之后仅 `done`，**不调哲学家**） |
| `memory` | `{digest}` | 有记忆摘要时（联调可见，生产可关） |
| `delta` | `{text}` | 对话流式增量 |
| `done` | `{stop_reason, refusal?}` | 结束；危机旁路时 `stop_reason=crisis_bypass` |
| `error` | `{error}` | 流中异常 |

## Mac 桌宠（`app/desktop/`）

```bash
cd app/desktop
npm start
```

给其他电脑试用时，Render 部署、macOS/Windows 安装包和首次打开步骤见
[`PREVIEW-DEPLOY.md`](PREVIEW-DEPLOY.md)。

- 点击角色打开或关闭弹窗；点击弹窗主体换一条不同的弹语；按住角色约 0.26 秒后可拖动，松手自动保存位置。
- macOS 顶部 🏛 菜单可换弹语、换动作、选择小/标准/大三档整体尺寸及恢复默认位置。
- 无交互时每 20 秒在待机眨眼、看书、沉思、伸懒腰、观察左右、好奇和跳动等状态间切换。
- 弹窗在显示 1 分钟后自动收起；操作按钮位于纸片外，正文、作者和出处位于纸片内，长出处可在纸片内滚动。
- “说人话”读取本地 `/concept` 并压缩为最多两句短释义，无需模型 API；网页深聊需有效 API。

## 架构（`app/server/`）

```
config.py         路径 / 智谱地址 / 模型名 / 阈值
credentials.py    环境变量及 app/.env.local 凭据解析
bigmodel_client.py 智谱 OpenAI 兼容请求 + SSE 解析（stdlib）
engine.py         只读加载 system-prompt / quotes / taxonomy（含轻量 YAML 解析）
classifier.py     困境分类器（glm-4.7-flash）+ 本地危机关键词粗筛（双重判定）
crisis.py         危机旁路模板 + 高危词表（安全红线，prompt 之外的硬旁路）
resources.py      求助资源清单（按地区可配置）
memory.py         SQLite：困境时间线 + 危机日志 + 弹语去重（M1 范围）
chat_service.py   system 组装（产物+记忆块）+ 流式 + 记忆摘要
quote_service.py  弹语选择与内容过滤
app.py            HTTP 入口（stdlib，SSE），端点编排
```

### 契约遵循要点

- **主对话不降级**：`glm-5.2` 流式响应；记忆块追加在 system-prompt 原文之后，
  system-prompt 本身一字不改（契约 §2）。
- **危机旁路是服务层硬旁路**：分类器 `crisis` ∪ 本地关键词粗筛，任一命中即旁路；
  分类器不可用时降级为仅粗筛，宁可误报（契约 §5）。
- **弹语内容不可协商**：孔子、老子、庄子展示逐字校验的中文原典；其他哲学家展示概念卡中
  复核过的 `literal` 忠实直译。编辑转述不进入弹窗；
  `mortality` 对近期危机/低情绪用户不推，`requires-stable-mood` 仅在无 self 类高频时推；
  `quote`/`locus` 原文逐字不改写（契约 §4）。
- **需要引擎侧配合**的改动（新导出/字段）→ 记到 `docs/contracts/requests.md`，不写对方目录。

## 后续（未做）

- M2：记忆摘要注入 + 用户侧写 + 巩固任务；M3：透镜账本、成长记录 UI、删除/导出面板。
- 分类器/对话的鉴权、限流、多 slug、资源清单地区化。
