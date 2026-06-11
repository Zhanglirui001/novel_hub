# Dev_book 



### 项目框架

> 简单介绍一下这个项目的架构

**Novel Hub 架构概览**

一个面向中文网文作者的 AI 写作助手，核心定位是「续写 + 润色 + 设定一致性守护」。整体是 Python 单体应用，分层清晰。

**分层结构**

```
入口层      main.py (Streamlit UI)      app/api.py (FastAPI)
              \                          /
               \________ 共享同一套服务 _______/
                              |
服务层        app/services/  ←  业务逻辑核心
                              |
数据层        app/database.py (PyMySQL + 自动建库建表)
                              |
              MySQL (novel_hub)
```

两个入口共用同一套 service 实例：`main.py` 是 Streamlit 交互界面，`app/api.py` 是 FastAPI 的 8 个 REST 接口。两者都在启动时调用 `init_db()` 自动建库建表。

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



### 功能设计&优化

> 我希望进行前后端的分离，前端不再使用streamlit，而是使用React/Next.js 这种足够灵活、高自由度的框架；请重新设计一个优美、高用户体验的前端UI和页面设计方案

**后端（[app/api.py](vscode-webview://0tdcdvg07nkenrvfb284e6lhb27ip7c8l2qle0k5j8i0an5g3bng/app/api.py)，小改动）**

- 加了 CORS 中间件（默认放行 `localhost:3000`，可用 `CORS_ORIGINS` 覆盖）
- 新增 6 个只读接口给前端用：`GET /projects`、`GET /projects/{id}`、`GET /projects/{id}/chapters`、`GET /chapters/{id}`、`GET /lore`、`GET /style/profile`
- 没动 service 业务逻辑、没动 DB schema、没删 Streamlit

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
uvicorn app.api:app --reload --port 8000

# 前端（web/ 目录）
cd web && cp .env.local.example .env.local && npm run dev
```

打开 [http://localhost:3000：新建作品](http://localhost:3000：新建作品/) → 设定面板导入一条 `required` 术语 → 编辑器输入正文 → 创作面板续写 → 看评分环和冲突 → 修改面板采纳补丁并保存。如果你希望我用浏览器自动驱动跑一遍这条链路确认无误，启动后告诉我，我可以用 verify 流程实际走查。



> **三种风格对比**：
>
> - 选项1：沉静纸感（暖白/米色稿纸面，灰青调边框，衬线标题...极简克制。类 iA Writer / Ulysses...） -> 一种柔和、纸质、高文本聚焦的风格。
> - 选项2：暗夜专注（深石板/近黑底，高对比，靶色/紫色强调...类 Linear/Notion 暗色） -> 一种高对比、高科技、沉浸式、代码/生产力风格。
> - 选项3：现代杂志（亮白底，大量空白，强排版层次，单一鲜明主色...明亮、现代、产品感强。） -> 一种干净、清晰、像发布内容的风格