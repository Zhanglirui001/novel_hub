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