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





















### Agent功能开发



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



### 深度功能开发

