# Dev_book 



### 项目框架&优化

> 简单介绍一下这个项目的架构（第一版）

**Novel Hub 架构概览**

一个面向中文网文作者的 AI 写作助手，核心定位是「续写 + 润色 + 设定一致性守护」。整体是 Python 单体应用，分层清晰。

**分层结构**

```
入口层      web/ (Next.js)  ──REST──▶  app/api.py (FastAPI)
                                           |
服务层                               app/services/  ←  业务逻辑核心
                              |
数据层        app/database.py (PyMySQL + 自动建库建表)
                              |
              MySQL (novel_hub)
```

前端入口为 `web/` 下的 Next.js 应用，通过 REST API 调用 `app/api.py` 的 FastAPI 接口；业务逻辑集中在 `app/services/`，FastAPI 启动时调用 `init_db()` 自动建库建表。

**五个核心服务**

| 服务              | 文件                                                         | 职责                                                         |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| LoreService       | [lore_service.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/services/lore_service.py) | 设定中枢。导入角色/世界规则/术语/禁忌/时间线，`build_context()` 输出统一「设定上下文包」 |
| StyleService      | [style_service.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/services/style_service.py) | 文风指纹。从样本文本抽句长、高频词、叙事视角(POV)、节奏标签，存为 metrics |
| GenerationService | [generation_service.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/services/generation_service.py) | 编排核心。串联整条生成流水线                                 |
| ConsistencyGuard  | [consistency_guard.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/services/consistency_guard.py) | 守护器。规则检测禁忌词/必需术语缺失/年份倒序/OOC，打分 0-100 并给修复建议 |
| PatchService      | [patch_service.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/services/patch_service.py) | 基于 `difflib.SequenceMatcher` 做行级 diff，支持逐条采纳补丁 |

**核心流水线（GenerationService.run）**

这是整个系统的主干，体现了「多模型路由 + 守护器」设计：

```
载入设定+文风 → ModelRouter 路由 → Planner 规划 → Writer 生成
  → Guard 一致性检查 → (有问题则 repair + 复检) → Judge 审校
  → PatchService 生成差异补丁 → 落库 patch_set / issues / 日志
```

随后 `apply_patch_set()` 接收用户勾选的补丁 ID，应用后写入 `chapters`（带版本号递增），并往时间线追加一条「章节更新」事件，形成「生成→审校→采纳→落库」闭环。

**模型层的双客户端设计（[modeling.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/services/modeling.py)）**

这是架构里比较巧妙的一点：

- `ModelRouter` 按 任务类型/文本长度/预算/延迟 把任务路由到 planner/writer/judge 三个逻辑角色
- `build_model_client()` 根据有无 API Key 自动切换：
  - 有 Key → `QwenModelClient`（调阿里 DashScope 兼容接口）
  - 无 Key → `HeuristicModelClient`（纯规则桩，`is_stub=True`），让项目无需密钥也能跑通整个流程

**数据模型（9 张表）**

`projects`、`chapters`、`lore_items`、`character_cards`、`style_profiles`、`consistency_issues`、`patch_sets`、`model_run_logs`、`timeline_events`。

------

几点值得注意的观察（仅指出，未改动）：

- **凭证硬编码**：[config.py:43](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/config.py#L43) 的 MySQL 密码 `Zlr20010722!` 直接写进了默认值，已提交进 git。建议改为仅从环境变量读取，并清理历史。
- **连接模型**：每次 `get_conn()` 都新建一条 MySQL 连接，无连接池。原型够用，高并发下会成为瓶颈。
- **守护与修复偏弱**：`ConsistencyGuard` 是纯关键词/正则规则，`repair()` 目前只处理禁忌词替换，OOC、术语缺失等检出后并不自动修复——与 `novel_hub.md` 里「二次修正」的设想还有差距。

> 请再输出一下当前的项目架构（第二版）

**Novel Hub 项目框架**

**顶层结构(双栈:Python 后端 + Next.js 前端)**

```
novel_hub/
├── app/                      # Python 后端(FastAPI + 服务分层)
│   ├── api.py                # FastAPI 入口,所有 HTTP 路由
│   ├── config.py             # MySQL 连接配置(支持 env 覆盖)
│   ├── database.py           # 连接池 + 自动建库建表(9 张表)
│   ├── schemas.py            # Pydantic 请求体模型
│   └── services/             # 业务服务层
│       ├── lore_service.py          # 设定上下文包
│       ├── style_service.py         # 文风指纹
│       ├── generation_service.py    # 编排:Planner→Writer→Guard→Judge→Patch
│       ├── consistency_guard.py     # 一致性校验(规则式)
│       ├── patch_service.py         # 差异补丁生成/应用
│       └── modeling.py              # 模型路由 + Qwen/Stub 客户端
├── tests/test_core.py        # 核心逻辑单测(3 passed)
├── requirements.txt
└── web/                      # Next.js 前端(正式 UI)
    ├── app/
    │   ├── page.tsx                 # 首页/项目画廊
    │   └── projects/[id]/page.tsx   # 工作台路由
    └── components/
        ├── dashboard/        # 项目卡片、创建对话框、画廊
        ├── workspace/        # 编辑器核心(见下)
        └── ui/               # shadcn/ui 基础组件
```

**后端:请求流与分层**

整个系统是一个 **编排式管线**,核心在 `generation_service.py:run()`:

```
POST /draft/continue|polish
   │
   ├─ LoreService.build_context()      载入设定上下文包(世界观/术语/角色/禁忌/时间线)
   ├─ StyleService.get_latest_profile() 载入文风卡(top_words 等)
   ├─ ModelRouter.choose()             按 任务/长度/预算/延迟 选 3 个模型
   │
   ├─ [Planner] 解析任务(当前仅记日志)
   ├─ [Writer]  生成正文 ──── 真实走 Qwen / 无 key 时走 Heuristic stub
   ├─ [Guard]   guard.check() → 若有 issue → guard.repair() → 再 check()
   ├─ [Judge]   打分审校(当前仅记日志)
   │
   ├─ PatchService.create_patch()      生成 source→result 的差异补丁
   └─ 落库:patch_sets + consistency_issues + model_run_logs
        ↓
POST /patch/apply  逐条采纳 → 写 chapters(版本+1)+ timeline_events
```

**API 一览(api.py)**

| 方法     | 路径                                       | 作用                |
| -------- | ------------------------------------------ | ------------------- |
| POST/GET | `/projects` `/projects/{id}`               | 作品管理            |
| GET      | `/projects/{id}/chapters` `/chapters/{id}` | 章节读取            |
| POST/GET | `/lore/import` `/lore`                     | 设定导入 / 上下文包 |
| POST/GET | `/style/profile`                           | 文风画像            |
| POST     | `/draft/continue` `/draft/polish`          | 续写 / 润色         |
| POST     | `/consistency/check`                       | 一致性检测          |
| POST     | `/patch/apply`                             | 差异采纳落库        |
| GET      | `/timeline`                                | 事件时间线          |

**数据模型(MySQL,9 张表,启动自动建)**

`projects` → `chapters`(含 version) → 围绕 project_id 的:`lore_items`、`character_cards`、`style_profiles`、`consistency_issues`、`patch_sets`、`model_run_logs`、`timeline_events`。全部 utf8mb4,按 project_id 建索引。

**前端:工作台组件(web/components/workspace/)**

这是产品的核心交互面,对应"生成→审校→采纳→落库"闭环:

- `workspace-shell.tsx` + `workspace-context.tsx` — 布局骨架与状态
- `editor-pane.tsx` — 正文编辑器
- `chapter-rail.tsx` — 章节列表
- `generation-panel.tsx` — 续写/润色触发
- `consistency-panel.tsx` + `consistency-ring.tsx` + `issues-list.tsx` — 一致性评分环 + 问题列表
- `patch-review.tsx` — 差异逐条采纳
- `lore-panel.tsx` / `style-panel.tsx` / `timeline-panel.tsx` — 设定/文风/时间线
- `assistant-dock.tsx` — AI 助手停靠面板

**关键实现现状(对照上一轮分析)**

几个值得点出的事实,它们决定了你下一步该补什么:

1. **模型层是"双轨可切换"**:`build_model_client()` 检测到 `QWEN_API_KEY`/`DASHSCOPE_API_KEY`/`OPENAI_API_KEY` 就走真实 Qwen,否则用 `HeuristicModelClient` 跑规则桩。你 IDE 打开的 `web/.env.local` 应该就是在配这个。
2. **Planner / Judge 目前是"形式存在"**:[generation_service.py:38](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/services/generation_service.py#L38) 和 [:59](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/services/generation_service.py#L59) 只调用并写日志,返回值没有真正参与生成或决策。这正是上一轮说的"缺层级大纲、Judge 没做多视角投票"的代码层证据。
3. **ConsistencyGuard 是纯规则式**:[consistency_guard.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/services/consistency_guard.py) 只做关键词命中、术语缺失、`\d{4}年` 倒序、禁用词匹配。这是我上一轮强调的"符号校验"那一半——已经有了雏形,但没有 **结构化状态机**(人物生死/伤残/位置/持物的跨章追踪),也没有 LLM 语义 Judge 那一半。`repair()` 也只处理 taboo 一种。
4. **上下文是"顺序拼接 + 截断"**:`_compose_writer_prompt` 取 `world_rules[:5]`、`terms[:8]`,没有检索(RAG),没有滚动摘要。长篇一上量这里就是第一个瓶颈。



### 功能设计&优化

> 我希望进行前后端的分离，前端不再使用 Streamlit，而是使用 React/Next.js 这种足够灵活、高自由度的框架；请重新设计一个优美、高用户体验的前端 UI 和页面设计方案

**后端（[app/api.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/api.py)，小改动）**

- 加了 CORS 中间件（默认放行 `localhost:3000`，可用 `CORS_ORIGINS` 覆盖）
- 新增 6 个只读接口给前端用：`GET /projects`、`GET /projects/{id}`、`GET /projects/{id}/chapters`、`GET /chapters/{id}`、`GET /lore`、`GET /style/profile`
- 没动 service 业务逻辑、没动 DB schema；旧 Streamlit 入口已由 Next.js 前端替代并删除

**前端（新增 `web/` 目录，Next.js + shadcn/ui）**

- **仪表盘 `/`**：杂志封面式项目画廊，每个作品按名字生成稳定的渐变封面色 + 大号衬线首字；右上角新建作品对话框 + 明暗切换
- **工作台 `/projects/[id]`**：三栏沉浸式布局
  - 左：可折叠章节栏
  - 中：标题 + 限定阅读栏宽的正文编辑器（衬线、宽行距、字数/版本状态条），是视觉焦点
  - 右：6 个 Tab 助手面板——创作（续写/润色 + 预算/延迟 + 评分环 + AI 文本）、一致性（评分环 + 按 severity 着色的冲突列表）、修改（补丁逐条 diff 采纳 + 应用保存）、设定（查看/JSON 导入）、文风（画像 + 生成）、时间线
- 现代杂志风视觉：近纯白底、靛蓝单一主色、Noto Serif SC 标题 + Noto Sans SC 正文、大留白；全站明/暗主题

**验证情况**

- 前端 `npm run build` 完整通过（TypeScript 编译 + 3 条路由生成，无错误）
- 后端 AST 检查确认 14 条路由全部正确注册（含 6 个新接口）
- 注意：我修 api.py 时 Edit 工具注入了 UTF-8 BOM 导致 Python 报错，已清除并记入记忆，后续编辑该仓库 .py 文件会留意

**你需要做的**

后端依赖在当前环境没装、MySQL 也需本地运行，所以**端到端浏览器走查我没法在这里跑**。你本地启动后即可验证：

```bash
# 后端（仓库根目录，需 MySQL 运行；无需 LLM key，走离线生成）
python -m uvicorn app.api:app --reload --port 8000

# 前端（web/ 目录）
cd web && cp .env.local.example .env.local && npm run dev
```

打开 [http://localhost:3000：新建作品](http://localhost:3000：新建作品/) → 设定面板导入一条 `required` 术语 → 编辑器输入正文 → 创作面板续写 → 看评分环和冲突 → 修改面板采纳补丁并保存。如果你希望我用浏览器自动驱动跑一遍这条链路确认无误，启动后告诉我，我可以用 verify 流程实际走查。



> **三种风格对比**：
>
> - 选项1：沉静纸感（暖白/米色稿纸面，灰青调边框，衬线标题...极简克制。类 iA Writer / Ulysses...） -> 一种柔和、纸质、高文本聚焦的风格。
> - 选项2：暗夜专注（深石板/近黑底，高对比，靶色/紫色强调...类 Linear/Notion 暗色） -> 一种高对比、高科技、沉浸式、代码/生产力风格。
> - 选项3：现代杂志（亮白底，大量空白，强排版层次，单一鲜明主色...明亮、现代、产品感强。） -> 一种干净、清晰、像发布内容的风格



### 工程方案&创新

> 请问你觉得ai写长篇小说当前面临着那些问题，请分析并总结；并尝试给出一些技术上或者工程上的解决建议。

**一、根本性的难题:长程一致性 (Long-Range Coherence)**

这是长篇与短篇的本质分水岭。短篇靠模型的语言能力就能糊弄过去,长篇会暴露所有结构性缺陷。

**1. 上下文窗口 vs. 百万字体量的矛盾**

一部网文常态 100 万字以上,远超任何模型的有效上下文。即便是 1M token 窗口,把全文塞进去也会有两个问题:一是"中间遗忘"(lost in the middle),模型对长上下文中段的信息利用率显著下降;二是成本和延迟线性爆炸,日更场景根本扛不住。

工程对策:你架构里的 `Lore Service` 输出"设定上下文包"方向是对的,但要补三层结构:

- **分层记忆**:全局设定(永久) / 卷级摘要(中期) / 最近 N 章原文(短期)。生成时只注入相关切片,而不是全量。
- **检索增强 (RAG) 而非塞满**:把历史章节、设定条目向量化,生成第 K 章时按语义检索出最相关的 5-10 条事实,而不是顺序拼接。这能把上下文从"百万字"压到"几千字高相关内容"。
- **滚动摘要 (Rolling Summary)**:每写完一章自动生成结构化摘要(发生了什么事件、谁的状态变了、引入了什么新设定),作为下一章的输入。你计划里"通过后落库并更新时间线"已经踩到了这个点,关键是摘要要**结构化**(JSON 事件流),不能是自然语言段落,否则下游没法做精确校验。

**2. 设定漂移 / OOC / 时间线错乱**

模型是概率生成,没有"事实数据库"概念。它不知道"主角左手在第 3 章断了",到第 50 章又让他双手抱拳。人物性格也会随机漂移(怂包突然变莽夫)。

工程对策:这正是 `Consistency Guard` 的价值,但纯靠 LLM-as-Judge 召回率不稳定。建议**符号校验 + 语义校验双轨**:

- **结构化状态机**:把可枚举的硬事实建成显式状态——人物属性(生死/伤残/位置/持有物)、能力边界、物品归属、时间线节点。这些用规则引擎做硬校验,确定性强、零幻觉、近乎零成本。
- **LLM Judge 只管软冲突**:性格 OOC、动机不合理、语气不符,这类无法符号化的才交给 Judge 模型打分。
- 关键 insight:**不要让一个 LLM 同时检测所有冲突**。把"能用代码判定的"从"必须用语义判定的"里剥离出去,前者准确率 100%,后者集中算力反而更准。

**二、叙事结构与质量问题**

**3. 长程剧情规划缺失——"走一步看一步"**

模型默认是局部最优的续写器,缺乏全局叙事弧光。表现为:伏笔埋了不收、节奏失控(该高潮时平淡)、支线发散收不回、"注水"严重。

工程对策:你有 `Planner 模型`,但要让它在**两个尺度**上工作:

- **大纲先行 + 层级展开**:故事弧 → 卷大纲 → 章节 beat → 段落。生成具体文本前,先让 Planner 产出本章的 beat sheet(目标、冲突、转折、钩子),Writer 只负责把 beat 写成文字。这样剧情方向由规划层控制,而非随机游走。
- **伏笔/承诺追踪表**:维护一张"已埋设定/未兑现承诺"清单(谁立了 flag、什么悬念未解),作为 Planner 的输入约束,定期提醒"该收线了"。这能直接治"挖坑不填"。

**4. 文风扁平化与"AI 味"**

模型天然趋向高频、安全、平滑的表达,长篇里会产生强烈的同质化和塑料感:滥用排比、爱用"空气仿佛凝固了""嘴角勾起一抹弧度"这类套路句、情绪表达模板化。

工程对策:`Style Service` 抽风格指纹是对的,但句长/词频这类统计特征只能约束"形似"。补充:

- **少样本锚定**:生成时注入作者本人 2-3 段高质量原文作为 few-shot,比任何风格描述都有效。
- **负面清单 (anti-pattern list)**:维护一份"AI 味"黑名单短语/句式,在后处理或 Judge 阶段做惩罚。
- **风格相似度做成可量化指标**(你 Test Plan 里有这条,很好),但要注意:风格相似 ≠ 质量高,需要和"可读性/新鲜度"指标分开评估,否则会优化出"高度相似的平庸"。

**三、工程与系统层面的问题**

**5. 评估困难——"好不好看"无法自动化**

这是被严重低估的瓶颈。代码有单测,小说没有 ground truth。你没法自动判断"这章读起来爽不爽"。这导致迭代时无法快速判断改动是进步还是退步。

工程对策:

- **分解为可测维度**:一致性(可硬校验,客观)、风格相似度(可量化)、这两个先自动化。"精彩程度"用 LLM 打分+人工抽检,接受它是噪声指标。
- **建固定回归集**:你计划里"20+ 组冲突样本"是雏形。把它扩成一个**带标注的基准测试集**(已知冲突点、已知 OOC 点),每次改 prompt/换模型都跑一遍,看召回率有没有掉。这是工程上最值钱的资产。
- **记录 `ModelRunLog`**(你已经有了),把每次生成的输入/输出/采纳率存下来,采纳率本身就是最真实的线上质量信号。

**6. 误差累积 (Error Accumulation)**

长篇是自回归生成:第 K 章基于前面所有章。一旦早期产生一个小设定错误且未被发现,后续都会在错误基础上叠加,雪球越滚越大。

工程对策:

- **每章必过守护器,不可跳过**——错误必须在产生的当章拦截,这是为什么你"建议式编辑+逐条采纳"的设计很关键:人在环 (human-in-the-loop) 是误差累积最后的刹车。
- **设定快照与回滚**:`PatchSet` 可回滚的设计要延伸到"设定状态"层面——能回退到任意章节时的世界状态,出错时不用从头重来。

**7. 多模型路由的成本/质量/延迟三角**

Planner/Writer/Judge 全用顶配模型,日更成本扛不住;全用便宜模型,质量崩。

工程对策:你的路由维度(任务类型/长度/成本/延迟)是对的,补充原则:

- **Writer 用强模型,Judge 可以用中等模型但多次/多角度投票**(对抗式校验,让多个 judge 分别从"时间线/能力/性格"不同视角审,比单个全能 judge 更准)。
- **润色 vs 续写分级**:润色是约束性任务,可用更便宜的模型;续写是创造性任务,值得上强模型。
- 缓存设定上下文包(同一项目反复用),省掉重复的 token 成本。

**总结:问题的优先级排序**

如果让我给你这个项目排技术风险优先级:

| 优先级 | 问题                | 你架构的覆盖度         | 缺口                                           |
| ------ | ------------------- | ---------------------- | ---------------------------------------------- |
| P0     | 长程一致性/设定漂移 | Consistency Guard 已有 | 缺**符号状态机**,纯 LLM 判定召回不稳           |
| P0     | 长上下文 vs 体量    | Lore 上下文包有雏形    | 缺 **RAG 检索 + 结构化滚动摘要**               |
| P1     | 剧情规划/伏笔管理   | Planner 已有           | 缺 **层级大纲 + 承诺追踪表**                   |
| P1     | 评估自动化          | Test Plan 有方向       | 缺**带标注的回归基准集**                       |
| P2     | 文风扁平/AI味       | Style Service 已有     | 统计特征不够,需 **few-shot 锚定 + 反模式清单** |
| P2     | 成本/误差累积       | 路由+逐条采纳已有      | 设定快照回滚、judge 多视角投票                 |

**一句话核心判断**:AI 写长篇的最大瓶颈不是"写得好不好",现在的模型单段文字质量已经够用;真正的瓶颈是**状态管理 + 长程规划 + 可评估**这三件工程事。你的分层架构方向完全正确,接下来最该补的两块是——把一致性校验里"能符号化的硬事实"从 LLM 里剥出来做成确定性状态机,以及把上下文从"顺序拼接"升级成"检索 + 结构化摘要"。这两个是投入产出比最高的。

如果要把框架往上一轮的 P0 建议推进,最小改动点是:在 `consistency_guard` 旁加一个 `state_machine`(跨章硬事实表),以及把 `lore_service.build_context` 从"取前 N 条"换成"按当前文本检索。



> 你觉得什么是agent的架构？agent的架构有什么好处？

**一、什么是 Agent 架构**

核心区别在于**谁来决定下一步做什么**。

**非 Agent(你现在的系统):控制流写死在代码里。** 你的 `generation_service.run()` 是固定的:载入设定 → Planner → Writer → Guard → Judge → Patch。每一步、顺序、循环次数都是程序员预先决定的。LM 只是被调用的"函数",它不决定流程。

**Agent:控制流由模型自己决定。** 一个 agent 的最小定义是这个循环:

```
lop:
    观察当前状态/上下文
    LM 决策:我下一步该做什么?(调用哪个工具,还是已经完成)
    执行那个动作(调用工具)
    把结果喂回上下文
    直到 LM 判断任务完成
```

关键词是 LM **自己**在每一轮决定调用哪个工具、传什么参数、是否继续。这就是常说的 ReAct / tool-use loop。

一个完整的 agent 架构通常由四部分组成:

| 组件 | 作用 | 在你项目里的类比 | |---|---| | **LLM(大脑)** | 推理 + 决策下一步 | 你的 Writer/Judge,但现在不做决策 | | **Tools(工具)** | agent 能调用的能力 | 你的 `consistency_guard.check`、`lore_service.build_context`、DB 查询 | | **Memory(记忆)** | 短期上下文 + 长期检索 | 你的 MySQL + (还没做的)RAG | | **Loop / Planer(循环)** | 驱动"决策-执行-观察"反复进行 | 你目前是写死的单遍,没有循环 |

**二、Agent 架构有什么好处**

**1. 动态适应,而非穷举分支。** 管线式系统里,每种情况你都得写一个 `if`。比如"续写后发现时间线冲突 → 修一次 → 还冲突怎么办?"——你现在的代码只 repair 一次([generation_service.py:48](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/services/generation_service.py#L48)),写死了。Agent 可以自己判断"还有问题,再查一下设定,再改一遍",循环直到达标,不需要你预想所有分支。

**2. 工具组合的爆发力。** 给 agent 5 个工具,它能自己组合出几十种调用序列来解决你没预设过的问题。管线只能跑你写好的那一条路径。

**3. 把"流程设计"外包给模型。** 长篇小说这种任务,每章需要的动作不一样:有的章节要查 10 条设定,有的要重排时间线,有的只需润色。Agent 能按当前章节的实际需要决定调用什么,而你不用为每种章节写专门的处理逻辑。

**4. 可解释的中间步骤。** ReAct 式 agent 会显式输出"我现在要做 X,因为 Y",调试和人工干预的切入点更清晰。

**三、但Agent 不是银弹——对你的项目尤其重要**

这点我要直说,因为它直接影响你该不该把 Novel Hub 改成 agent:

**Agent 的代价是确定性和可控性。** 把控制流交给 LLM,意味着:

- **不可预测**:同样输入可能走不同路径,难复现、难测试。
- **成本和延迟失控**:agent 可能为一个简单任务自己绕 8 轮工具调用。
- **错误累积**:决策错一步,后面全偏——这对你"长篇误差累积"的痛点是雪上加霜。

**对长篇小说一致性这种场景,你恰恰需要确定性。** 一致性校验"能用代码判定的硬事实"(人物生死、年份顺序),用规则引擎 100% 准、零成本——这种地方**不该**交给 agent 去自由发挥。

**四、给你的实际建议:混合架构**

最务实的不是"全 agent"或"全管线",而是分层:

```
外层:固定管线(你现在的 run() 编排)— 保证流程可控、可测
   │
   └─ 内层某些节点:局部 agent 循环
        例如把 Writer 节点升级为一个小 agent:
        - 工具:查设定、查前文摘要、查人物状态、自检一致性
        - 循环:写一段 → 自检 → 不达标就查证据再改 → 达标才返回
        - 但循环上限写死(比如最多 3 轮),防止失控
```

也就是:**编排骨架保持确定性,只在真正需要"动态决策"的节点(比如 Writer 的"写-查-改"内循环、或 Judge 的多视角审校)引入有界的 agent 循环。**

具体到代码,你最该 agent 化的是现在那个写死的 repair 逻辑——把"check → repair → check一次就结束"改成"agent 带工具循环修复,直到达标或到上限"。这块要我帮你在 `generation_service` 里落一个有界 agent 循环吗?



### 框架搭建、核心功能开发

> 梳理一下inkos项目下的前端的功能点，梳理出来

| 能力                             | 入口                                          |
| :------------------------------- | :-------------------------------------------- |
| 长篇建书 / 多本管理              | Sidebar 创建栏 + 我的书架 + BookDetail        |
| 短篇 / 同人 / 番外 / 仿写 / 续写 | Create 网格 → Chat 草稿 / Import              |
| 开放世界 & 分支互动（Play）      | Create 网格 → Chat（带 HUD / 选项面板）       |
| 章节阅读 / 重写 / 审稿           | ChapterReader + BookSidebar                   |
| Truth/控制面文档编辑             | TruthFiles                                    |
| 多服务、多模型路由               | ServiceList / ServiceDetail / ProjectSettings |
| 守护进程、日志、Doctor 诊断      | Daemon / LogViewer / DoctorView               |
| 文风分析与导入                   | StyleManager                                  |
| 题材模板管理                     | GenreManager                                  |
| 数据分析                         | Analytics                                     |
| 平台趋势                         | RadarView                                     |
| 多语言（中 / EN）+ 主题切换      | Header                                        |
| 实时流式对话 + 工具执行可视化    | ChatPage + ai-elements                        |

如需我再深入某个模块（比如 Play 的状态机、ChatPage 的工具调用流、Service 配置流），告诉我重点就行。

> 参考一下inkos，在novel_hub 中集成前端配置大模型api的功能。

**最简集成方案（surgical）**：

1. 后端新增 `model_settings` 单表（一行配置），字段：`provider / base_url / api_key / writer_model / planner_model / judge_model / updated_at`。
2. 后端新增 `/settings/llm`（GET/PUT）和 `/settings/llm/test`（POST 探活）。
3. `modeling.build_model_client()` 优先读 DB 配置，DB 为空时回落到现有 env 路径，保持向后兼容。
4. 前端新增 `/settings` 页，仪表盘头部加「模型配置」入口。表单字段：Provider（目前只有 Qwen / OpenAI-compatible / Stub）、Base URL、API Key（保存时加密展示掩码）、三个模型名 + 测试连接按钮

**改动文件**

后端：

- `app/database.py` — 新建 `model_settings` 单行配置表
- `app/services/settings_service.py` — 读 / 写 / 测试连通性
- `app/services/modeling.py` — `build_model_client()` 优先 DB → 回落 env
- `app/services/generation_service.py` — `model_client` 改为 property，配置改完即时生效
- `app/schemas.py` — 新增 `LlmSettingsPayload`
- `app/api.py` — 新增 `GET / PUT /settings/llm`、`POST /settings/llm/test`

前端：

- `web/lib/types.ts` — `LlmSettings / LlmSettingsPayload / LlmTestResult`
- `web/lib/api.ts` — `getLlmSettings / updateLlmSettings / testLlmSettings`
- `web/lib/queries.ts` — 三个 react-query hook
- `web/app/settings/page.tsx` — 配置页（服务商、Base URL、API Key、三角色模型、测试连接）
- `web/app/page.tsx` — 仪表盘头部加齿轮入口

**关键设计点**

- **API Key 不回显原文**：`GET` 只返回掩码（如 `sk-***abcd`）；`PUT` 时 `api_key` 留空表示「保留 DB 中已存的值」
- **provider=stub 模式**：UI 自动禁用 Base URL / API Key / 测试连接，本地无 Key 也能跑
- **DB 未就绪时安静回落**：`modeling._load_db_settings()` try/except 兜底，不会让旧 env 部署崩
- **不引入多服务/多路由 UI**：保持 surgical，单组配置覆盖三个角色

> 似乎正文文本没有持久化存储，并且希望增加一个保存键和自动保存文本模式。

**后端**

- `app/schemas.py` — 新增 `ChapterSavePayload`
- `app/api.py` — 新增 `PUT /chapters`：传 `chapter_id` 走更新；不传则按 `(project_id, title)` 上插（找到→update + version+1；找不到→insert v1）

**前端**

- `web/lib/types.ts` — `ChapterSaveRequest / ChapterSaveResponse`
- `web/lib/api.ts` — `api.saveChapter`
- `web/lib/queries.ts` — `useSaveChapter`
- `web/components/workspace/workspace-context.tsx` — 保存状态机：`saveStatus / lastSavedAt / autosaveEnabled / saveNow`，5 秒去抖自动保存，`Ctrl/Cmd+S` 立即保存，`beforeunload` 拦截
- `web/components/workspace/editor-pane.tsx` — 标题栏加「自动保存」勾选 + 「保存」按钮；状态条显示 `已保存 / 未保存修改 / 保存中… / 保存失败` + 最近保存时间

**关键行为**

- **默认开自动保存**，输入停止 5 秒后落盘
- **Ctrl/Cmd+S** 立即保存，按钮在 dirty/error 时可点
- **空白稿不落盘**：避免 textarea 没动过就生成空章节
- **loadChapter 不会触发 dirty**：用 `skipDirtyRef` 跳过加载后第一次状态变更
- **未保存时关页面**会触发浏览器原生确认
- **章节列表自动刷新**：`useSaveChapter` 在成功后 invalidate `chapters` query



> 我希望增加一个选中一段文字，然后支持使用ai进行分析和人工输入批注后让ai给出修改的功能。这样修改会更有针对性。

后端

- `app/schemas.py` — 新增 `InlineAnalyzePayload` / `InlineRevisePayload`
- `app/api.py` — 新增 `POST /draft/analyze`、`POST /draft/revise`
- `app/services/generation_service.py` — 新增 `analyze_segment()` / `revise_segment()`，内置 stub 兜底（无 API key 也能跑）

前端

- `web/lib/types.ts` — `InlineAnalyze/Revise Request/Result` 四个类型
- `web/lib/api.ts` + `web/lib/queries.ts` — `analyzeSelection`、`reviseSelection` + 两个 hook
- `web/components/workspace/workspace-context.tsx` — `selection`、`setSelection`、`replaceRange`、`registerEditor`
- `web/components/workspace/editor-pane.tsx` — textarea ref + `onSelect/MouseUp/KeyUp` 同步选区，选中时浮出「AI 分析选段」按钮
- `web/components/workspace/inline-revise-panel.tsx` — 新建，三段式：选段快照 / AI 分析 / 我的批注 → 生成修改 → 采纳并替换
- `web/components/workspace/assistant-dock.tsx` — 新增「批注」Tab（7 列）

**用法**：编辑器选中一段 → 浮出按钮跳转「批注」Tab → 点「开始分析」拿到 AI 解读 → 在批注框写诉求（可空）→ 「按分析与批注生成修改」→ 满意点「采纳并替换选段」，光标会落在替换后末尾。前后各 300 字会作为上下文随选段一起送给模型，避免脱离场景。



> 左侧新增章节的功能似乎并不会在数据库中插入一条新的数据，也就说并没有新增新的一章；请检查一下

**修复要点**

`chapter-rail.tsx:27-46` — 点击「+」立即调 `PUT /chapters`（`chapter_id=null` + 空 content）真实写一行入库，再 `loadChapter` 进编辑器，并 invalidate `chapters` query 让侧栏自动刷新。

**两个隐藏问题一并修了**

1. **原来的「点 + 不入库」**：之前只是前端清空状态，依赖之后输入文字 + 5 秒去抖才落盘——不输字或快速切走就丢章。
2. **标题撞车覆盖旧章**：`saveNow` 走 `(project_id, title)` 上插。如果 `chapters.length+1` 算出的标题恰好等于已有章（删除过旧章后顺序错位），原逻辑会更新那条而不是新增。新逻辑会 `while (titles.has(...)) n++` 找出唯一的「第N章」。



> 为什么响应这么慢，点击新建章节很久后才在前端显示新创建的章节

之前流程：点击 → `PUT /chapters`（约几十到几百 ms，含 PyMySQL 新建连接）→ **invalidate 触发 `GET /chapters` 重拉** → 列表才更新。第二次往返完全没必要——服务器返回里已经有 `chapter_id / version / updated_at`，本地拼一行 `ChapterSummary` 写进 react-query 缓存就够了。

**改动**：`chapter-rail.tsx:46-58` 把 `invalidateQueries` 换成 `setQueryData`，列表立刻多出新章，不等第二次网络往返。

如果第一次请求本身也明显慢（>500ms），那是后端 config.py / database.py 每次 `get_conn()` 新建 MySQL 连接的老问题（架构文档里早标注过「无连接池」），这一处不是 UI 层能解决的。要不要我顺手把 `get_conn` 换成连接池？大概十来行改动，所有接口都会受益。

> 创建的章节能不能支持删除和改名？

后端

- `app/schemas.py` — `ChapterRenamePayload`
- `app/api.py` — `PATCH /chapters/{id}` 改 title、`DELETE /chapters/{id}` 删除一行（关联日志/补丁不删，保留追溯链路）

前端

- `web/lib/api.ts` + `web/lib/queries.ts` — `renameChapter` / `deleteChapter` + `useRenameChapter` / `useDeleteChapter`
- `web/components/workspace/chapter-rail.tsx` — 行内 hover 浮出铅笔/垃圾桶；都走乐观更新（先改本地缓存，失败回滚），列表无网络等待

**交互**

- 鼠标移到章节行 → 右侧浮出 ✏️ 🗑
- 改名走 `prompt`，删除走 `confirm`，避免引入 dialog 组件膨胀
- 改名命中当前打开的章节，会重新拉取并刷新编辑器标题
- 删除命中当前打开的章节，编辑器回到「新建草稿」态

简单做法是 prompt + confirm 而不是内联 input / shadcn dialog——交互闭环最短。要换成更精致的浮层告诉我。

> 能不能在项目目录下新建一个文件夹，作为正文的备份，使用.txt文件将每一章的文本保存下来，前端增加相应的ui，可以将当前章节备份，并且可以看到是否已经备份过，最新内容是否已经备份。

**目录与命名**

- 备份根：`<repo>/backups/`，可被 `BACKUP_DIR` 环境变量覆盖
- 文件路径：`backups/<project_id>__<project_name_safe>/<chapter_id>__<title_safe>.txt`
- 同名章节冲突天然不存在（按 chapter_id 去重）；项目名/标题里非 ascii/中文保留，剥掉 `\\/:*?"<>|` 这些 Windows 非法字符
- 加进 `.gitignore`，不入版本库

**"是否最新已备份" 怎么判定**

- 备份时把当前章节的 `version + content_hash`（sha1 短前缀）写入文件首行作为元数据

- 前端拿章节列表后，用一个新接口

  ```
  GET /chapters/{id}/backup
  ```

  询问后端：

  - `not_backed_up`：从未备份
  - `up_to_date`：当前 DB version 与备份元数据一致
  - `stale`：备份过，但章节有更新

- UI 用三种态分别显示：⚪ 未备份 / ✅ 已备份 / 🟡 已过期

**后端**

- `app/services/backup_service.py`（新）— `backup_chapter()` / `get_status()` / `read_backup()`
- `app/api.py` — `POST /chapters/{id}/backup`、`GET /chapters/{id}/backup`
- `app/schemas.py` — 不需要新 payload（路径参数即可）

**前端**

- `web/lib/api.ts` + `queries.ts` — `backupChapter` + `useBackupStatus(id)` + `useBackupChapter`
- `editor-pane.tsx` — 状态条加一个备份指示徽标 + 「备份此章」按钮（点了之后状态变成 ✅）
- 章节切换时自动查一次状态；保存成功后状态会自动变 stale（因为 version+1）



### Agent功能开发

> 该项目的核心模块应该是写小说的模块，希望采用langgraph的agent框架，识别用户对于下文内容的要求，结合上下文、设定、风格等信息，提供一段小说文本的预览，这样的需求结合当前项目你觉得如何设计交互、如设计agent的功能逻辑你觉得比较优秀，作为一个别出心裁的懂读者懂用户的优秀开发工程师以及设计师。

**一个前提判断：你现在的"agent"是装饰性的**

在 [generation_service.py:40-63](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/generation_service.py#L40-L63) 里，`planner` 和 `judge` 两次模型调用的**输出被直接丢弃了**——只写进了 `model_run_logs`，没有参与决策。真正干活的只有 `writer` + `ConsistencyGuard`（后者还是纯规则、非 LLM）。所以现在是"披着三模型外衣的单步生成 + 一次规则修复"。

这不是缺点，反而是好消息：**LangGraph 正好能把这套已经存在的骨架（planner→writer→judge→repair 循环）变成真实的、有状态的图**。你不是推倒重来，是把假节点做实。

------

**一、交互设计：预览应该是"就地生长的幽灵文本"，不是侧栏里的一坨结果**

用户说"识别用户对下文的要求"+"提供一段预览"。当前 [generation-panel.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/generation-panel.tsx) 的模式是：点"续写"→ 右栏弹出一整段结果 → 跳到 patch 面板逐条采纳。这套对**润色**很对（有原文可 diff），但对**续写**是别扭的——续写没有源文本可 diff，把新内容塞进侧栏也脱离了上下文语境。

我的主张是一条更懂写作者的动线，我叫它 **意图条 → 流式幽灵预览 → 就地落笔**：

1. **意图条**：光标停在正文末尾（或选区），正文里就地浮出一条细输入框。作者可以：

   - 留空 =「顺着往下写」
   - 用一句大白话说要求：`让男主这里先犹豫，再冷冷拒绝`
   - 或点快捷 chip：推进剧情 / 加段对话 / 环境铺陈 / 制造冲突 / 放慢节奏 / 回收伏笔

   这才是"识别用户对下文的要求"的入口——写作者脑子里的东西通常是**一个模糊的拉力**（"这里要有张力"），而不是"continue"这个动词。把它做成按钮就把用户的意图压扁了。

2. **幽灵预览**：生成的文本**直接以暗色斜体流式出现在光标后的正文里**（复用你 [editor-pane.tsx:150-160](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/editor-pane.tsx#L150-L160) 已有的"原地预览"渲染思路，把 `InlineDiffCard` 换成 ghost-text）。读者在真实语境里看它成形，而不是在一个脱离上下文的框里。

3. **轻 HUD**：流式时顶部一行极简状态——`已参考设定·3 · 命中文风锚点 · 一致性 92`。透明但不吵。你已经有 [consistency-ring.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/consistency-ring.tsx)，直接复用。

4. **落笔三选一**：`采纳(Tab)` / `微调(再说一句改)` / `换一版(Esc 循环候选)`。多候选做成轮播——**"懂读者"就是给选择、把摩擦降到最低**。采纳后才固化、autosave、写 timeline、更新风格样本。

一句话概括交互论点：**预览是"非破坏性、在语境内、流式、可对话微调"的一等公民**，而不是侧栏的只读输出。

------

**二、Agent 逻辑：一张真实的 LangGraph 状态图**

State（`TypedDict`）：光标上下文、结构化写作指令、候选列表、critique、一致性分数、修订计数。节点：

| 节点                | 职责                                                         | 替代现在的什么                                      |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| **intent 理解意图** | 把大白话要求 + 光标上下文，解析成结构化 `WritingDirective`（意图类型、目标节拍、情绪曲线、POV/时态锁、约需字数、must_include=术语/待回收伏笔、must_avoid=禁忌/OOC、承接锚点=刚发生了什么） | 现在被丢弃的 `planner`                              |
| **retrieve 取材**   | 按 directive **相关性挑选**上下文，而不是全量 dump。当前 [lore_service.build_context](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/lore_service.py#L68) 把所有设定全塞进 prompt，章节一多必然爆——这里加一层筛选/排序 | 现在 `_compose_writer_prompt` 的 `[:5]/[:8]` 硬截断 |
| **write 落笔**      | 按 directive + 文风卡 + 取材包**流式**产出候选               | 现有 `writer`                                       |
| **guard 守护**      | `ConsistencyGuard.check` → 结构化 issues + 分数（纯规则、便宜、非 LLM，很对） | 现有 guard                                          |
| **判定边**          | issues 存在且修订<N → 回 **write/repair**；否则 → done。**这个环是 LangGraph 相对手写代码最大的价值**：你现在 [generation_service.py:48-56](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/generation_service.py#L48-L56) 只硬编码修一次，图能让它成为有界、可配置的循环 | 现有一次性 repair                                   |
| **judge 品鉴**      | 真正评估"是否满足 directive、情绪是否兑现"，作为高预算下的 gate 或预览上的一行注解 | 现在被丢弃的 `judge`                                |

**人在环内（关键）**：在 write 之后用 LangGraph 的 `interrupt` **把图挂起**，流式把候选推给前端，等 `采纳/微调/换版`。用户点"微调"时，带着追加指令 `resume`——因为 checkpoint 里 directive 和取材包还在，**微调和换版都是廉价的、有状态的增量**，不必从 intent 重跑。thread_id 用章节 id。这正是 LangGraph checkpointer 的主场。

**流式**：LangGraph 的 `astream_events` 直接映射到你已有的 SSE 基建（[modeling.py:126 stream_chat](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/modeling.py#L126)）——节点切换事件 = HUD 的"思考轨迹"，token delta = 幽灵文本增量，走同一条 SSE 通道。

------

**三、两个"别出心裁"、真正懂读者的点**

1. **读者视角预检**：在 guard 旁加一个轻量 critique，回答的不是"设定对不对"，而是"**我是读者，读到这段想不想翻下一页**"——揪出平淡开头、张力掉线、信息倾倒。在预览上给一句读者反应：`读者感受：悬念拉满，但这段对话有点出戏`。这是通用 continue 给不了的东西。
2. **伏笔/承诺账本**：你已经有 `timeline_events`（[lore_service.py:49](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/lore_service.py#L49)）。把"对读者埋下的未回收承诺"也记进去，intent 节点在合适位置提示`此处可回收伏笔：X`。读者爽感的本质是"埋的坑被填了"——把这个显式追踪起来，是把写作助手和"文本补全器"拉开差距的地方。

------

**四、落地路径（不动你现有闭环，增量嵌入）**

- 依赖：`langgraph` + `langchain-core` 进 [requirements.txt](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/requirements.txt)。
- **不引入新 LLM 客户端**：写一个薄 adapter 节点，内部还是调你的 `QwenModelClient.generate/stream`，`ModelRouter` 继续为每个节点选模型。你的模型层不用改。
- 新建 `app/services/writing_graph.py` 编译图；`GenerationService.run` 变成"调用图 + 沿用现有 patch/save"。ConsistencyGuard 原样做成一个纯函数节点。
- 新端点 `POST /draft/continue/stream`（SSE），事件流：`directive → node 进度 → token delta → candidate 完成 → score/issues`。前端 [generation-panel.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/generation-panel.tsx) / [editor-pane.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/editor-pane.tsx) 消费它渲染幽灵预览。
- **Checkpointer**：MVP 先用 `MemorySaver`（按 thread 存内存），采纳结果仍落你现有的 `chapters/patch_sets` 表。要跨进程持久化再上自定义 MySQL saver（LangGraph 官方只带 Sqlite/Postgres saver，MySQL 需自写——所以 MVP 别急）。

------

**需要你拍板的两点**

1. **续写的采纳形态**：走我推荐的"幽灵文本就地采纳"，还是沿用你现有的 `patch_set` 逐条 diff？（我强烈建议续写用前者、润色保留后者——两种任务本质不同。）
2. **图是替换还是并存**：`GenerationService.run` 直接改造成图驱动，还是新增 `run_graph` 并存、灰度切换？

你要是认可这个方向，我可以进 plan 模式把 `writing_graph.py` 的节点签名、`WritingDirective` 的 schema、SSE 事件协议和前端幽灵预览组件的改动逐一列成可执行的实施计划。要我继续吗？

> 按照你的建议落地，不需要太保守，我需要极致的用户体验。

**Already in place (before this session)**

- **Backend agent** [app/services/writing_agent.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/writing_agent.py) — the full LangGraph state graph (`intent → retrieve → write → guard →[有界修订]→ repair → reader_lens`) with heuristic offline fallbacks.
- **SSE endpoint** `POST /draft/continue/stream` in [app/api.py:600](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/api.py#L600) + `ContinuePayload` in [app/schemas.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/schemas.py).
- **API client** `api.streamContinue()` and all TS types (`ContinueStreamEvent`, `GhostCandidate`, `GhostStages`, `WritingDirective`) in [web/lib/api.ts](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/api.ts) / [web/lib/types.ts](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/types.ts).

**What I completed — the frontend interaction**

1. **Workspace state slice** in [workspace-context.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/workspace-context.tsx) — ghost anchor/streaming/stages/candidates, `startGhost`/`runContinue`/`acceptGhost`/`cancelGhost`, the SSE event fold into HUD state, candidate carousel, and directive reuse so 微调/换一版 are cheap incremental calls. Ghost state is reset on chapter switch.
2. **New control surface** [continue-ghost-panel.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/continue-ghost-panel.tsx) — the 意图条 (free-text + 6 quick chips), the light HUD (`意图 · 已参考设定·N · 一致性 · 生成中`), the 读者感受 line, and 落笔三选一 (采纳 / 微调 / 换一版) with a `‹ x/n ›` candidate carousel.
3. **Inline ghost rendering** in [editor-pane.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/editor-pane.tsx) — streamed text renders as dark-italic ghost text *at the cursor inside the real body* (with a streaming caret ▍), plus `Tab`=采纳 / `Esc`=放弃 keybindings.

**Verified**

- `tsc --noEmit` clean; `langgraph` imports and the graph compiles; `WritingAgent` instantiates.
- **End-to-end offline run**: `intent → retrieve → 21×delta → guard → reader` fires correctly, and "加一段对话" parses to the `dialogue` intent — the whole loop works without a live model or DB.

**Two decisions — resolved by the existing scaffolding, not re-asked**

- **采纳形态**: ghost-text in-place accept (the endpoint returns `result_text` + `GhostCandidate`, not `patch_set`). Polish keeps its patch/diff flow untouched.
- **图替换 vs 并存**: coexist — this is a *new* `/draft/continue/stream` route alongside the existing `/draft/continue`.

**One honest gap**

Accept currently does **insert at anchor + autosave** (persists the chapter). The proposal's "写 timeline / 更新风格样本 on accept" needs backend hooks that aren't in the current diff — I didn't invent them. If you want that, the natural spot is a small server-side step on accept (or piggybacking on chapter save). Say the word and I'll wire it.

Nothing here is committed — all changes are in the working tree for you to review.

**已在本次会话前就绪**

- **后端 Agent**：[app/services/writing_agent.py](https://vscode-webview//0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/writing_agent.py) —— 完整的 LangGraph 状态图（`意图 → 检索 → 写作 → 护栏 →[有界修订]→ 修复 → 读者视角`），并配有启发式离线回退策略。
- **SSE 端点**：[app/api.py:600](https://vscode-webview//0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/api.py#L600) 中的 `POST /draft/continue/stream`，以及 [app/schemas.py](https://vscode-webview//0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/schemas.py) 中的 `ContinuePayload`。
- **API 客户端**：`api.streamContinue()` 以及 [web/lib/api.ts](https://vscode-webview//0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/api.ts) 和 [web/lib/types.ts](https://vscode-webview//0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/types.ts) 中的所有 TypeScript 类型（`ContinueStreamEvent`、`GhostCandidate`、`GhostStages`、`WritingDirective`）。

**我已完成的前端交互工作**

1. **[workspace-context.tsx](https://vscode-webview//0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/workspace-context.tsx) 中的工作区状态切片** —— 草稿锚点、流式状态、阶段、候选列表，以及 `startGhost`、`runContinue`、`acceptGhost`、`cancelGhost` 等方法；SSE 事件折叠至 HUD 状态、候选轮播、指令复用（使“微调/换一版”成为低成本增量调用）。切换章节时会重置草稿状态。
2. **新的控制面板**：[continue-ghost-panel.tsx](https://vscode-webview//0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/continue-ghost-panel.tsx) —— 意图输入条（自由文本 + 6 个快捷标签），轻量 HUD（`意图 · 已参考设定·N · 一致性 · 生成中`），读者感受行，以及“落笔三选一”（采纳 / 微调 / 换一版），并带有候选轮播指示器 `‹ x/n ›`。
3. **[editor-pane.tsx](https://vscode-webview//0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/editor-pane.tsx) 中的行内草稿渲染** —— 流式文本以深色斜体“草稿”样式显示在正文内光标位置（带有流式光标 ▍），同时支持键盘快捷键 `Tab`=采纳 / `Esc`=放弃。

**已验证**

- `tsc --noEmit` 检查通过；`langgraph` 导入和图编译均正常；`WritingAgent` 可实例化。
- **端到端离线运行**：`意图 → 检索 → 21 个增量片段 → 护栏 → 读者视角` 正确触发，且“加一段对话”能解析为 `dialogue` 意图 —— 整个流程在无真实模型或数据库的情况下也能正常工作。

**两个已由现有框架决定、无需再议的设计**

- **采纳形态**：直接采纳行内草稿文本（端点返回 `result_text` + `GhostCandidate`，而非 `patch_set`）。润色（Polish）功能保持不变，仍使用它自己的补丁/差异流程。
- **图替换 vs 并存**：两者共存——这是新增的 `/draft/continue/stream` 路由，与现有的 `/draft/continue` 并列。

**一处诚实说明的遗漏**

目前“采纳”仅做 **插入锚点 + 自动保存**（持久化章节）。提案中提到的“写 timeline / 更新风格样本 on accept”需要后端钩子，但这些不在当前修改范围内——我没有自行补造。如果你需要，自然的实现位置是在采纳时添加一个小型服务端步骤（或附着在章节保存上）。你说一声，我就去接上。

> timeline / 更新风格样本 on accept”需要后端钩子,前端样式也需要优化。你是一个专业的懂创作懂读者的作家兼ai应用开发工程师，要创新且将功能落地。

 **后端**

- **[app/database.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/database.py)**：新增 `style_samples` 表（`init_db` 幂等，老库自动补）。

- **[app/services/style_service.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/services/style_service.py)**：重构为**活画像·锚点加权**——

  - 抽出 `_compute_metrics`；`build_profile` 现在也把手输样本落库（`source='manual'`）。
  - 新增 `record_accepted_sample`：采纳文本入库→样本池 = 全部 manual 锚点 + 最近 20 条 accepted，manual 按需整体加权（≥ accepted 条数）防止文风漂向模型腔调→重算画像。碎样本（中文 <12 字）只入库不重算。
  - `get_latest_profile` 叠加 `accepted_count`。

- **[app/services/lore_service.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/services/lore_service.py)**：新增复用型 `add_timeline_event`。

- **[app/api.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/api.py)** + **[app/schemas.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/schemas.py)**：新端点 `POST /draft/continue/accept`，写「续写落笔」事件（描述含 **意图 · 一致性分 · 正文首句**），并触发风格回流。空文本 → 400。

  **前端**

  - **[web/lib/api.ts](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/lib/api.ts)** / **[web/lib/types.ts](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/lib/types.ts)**：`acceptContinue` + `ContinueAcceptResponse` + `accepted_count`。
  - **[workspace-context.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/workspace/workspace-context.tsx)**：`acceptGhost` 在插入+保存后 fire-and-forget 调钩子并失效 timeline/style 查询；失败静默，**不打断写作**。
  - **[timeline-panel.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/workspace/timeline-panel.tsx)**：按 `source` 分类着色——续写落笔(主色/Sparkles)、章节更新(绿/FileEdit)、设定导入(琥珀/BookOpen)，圆点带图标、英文串换成中文徽章。
  - **[style-panel.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/workspace/style-panel.tsx)**：露出「文风画像会从你采纳的续写中持续学习」提示 + 「采纳样本 · N 段」高亮卡片，让作者看见反馈闭环。

  验证结果：init_db 建表成功、时间线事件写入并回读、`accepted_count` 递增、画像随采纳演化、碎样本正确跳过重算、空文本 400。

  一个可选的后续增强（本次刻意没做，避免范围蔓延）：采纳样本目前用「条数窗口 + 锚点加权」，若日更量大、想更精细，可再加**相似度去重**或**时间衰减权重**。需要的话我可以接着做。

  ------

  小提示：本次编辑 `.py` 时 Edit 工具又触发了那个 UTF-8 BOM 问题（`lore_service.py`/`database.py` 被注入 BOM，已用 `py` 剥离并验证）。这条已在你的项目记忆里 [edit-tool-bom-gotcha.md](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/Users/LiruiZhang/.claude/projects/c--Data-code-novel-agent-novel-hub/memory/edit-tool-bom-gotcha.md)，符合预期

> 当前新开一个章节，但只有续写功能，新章节就不能参考一下故事线或者上章节的内容，从头开始写吗？

你的判断是对的——**目前新开的空章节确实无法续写**，而且不会参考前一章或故事线。

原因在于续写用到两类上下文：

1. `tail_text`（光标前的正文）

    

   — 只取

   当前打开的这一章

   的内容 (

   workspace-context.tsx:541-545

   )：

   

   ```ts
   const tail = draftRef.current.slice(0, anchor);
   if (!tail.trim()) {
     toast.error("光标前没有正文可续写");  // ← 空章节在这里被拦下
     return;
   }
   ```

2. **后端上下文** — `build_context()` 会取**角色卡、世界观设定、故事线（timeline_events）、伏笔**，加进写作提示里 ([writing_agent.py:124-146](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/writing_agent.py#L124-L146))。

**关键问题**：新章节 `tail_text` 为空 → 前端直接拦截，后端根本不会被调用。而且**没有任何逻辑去读取上一章的正文**，章节之间只靠 `project_id` + `sort_order` 排序，内容互不关联。故事线虽然后端一直在传，但它只是 `tail_text` 的「补充」，不是「替代」，所以空章节时用不上。

## 结论

「新章开头参考故事线/上章来起笔」——**当前实现做不到**。续写被设计成「已有正文的延续」专用。

## 可选的改法

1. **自动把上一章末尾灌入 `tail_text`** — 空章节时按 `sort_order` 取前一章末尾若干字作为种子，改动最小，效果是「自然承接上章」。
2. **新增「起笔」模式** — `tail_text` 为空也能生成章节开头，靠故事线＋伏笔＋角色。后端本身已容许空 `tail_text`，主要改前端拦截 + 提示词分支。
3. **两者结合** — 传上章末尾，同时按「新章开头」来生成，读感最自然（我推荐这个）。

你想往哪个方向做？定了我就出实现方案。

> 采用两者结合的方案落地吧，同时希望增加一个剧情讨论模式，可以在生成前将故事主线确认下来。然后依据确认好的故事主线作为推进情节发展的参考。

两个功能都已用真实数据库和真实 API 端到端验证通过。

**功能A：起笔模式（新章承接上一章）**

**后端**

- `ContinuePayload` 新增 `mode` / `mainline` 字段
- `writing_agent`：`WritingState`、`stream_continue`、提示词组装（`_compose_intent_prompt` / `_compose_write_messages` / `_heuristic_write`）都加了 `opening` 分支。起笔时改为「承接上一章结尾、避免复述」

**前端**

- 空章节时 `runContinue` 会**自动取上一章末尾（约1600字）**，以 `mode=opening` 生成（用章节缓存 + `getChapter`，按 `(group_title, sort_order, id)` 排序定位前一章）
- 续写面板的触发按钮在空章时文案切换为「起笔（承接上章）」

**功能B：剧情讨论模式 + 章节级主线（仅按需引用）**

**后端**

- 新增 `chapter_mainlines` 表、`MainlineService`（读/存/讨论流）、3 个端点
- 讨论时注入故事线、角色、术语、上一章结尾作为素材

**前端**

- 助手 Dock 新增「**剧情**」标签（`PlotDiscussionPanel`）：讨论 →「整理为主线」→ 编辑 →「确认主线」保存 →「据此起笔/续写」直接生成
- 续写面板新增「参考本章主线」开关（仅在该章有已确认主线时出现，默认开）
- **主线不进 `build_context`，只在生成时随请求显式传入** → 实现「仅按需引用」

**验证结果**

- `tsc --noEmit` 全项目无报错 ✅
- 真实数据库：`init_db`（建新表）✅、主线 PUT→GET ✅、讨论 SSE ✅、`mode=opening` 续写流（stage→delta→done，426 字，无错误）✅
- 测试数据已清理

> 右侧的功能栏中只有聊天支持全屏功能吗？其他功能也提供和聊天功能相同的全屏功能。另外能不能优化一下设定导入功能的ui；以及如何协调管理设定、灵感画板中的主线、全局主线、章节主线的提示词注入和结构管理（做到前端UI用户友好）

**1. 通用全屏（所有面板都能全屏）**

- 抽出共享注册表 [dock-tabs.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/dock-tabs.tsx)，dock 与全屏容器共用。
- context 里把 `chatFullscreenOpen` 泛化成 `fullscreenTab`（聊天成为它的一个特例，旧的 `setChatFullscreenOpen` 保留兼容）：[workspace-context.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/workspace-context.tsx)。
- [assistant-dock.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/assistant-dock.tsx) 顶部加了通用「全屏」按钮，对当前面板生效。
- [workspace-shell.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/workspace-shell.tsx) 的 Dialog 改为按 `fullscreenTab` 查表渲染任意面板，复用了原有的左缘拖拽调宽/双击复位逻辑。

**2. 设定导入 UI**

[lore-panel.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/lore-panel.tsx) 重写：**表单录入**（角色/世界规则/术语/禁忌/时间线，行式增删、术语可标「必检★」）+ **JSON 高级模式**（兼容旧用法、补上原先写死的时间线导入）+ **已有条目可删除**。配套后端新增删除端点与 id 返回：[lore_service.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/lore_service.py)、[api.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/api.py)、前端 [api.ts](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/api.ts)/[queries.ts](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/queries.ts)。

**3. 主线体系 + 分层注入协调**

- **数据/服务/API**：新增 `project_mainlines` 表 [database.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/database.py)，`get/save_global_mainline` + `get_global_summary` [mainline_service.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/mainline_service.py)，`GET/PUT /projects/{id}/mainline`。

- 分层注入

  （保留「主线不进 build_context」原则）：

  - 设定 = 常驻（不变）
  - 全书主线**摘要** = 常驻，可关。续写路径由端点取 summary 注入 [writing_agent.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/writing_agent.py)/[api.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/api.py)；改写/分析路径 [generation_service.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/generation_service.py)。顺序为「全书主线 → 本章主线」。
  - 本章主线 = 按需（不变）

- 前端 UI

  ：

  - [plot-discussion-panel.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/plot-discussion-panel.tsx) 顶部新增「全书主线」编辑区（大纲 + 常驻注入摘要），与下方「本章主线」形成全书→本章分层。
  - [continue-ghost-panel.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/continue-ghost-panel.tsx) 新增**注入状态面板**：设定（常驻只读）/ 全书主线摘要（开关）/ 本章主线（开关），一眼看清并控制这次续写喂了哪些层。
  - [inspiration-studio.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/inspiration/inspiration-studio.tsx) 选中卡片新增「发送到全书主线」，打通画板→主线。

**验证**

- 后端 `pytest`：**18 passed**（含新增 [test_mainline_injection.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/tests/test_mainline_injection.py) 3 项，覆盖分层注入顺序与开关）。
- 前端 `tsc --noEmit`：**无错误**。
- 一处环境限制：`next lint` 在本机 npm 下有个已知的参数 bug（把 `lint` 当目录），没能跑成 lint；类型检查已过，我也确认了改动文件无悬空导入。

一个我替你定的默认：全书主线摘要开关**默认开启**（符合你选的「常驻但摘要」）；用户可在续写面板随时关掉。若你想让它默认关、或把「发送到全书主线」也加一个「设为本章主线」的变体，我可以再补。

建议启动实机走查：`cd web && npm run dev`（README 用 3001 端口），逐个面板点全屏、试设定表单导入+删除、在剧情页存全书主线后开关注入开关续写。

> 能否在右侧功能栏中再加入一个故事线功能，效果为可编辑的流程图

**改动概览**

**后端（Python / FastAPI / MySQL）**

- [app/database.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/database.py) — `init_db()` 新增 3 张表：`storyline_graphs`（每项目一条，含视口+版本号乐观锁）、`storyline_nodes`（标题+简介+坐标）、`storyline_edges`。
- [app/schemas.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/schemas.py) — `StorylineNodePayload / StorylineEdgePayload / StorylineGraphPatchPayload`。
- [app/services/storyline_service.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/storyline_service.py) — 新服务：`get_or_create_graph`（首次访问自动建空图）、`patch_graph`（版本校验→整体 upsert+删除→版本自增）。
- [app/api.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/api.py) — `GET /projects/{id}/storyline`、`PATCH /projects/{id}/storyline/graph`（冲突返回 409）。

**前端（Next.js / React / React Flow）**

- [web/lib/types.ts](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/types.ts)、[web/lib/api.ts](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/api.ts)、[web/lib/queries.ts](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/queries.ts) — 类型 + `getStoryline/patchStorylineGraph` + `useStoryline/usePatchStorylineGraph`。
- [storyline-node.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/storyline-node.tsx) — 自定义节点，双击行内编辑标题/简介，四向连线柄。
- [storyline-canvas.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/storyline-canvas.tsx) — 以灵感画板 `board-canvas` 为蓝本裁剪：拖拽、连线、重连、删除、缩略图、「+ 新增情节」按钮。复用了现有 `.inspiration-board` 系列样式（零新增 CSS）。
- [storyline-panel.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/storyline-panel.tsx) — 面板容器，600ms 防抖保存、409 冲突自动重载、支持全屏。
- [dock-tabs.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/dock-tabs.tsx) — 注册「故事线」标签（`Waypoints` 图标），并给 `DockTab` 加了 `fullBleed` 标记。
- [workspace-shell.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/workspace-shell.tsx) — 全屏布局改用 `fullBleed`（原来硬编码只对聊天生效），让画布能铺满对话框。

**验证情况**

- `tsc --noEmit` 全项目通过（0 错误）。
- Python schema/service 导入与校验通过。
- 注：Next 16 已移除 `next lint`，故以 tsc 为类型闸门。

**还需你本地跑一遍确认运行时效果**（我无法启动你的 MySQL）：启动后端（会自动建出 `storyline_*` 三表）→ `cd web && npm run dev` → 打开作品，右侧 dock 点「故事线」→ 新增/编辑/连线/删除节点 → 刷新确认已落库 → 点全屏展开。

一个可选的小决策留给你：目前节点是「标题+简介」的纯情节节点（按之前确认）。如果之后想加节点配色/类型区分，扩展点已经预留好（节点组件与表结构都容易加字段）。



### skills开发



### 交互功能开发

> 当前的novel_hub仅仅支持亮、暗色；请支持纸张色等更多主题配置
>

**新增 3 套护眼主题** — [globals.css](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/app/globals.css)，每套都是完整的 token 集（背景/前景/卡片/语义色等）：

- **纸张**（`.sepia`）— 暖米黄底 + 棕墨字 + 赭石 accent，久读护眼
- **绿豆沙**（`.green`）— 柔和豆沙绿 + 深灰绿字
- **夜蓝**（`.night`）— 深空蓝低蓝光，比纯黑更柔和

**主题选择器** — 新建 [theme-picker.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/theme-picker.tsx) 替换原来的明暗切换按钮。下拉菜单带色板小圆点、图标、中文名与说明，当前项打勾；支持点击外部 / Esc 关闭。已替换 [page.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/app/page.tsx) 与 [workspace-shell.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/workspace/workspace-shell.tsx) 两处用法，删除了旧的 `theme-toggle.tsx`。

**注册主题** — [providers.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/providers.tsx) 的 `ThemeProvider` 加上 `themes={["light","dark","sepia","green","night"]}`。

**让既有组件跟随主题**：

- [sonner.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/ui/sonner.tsx) — toast 把自定义主题映射到对应明/暗基底（`night`→dark，其余→light）
- [editor-pane.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/workspace/editor-pane.tsx) — 保存状态色从硬编码的 `amber/emerald`（只有 `dark:` 变体、不会适配新主题）改为语义 token `text-warning`/`text-success`，现在所有主题下都正确

`npx tsc --noEmit` 通过，无类型错误。



> 选中、点评&ai修改功能能不能在原地产生修改预览，类似代码改动的预览效果，并且支持手动编辑，不放在右侧批注栏了，批注栏可以放其他版本的预览，点击会替换主预览

把「选中 → 点评 → AI 修改」从右侧批注栏搬到了正文里，做成代码改动风格的就地预览：

**新交互流程**

1. 在正文选中一段 → 编辑器底部浮出**内联浮层**（[inline-revise-overlay.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/workspace/inline-revise-overlay.tsx)）：AI 分析、写批注、`生成修改并就地预览` 都在这里，不再占右栏。
2. 生成后，正文中那一段**就地变成字符级 diff**（[inline-diff-card.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/workspace/inline-diff-card.tsx)）——红色删除线 / 绿色新增，前后文只读降透明度。
3. 卡片支持 `✎ 编辑` 切到文本框**手动微调**，diff 实时重算；`采纳并替换` 写回正文并定位光标，`放弃` 退出，`↻ 重新生成` 再出一个版本。
4. 右侧 `批注` tab 改名为 **`版本`**（[inline-revise-panel.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/workspace/inline-revise-panel.tsx)）：同一选区的多个候选以卡片列出，**点击任意卡即把它换成主预览**，可删除单个版本。

**支撑改动**

- [lib/diff.ts](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/lib/diff.ts)：新增 LCS 字符级 diff（`Array.from` 切分兼容中文）。
- [workspace-context.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/workspace/workspace-context.tsx)：新增 `reviseTarget` / `candidates` / `activeCandidateId` 状态与一组动作；换章自动 `clearRevise()`。候选 id 用单调递增 ref（规避环境禁用的 `Math.random`/`Date.now`）。
- 后端零改动——复用了已有的 `/draft/analyze`、`/draft/revise`。



> 请问左侧章节的格式能不能再加一层层级，请在前后端、包括表结构都做好适配；这样才可以适配长篇小说大量篇幅的管理。

已完成固定两层 `卷/分组 -> 章节` 适配。

- 后端：在 [app/database.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/database.py) 为 `chapters` 增加 `group_title/sort_order`、旧库自动迁移和索引。
- API：在 [app/api.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/api.py) 支持分组列表、保存、详情返回、移动章节到卷/分组。
- 补丁链路：在 [app/services/generation_service.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/generation_service.py) 改为优先按 `chapter_id` 应用，避免跨卷同名章节误写。
- 前端：在 [web/components/workspace/chapter-rail.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/chapter-rail.tsx) 改成卷标题 + 缩进章节，并加“新建卷/分组”“移动到分组”。
- 状态/API 类型：同步更新 [web/components/workspace/workspace-context.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/workspace-context.tsx)、[web/lib/types.ts](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/types.ts)、[web/lib/api.ts](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/api.ts)、[web/lib/queries.ts](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/queries.ts)、[web/components/workspace/patch-review.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/patch-review.tsx)。

> 我需要和ai进行交互的会话框，要求可以嵌入到侧面栏，也可以展开到全屏，请帮我设计一套交互ui方案，可以参考当下比较成熟的方案。

已按方案完成第一版 AI 会话框 UI 原型。

改动内容：

- 新增侧栏“聊天”tab：见 [assistant-dock.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/assistant-dock.tsx)
- 新增可复用聊天面板：见 [chat-panel.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/chat-panel.tsx)
- 聊天状态接入工作区上下文，侧栏和全屏共享同一份会话：见 [workspace-context.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/workspace-context.tsx)
- 新增全屏聊天弹层：见 [workspace-shell.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/workspace-shell.tsx)

目前功能包括：

- 右侧栏内嵌 AI 聊天
- 一键展开全屏
- 上下文 chips：章节、卷、正文长度、选中文字数
- 选中文本预览
- 快捷操作：
  - 续写下一段
  - 润色选中
  - 分析冲突
  - 检查设定
  - 改写方案
- 消息列表
- 输入框 Enter 发送，Shift + Enter 换行
- 原型 AI 回复，基于是否有选中文字给出不同反馈
- AI 消息操作：
  - 复制
  - 插入到正文末尾
  - 替换选中文字

验证结果：

- `npm run build` 通过。

- ```
  npm run lint
  ```

  未能正常运行，原因是当前 Next.js 16 下

  ```
  next lint
  ```

  被解析成了无效目录参数，报错为：

  - `Invalid project directory provided, no such directory: ...\web\lint`

说明：

- 这一版没有接真实 LLM 后端，也没有做流式输出或会话持久化。
- 当前是可交互 UI 原型，方便先体验侧栏/全屏/上下文/插入替换这些核心交互。

> 全屏模式似乎是一个弹窗，但弹窗能不能更大一些或者采取从右侧铺开到全屏的方式；并且希望可以创建新会话以及可以看到历史回话信息。

我这边把计划写好了，接下来等你确认后再开始动代码。当前方案是右侧抽屉式大面板 + 会话化聊天，不再维持单一弹窗式全屏。

我已经把实现方案整理好了，重点是两件事：

- 全屏聊天改成更大的右侧展开式面板，保留编辑器上下文；
- 聊天改成“会话化”，支持新建会话和查看历史会话。

计划文件在 `C:\Users\LXDN\.claude\plans\toasty-spinning-cloud.md`。你确认后，我就开始改 `web/components/workspace/workspace-shell.tsx`、`web/components/workspace/chat-panel.tsx`、`web/components/workspace/workspace-context.tsx` 这几处，并补上 `web/lib/api.ts` 和 `web/lib/queries.ts` 的会话数据层。

> 已继续执行并收口完成，现在前后端都通过验证。

完成内容：

- 后端新增聊天持久化：

  - `app/database.py` 增加 `chat_sessions`、`chat_messages` 表。

  - `app/services/chat_service.py` 增加会话创建、历史列表、消息列表、发送消息、清空会话逻辑。

  - ```
    app/api.py
    ```

    增加接口：

    - `GET /projects/{project_id}/chat-sessions`
    - `POST /chat-sessions`
    - `GET /chat-sessions/{session_id}/messages`
    - `POST /chat-sessions/{session_id}/messages`
    - `POST /chat-sessions/{session_id}/clear`

- 前端接入后端持久化：

  - `web/lib/types.ts` 增加聊天会话和消息类型。
  - `web/lib/api.ts` 增加聊天 API，并修复请求层类型。
  - `web/lib/queries.ts` 增加聊天 query/mutation hooks。
  - `web/components/workspace/workspace-context.tsx` 从本地 `localStorage` 会话切换为后端会话数据。
  - `web/components/workspace/chat-panel.tsx` 使用服务端会话摘要和消息列表渲染历史会话。

验证结果：

- 前端构建通过：`npm run build`
- 后端语法检查通过：`python -m py_compile app/api.py app/database.py app/schemas.py app/services/chat_service.py`

现在历史会话已经不是浏览器本地存储，而是按 `project_id` 存在后端数据库中。

> 请接入真实的api-key，实现真正的流式ai对话聊天

Done. Real streaming AI chat is now wired end-to-end and verified against the live DashScope API.

**What changed**

Backend:

- [modeling.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/modeling.py) — added `chat()` and `stream_chat()` to `QwenModelClient` (SSE parsing over `stream: true`), a stub fallback, and made `build_model_client()` carry the configured writer model as the chat model.
- [chat_service.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/chat_service.py) — replaced the canned `_assistant_reply` with `_build_llm_messages()` (system prompt + chapter/volume/selection context + recent history) and added `stream_message()` that yields `delta`/`done`/`error` events. User + assistant messages are persisted only after a successful generation, so a failed stream leaves nothing half-written and the user can retry. The old `send_message` now also calls the real model.
- [api.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/api.py) — new `POST /chat-sessions/{id}/messages/stream` returning a `StreamingResponse` (`text/event-stream`).

Frontend:

- [api.ts](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/api.ts) — `streamChatMessage()` reads the SSE body via `getReader()`, buffering on `\n\n` boundaries.
- [workspace-context.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/workspace-context.tsx) — `sendChatMessage` now streams: optimistic user bubble + live assistant bubble that fills token-by-token, then reconciles the React Query cache with the persisted messages on `done`.
- [chat-panel.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/chat-panel.tsx) — typing indicator, blinking cursor during generation, input/quick-actions/send disabled while streaming, autoscroll follows the stream.

**API key** — no new key was added. The app already picks up `QWEN_API_KEY` from [.env](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/.env) (or DB settings from the `/settings` page), and I confirmed it's live: the streaming test returned 6 real deltas from DashScope. The settings UI still lets you override provider/base-url/key/model at runtime.

**Verification**: `tsc --noEmit` passes clean; backend modules import and the stub + real streaming paths both work. I couldn't run a full DB-backed round-trip (no MySQL in this shell), but the persistence code reuses the existing, already-working insert path.

One note on security: the streaming endpoint is unauthenticated, same as every other route in this app — fine for local single-user dev, but you'd want auth before exposing it on a network.

> 签到功能改一下逻辑，已完成的任务可以打钩勾选已完成，未完成的勾选未完成；当全部都是已完成的签到和存在未完成的签到存在样式区别
>

**改动说明**

**签到门槛放宽**（[checkin_service.py](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/checkin_service.py) `check_in`）：

- 原来必须「完成今日全部待办」才能签到 → 现在**只要今天有待办（≥1 项）就能签到**，不管完成多少。任务本身的打钩/取消打钩（已完成↔未完成）沿用现有逻辑。

**新增「是否全部完成」标记**：

- `_summary` 返回 `all_completed`（`总数>0 且 已完成==总数`）和该日 `is_makeup`；`get_month` 的每天状态也带上 `all_completed`。类型同步到 [types.ts](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/lib/types.ts)。

**样式区分**（[daily-checkin.tsx](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/workspace/daily-checkin.tsx)）：

| 状态             | 日历格子                                 | 右侧面板                                                     |
| ---------------- | ---------------------------------------- | ------------------------------------------------------------ |
| 全部完成的签到   | 主题色底纹 + **主题色**对勾              | 主题色「当日已签到 · 全部完成」                              |
| 存在未完成的签到 | 琥珀色底纹 + **琥珀色**对勾              | 琥珀色「当日已签到 · 完成 X/Y 项」                           |
| 补签             | 右上角「补」小标签（颜色仍按完成度区分） | 「补签完成 · 完成 X/Y 项」                                   |
| 未签到（今天）   | —                                        | 按钮：全完成→「完成今日签到」；有未完成→「签到（还有 N 项未完成）」 |

顶部日历入口图标也按完成度着色（全完成=主题色，部分完成=琥珀色）。

一点说明：之前补签用的是「琥珀色对勾」来标识，现在琥珀色被用来表示「部分完成」，所以我把补签改成用右上角**「补」字小标签**单独标识，这样「是否补签」和「是否全部完成」两个维度互不干扰。如果你更想要别的配色（比如部分完成用灰色、补签保留琥珀），告诉我即可调整。





### 深度功能开发



> 关于灵感画廊的idea，我希望在该项目中集成灵感画廊，可以通过与ai对话讨论或者绘制添加关键信息树等方式，实现对小说剧情的灵活设计、灵感记录。希望支持将灵感画廊的内容保存为可编辑的内容卡片，也可以支持高自由度编辑的画板，AI agent深入介入其中，辅助灵感整理与讨论。

已集成项目级“灵感工作台”，入口位于作品工作区顶栏的“灵感”，路由为 `/projects/[id]/inspiration`。

主要内容：

- 后端新增灵感卡片、画板、节点、连线、AI 提案及画板聊天会话的数据表与项目隔离服务。
- 新增卡片 CRUD、画板 CRUD、带版本冲突保护的画板图保存、AI 提案创建/应用/驳回，以及板级流式讨论 API。
- 独立的 AI 讨论上下文会包含当前画板、选中节点、卡片摘要和关系图，不会影响原有章节聊天。
- 前端采用 `@xyflow/react` 实现无限画布、拖拽、连线、缩放、缩略图和画布视口持久化。
- 提供卡片画廊、搜索、卡片编辑、画板注释、选中卡片检查器、AI 讨论与“整理为提案”确认流程。
- 提案应用后才会创建 AI 卡片，避免模型直接改写作者的画板内容。

关键实现位置：

- [数据库与表初始化](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/database.py)
- [灵感领域服务](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/inspiration_service.py)
- [灵感 API 路由](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/api.py)
- [画板 AI 对话](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/app/services/chat_service.py)
- [灵感工作台](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/inspiration/inspiration-studio.tsx)
- [React Flow 画板](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/components/inspiration/board-canvas.tsx)
- [灵感页面路由](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/web/app/projects/[id]/inspiration/page.tsx)
- [灵感服务测试](vscode-webview://0o2v0j9483b43sgrl1f95ukeb06pt09fero2ea31bm8dggnmeu7p/tests/test_inspiration_service.py)

验证完成：

- `python -m compileall app` 通过。
- `PYTHONPATH=. python tests/test_core.py`
- `PYTHONPATH=. python tests/test_checkin_service.py`
- `PYTHONPATH=. python tests/test_inspiration_service.py`
- `web` 下 `npm run build` 通过，包含 `/projects/[id]/inspiration` 路由。
- API 的 OpenAPI 服务在 `http://127.0.0.1:8000/openapi.json` 返回 `200`。

> 是否能支持从左侧拖拽卡片到画板当中，同时支持更灵活的、更易触发的卡片之间的链接操作，优化一下交互，以及支持更方便直接的方式创建一个小的节点（比如只是某个事件或者某个角色名字的节点）

已落地。

- 左侧灵感卡片现在可直接拖到画板任意位置创建节点，原来的点击编辑仍保留。
- 节点连接改为四方向把手，并启用宽松连接模式，拖线更容易；前端和后端都会拒绝自连接。
- 画板工具栏新增“事件”“角色”“注释”快速节点。事件和角色是独立轻量节点，只保存名称和可选内容，不会创建完整灵感卡片。
- 扩展了图谱节点类型与服务端校验，数据库和现有图谱 PATCH 接口无需调整。
- 增加了轻量节点服务端校验测试。

验证通过：

```text
python -m unittest discover -s tests -p test_inspiration_service.py
6 tests OK

cd web && npm run build
Next.js build / TypeScript OK
```

> 你觉得灵感画板的交互，尤其是连接线的拖拽还有没有可优化的点？比如我节点连接线指向目标时的视觉效果可以更丝滑一些

而且当前实现的连接交互还比较接近 React Flow 默认状态。最影响“丝滑感”的点不是曲线类型本身，而是拖拽过程缺少连续、明确的反馈。

**当前状态**

- 拖拽预览线已经是 `SmoothStep`，但没有单独的拖拽样式，所以颜色、粗细和状态反馈基本走库默认值。
- 节点四个 Handle 都是同一种灰色小点，拖拽时用户不容易立刻识别“可连”“正在命中”“无效”。
- `ConnectionMode.Loose` 允许 source 连 source；但画面上的左右/上下 Handle 又在暗示方向性，这会让规则和视觉表达不一致。
- 边目前统一为固定青绿色、1.5px，且不带箭头、选中态、标签或可编辑关系类型。
- 前端保存图时会把后端已有的 `edge_type` 与 `style` 丢掉；这不只是体验问题，也会限制后续做“人物关系 / 因果 / 时间线”等不同连接表达。

**我建议优先做这四项**

1. **连接拖拽状态做成渐进反馈**

   - 起拖后，源 Handle 放大并显示主题色。
   - 靠近可连接节点时，目标节点描边淡入，目标 Handle 扩大并变为高亮色。
   - 命中有效 Handle 时，预览线加粗、颜色转为主题青绿；无效时转为低饱和红色或灰红色。
   - 鼠标离开目标后平滑恢复，不应突然跳变。

   这能直接解决“线指向目标时不够丝滑”的主观感受。实现上可用 `connectionLineStyle`、`onConnectStart/onConnectEnd` 加状态，以及 `.react-flow__handle.connecting/.valid/.invalid` 的 CSS 过渡。

2. **明确连接方向和视觉语言**

   - 若关系是有方向的，改为 `ConnectionMode.Strict`，只允许 source -> target。
   - 在已建立的线终点加小而克制的箭头；拖拽预览线也带箭头或末端发光点。
   - Source Handle 采用主题色描边，Target Handle 用中性底色，在悬停时才明显显示。

   对灵感画板而言，方向即使语义比较弱，也能让用户理解“我正从这个想法延展到另一个想法”。

3. **降低连接 Handle 的操作摩擦**

   - 视觉圆点保持克制，但把实际命中区域放大到约 `14-18px`，避免用户必须精确点中 6px 默认点。
   - 节点非悬停时弱化 Handle；节点悬停、选中或正处于连线模式时显现。
   - 靠近节点边缘时，可让对应的 Handle 先出现，让用户知道连接落点。

4. **让已建立连接有可读性**

   - 选中边时加粗并提高颜色对比度。
   - 支持双击边编辑关系标签，例如“导致”“冲突”“伏笔”“关联”。
   - 关系类型可映射为少量稳定视觉：因果用实线箭头、关联用细线、冲突用虚线。不要一开始做太多类型。
   - 支持拖动边的端点重新连接，减少“删线再重连”的成本。

我会先处理一个基础问题：在 [board-canvas.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/inspiration/board-canvas.tsx) 保存图数据时保留 `edge_type`、`label` 和 `style`。否则之后做出的边标签或颜色样式会在下次自动保存时被覆盖。

一个合适的最小迭代可以是：

1. 增加连接中的 Handle、节点、预览线状态和 CSS transition。
2. 将模式改为严格方向连接，并给连接增加轻量箭头与选中态。
3. 保留边的元数据，为下一步关系标签和样式扩展留出正确的数据通路。
4. 对重复连接做校验，防止出现多条无法区分的相同关系。

其中第 1、2 项会最直观地提升“指向目标时更丝滑”的感受；第 3 项是避免后续功能返工的必要修正。

> 不需要涉及数据库层面的任何调整吧，如果不需要那就那招你的方案尝试落地执行。

已完成，未涉及数据库、后端接口或共享类型调整。

画板连线现在具备：

- 严格的 `source -> target` 连接方向，禁止 source-to-source、target-to-target、自连接。
- 重复连接拦截，按节点和 Handle 组合判断。
- 更明显的拖拽反馈：起点与有效目标点放大、高亮，预览线加粗且圆角。
- 已创建边增加方向箭头；选中或键盘聚焦时线条加粗。
- 左/上为目标 Handle，右/下为源 Handle，并加上稳定 ID 与无障碍标签。
- 前端保存时保留已有 `edge_type`、`label`、`style`，并在 `style.flow` 保存连线 Handle，刷新后保持走线端点一致。

修改文件：

- [board-canvas.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/inspiration/board-canvas.tsx)
- [inspiration-card-node.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/inspiration/inspiration-card-node.tsx)
- [globals.css](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/app/globals.css)

验证：

- `npm run build` 通过，包含 Next 编译与 TypeScript 检查。
- `git diff --check` 通过。
- 已存在的开发服务响应正常：`http://localhost:3000`。
- `npm run lint` 未能运行，因为项目的 `next lint` 脚本与当前 Next.js 16 不兼容，它将 `lint` 解析成了目录参数；这与本次改动无关。

可在已有项目的灵感画板页面中，从节点右侧/下侧 Handle 拖到另一个节点左侧/上侧 Handle，观察目标高亮、平滑预览线和箭头边。

> 连接线不能删除和取消，也没办法修改连接的节点。

目前确认根因不在数据库层：

- 删除边的本地状态会更新，但当上一笔图保存请求仍在进行时，`InspirationStudio` 会直接丢弃新的完整画板快照；旧请求成功后又将旧图数据回灌，表现为边“无法删除”或重新出现。
- 端点拖动重连尚未接入 React Flow 的 `onReconnect`，所以当前没有修改连接节点的入口。
- 取消操作应保持无副作用：拖拽到空白处、无效 Handle、自连接或重复连接时，既不创建新边，也不改原边、更不会触发保存。

计划的实现保持前端范围：

1. 接入 `onReconnect`、`reconnectEdge`、`edgesReconnectable`，拖动边端点修改既有边而不更换 ID。
2. 将图保存改为“单请求串行 + 最新快照合并队列”，确保删除、重连、移动和视口变化不会在请求进行中被丢掉。
3. 保存失败或版本冲突时，放弃未确认本地快照并重新拉取服务端状态，避免错误合并。

不需要改 API、数据库、后端 schema 或边数据结构。

I hit an internal interruption while applying the planned lifecycle changes, so I have not made further source edits in this step beyond the prior connection-feedback work. The intended fix is clear: add React Flow endpoint reconnection and replace the parent’s dropped-save guard with an ordered snapshot queue; the current issue is not a database limitation.目前确认根因不在数据库层：

- 删除边的本地状态会更新，但当上一笔图保存请求仍在进行时，`InspirationStudio` 会直接丢弃新的完整画板快照；旧请求成功后又将旧图数据回灌，表现为边“无法删除”或重新出现。
- 端点拖动重连尚未接入 React Flow 的 `onReconnect`，所以当前没有修改连接节点的入口。
- 取消操作应保持无副作用：拖拽到空白处、无效 Handle、自连接或重复连接时，既不创建新边，也不改原边、更不会触发保存。

计划的实现保持前端范围：

1. 接入 `onReconnect`、`reconnectEdge`、`edgesReconnectable`，拖动边端点修改既有边而不更换 ID。
2. 将图保存改为“单请求串行 + 最新快照合并队列”，确保删除、重连、移动和视口变化不会在请求进行中被丢掉。
3. 保存失败或版本冲突时，放弃未确认本地快照并重新拉取服务端状态，避免错误合并。

不需要改 API、数据库、后端 schema 或边数据结构。

> 进行修改优化和落地

已修复 [board-canvas.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/inspiration/board-canvas.tsx)。

- 删除了重复渲染的两份 `EdgeToolbar`。
- 为 `EdgeToolbar` 提供了必需的 `x`、`y` 坐标，消除了 TypeScript 错误。
- 删除按钮现在只在选中连线时出现，并定位在该连线两端节点中心的中点，拖动节点后会跟随更新。
- 将按钮从 28px 提升到 36px，改为高对比度圆形按钮，加入 hover、focus、active 反馈，点击更容易。

`npm --prefix web run build` 已完整通过。

> 现在有一个问题，关于连接线的箭头方向不应该从开始拖拽的节点指向拖拽的终点节点吗？

已修复方向交互。

此前节点只有右/下能作为连线起点，左/上只能作为终点，因此用户会感觉方向不完全由拖拽决定。现在 [inspiration-card-node.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/inspiration/inspiration-card-node.tsx) 的四个边都支持发起和接收关系：

- 从任何一侧开始拖拽，该节点即为 `source`。
- 松开到的节点为 `target`。
- 箭头始终通过 `markerEnd` 显示在拖拽终点一侧。
- 重连时也会重新保留箭头、样式及当前的起终点手柄信息，见 [board-canvas.tsx](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/web/components/inspiration/board-canvas.tsx)。

`npm --prefix web run build` 已通过。
