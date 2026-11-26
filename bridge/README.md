# bridge · 工作台 ⇄ novel_hub 同步桥

把「Content-Creation-Planet」工作区的 Markdown 沉淀（世界观/故事线/手稿/灵感）同步进
novel_hub（结构化 SQLite + Web 界面 + AI 生成/一致性守护），并支持把 novel_hub 采纳后的
正文回流到工作区。**工作区文件仍是权威源。**

## 快速开始

```powershell
# 1. 唤起 novel_hub（后端 8000 + 前端 3001）
powershell -File scripts/start_novel_hub.ps1

# 2. 检查状态
.venv\Scripts\python.exe -m bridge status

# 3. 推送：工作区 → novel_hub（幂等，按标题去重）
.venv\Scripts\python.exe -m bridge sync

# 4. 回流：novel_hub 章节 → 工作区 手稿/成品/
.venv\Scripts\python.exe -m bridge pull
```

## 数据映射（对齐《笔记规范》前缀）

| 工作区 | novel_hub | 前缀/规则 |
| --- | --- | --- |
| 项目《尚未兑现的明天》 | `POST /projects` | 目录名 / 世界观一句话概述 |
| 世界观「核心设定」`**键**：值` | world_rules | 自动解析 |
| 素材/世界观 `人·` | characters | `{name, profile}` |
| `地·` / `金·` / `疑·` | terms | 地点 / 金句 / 待定 |
| `线·`（伏笔） | timeline_events | `{label, description, source}` |
| 手稿/**/*.md | chapters | title=文件名，group_title=子目录名 |
| 灵感 `灵·` | inspiration cards | 灵感.md + 灵感池.md |
| 故事线.md | mainline | 全书主线 |
| `段·`（场景片段） | （暂跳过） | Phase 2 映射为章节 |

## 说明与限制

- **幂等**：`sync` 按 `(group_title, title)` 去重，已存在章节默认跳过；`--force` 才重新推送
  （会在 novel_hub 产生新版本）。
- **故事线图**（storyline graph，含版本冲突校验）未纳入 Phase 1，先以 mainline 承载。
- **文风画像**（style profile）Phase 1 未自动生成，后续可抽样手稿样本。

## MCP + CLI（覆盖全部主要操作）

`bridge/mcp_server.py`（基于官方 `mcp` SDK v2）把 novel_hub 的**几乎全部 REST 操作**暴露为
70 个 MCP 工具，DSH 经配置型 bundle（`.dsh/novelhub-mcp/`）以 stdio 连接，工具名 `mcp__novelhub__*`。

覆盖域：项目 / 章节（增删改移）/ 设定与时间线 / 全书与章节主线 / 故事线图 / 灵感卡片与看板（含图 CRUD）/
灵感提案（创建/应用/驳回）/ AI 续写·采纳·润色·分析·重写 / 一致性检测 / 补丁采纳 / 聊天 / 备份 / LLM 设置 / 文风 /
打卡·待办·每月固定待办 / 流式接口（讨论/聊天/续写，缓冲为完整结果）/ 同步回流。

```powershell
# 手测服务端（stdio 由 DSH 客户端拉起，日常无需手动跑）
.venv\Scripts\python.exe -m bridge.mcp_server

# CLI 通用调用任意端点（兜底，含流式在内的所有接口）
.venv\Scripts\python.exe -m bridge call GET "/projects"
.venv\Scripts\python.exe -m bridge call POST "/projects/4/inspiration/boards" "{\"title\":\"新画板\"}"
```

> 注意：官方 `mcp` SDK 需装入 venv（本 venv 无 pip，用 `uv pip install --python .venv\Scripts\python.exe mcp`）。
> 流式接口（SSE）已提供缓冲版 MCP 工具（`nh_inspiration_discussion` / `nh_chapter_mainline_discussion` / `nh_send_chat_message_stream` / `nh_continue_stream`），返回完整结果而非实时流；需要逐 token 展示时用前端或 CLI `call`。
