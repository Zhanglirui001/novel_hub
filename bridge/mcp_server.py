"""novel_hub 的 MCP stdio 服务端（基于官方 mcp SDK v2）。

把 novel_hub 的全部主要 REST 操作暴露为 MCP 工具，供 DSH 创作团队 agent 原生调用。
覆盖：项目 / 章节 / 设定 / 主线 / 故事线图 / 灵感卡片与看板 / AI 生成与审查 / 补丁 /
时间线 / 聊天 / 备份 / LLM 设置 / 文风 / 同步回流。复用 bridge/http.py + sync.py。

运行：<venv>/python -m bridge.mcp_server   （stdio）
"""
from __future__ import annotations

import json

from mcp.server.mcpserver import MCPServer

from . import http, sync

mcp = MCPServer(
    "novel_hub",
    version="0.3.0",
    instructions="novel_hub 创作工具桥：结构化展示与 AI 生成/一致性守护引擎。工作区 Markdown 沉淀与 novel_hub 双向同步；写作/研讨/审查角色可调用续写、润色、一致性检测、设定与章节读写、灵感看板与故事线图、聊天与备份等全部主要操作。",
)


def _j(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)


def _body(**kwargs) -> dict:
    """只保留非 None 字段，用于 PATCH/PUT 的部分更新。"""
    return {k: v for k, v in kwargs.items() if v is not None}


# ---- 编排 / 同步 -------------------------------------------------------------

@mcp.tool()
def nh_status() -> str:
    """检查 novel_hub 运行状态：SQLite/后端/前端可达性、项目数。"""
    return _j(sync.status())


@mcp.tool()
def nh_projects() -> str:
    """列出 novel_hub 中的全部项目。"""
    return _j(http.get("/projects"))


@mcp.tool()
def nh_create_project(name: str, description: str = "") -> str:
    """创建项目。"""
    return _j(http.post("/projects", {"name": name, "description": description}))


@mcp.tool()
def nh_get_project(project_id: int) -> str:
    """读取单个项目。"""
    return _j(http.get(f"/projects/{project_id}"))


@mcp.tool()
def nh_sync(force: bool = False) -> str:
    """把工作区 Markdown 沉淀同步进 novel_hub（幂等，按名称/标题去重）。force=true 时已存在章节也会重推。"""
    return _j(sync.push(force=force))


@mcp.tool()
def nh_pull() -> str:
    """把 novel_hub 中的章节回流到工作区 手稿/成品/。"""
    return _j(sync.pull())


# ---- 章节 -------------------------------------------------------------------

@mcp.tool()
def nh_list_chapters(project_id: int) -> str:
    """列出项目下的章节。"""
    return _j(http.get(f"/projects/{project_id}/chapters"))


@mcp.tool()
def nh_get_chapter(chapter_id: int) -> str:
    """读取章节正文。"""
    return _j(http.get(f"/chapters/{chapter_id}"))


@mcp.tool()
def nh_save_chapter(project_id: int, title: str, content: str, group_title: str = "默认卷", chapter_id: int | None = None) -> str:
    """保存/新建章节正文。chapter_id 省略则按 卷+标题 去重或新建。"""
    return _j(http.put("/chapters", {
        "project_id": project_id, "title": title, "content": content,
        "group_title": group_title, "chapter_id": chapter_id,
    }))


@mcp.tool()
def nh_rename_chapter(chapter_id: int, title: str) -> str:
    """重命名章节。"""
    return _j(http.patch(f"/chapters/{chapter_id}", {"title": title}))


@mcp.tool()
def nh_move_chapter(chapter_id: int, group_title: str, sort_order: int | None = None) -> str:
    """移动章节到指定卷/排序。"""
    return _j(http.patch(f"/chapters/{chapter_id}/placement", _body(group_title=group_title, sort_order=sort_order)))


# ---- 设定 / 时间线 -----------------------------------------------------------

@mcp.tool()
def nh_import_lore(project_id: int, characters: list | None = None, world_rules: list | None = None,
                   terms: list | None = None, taboos: list | None = None, timeline_events: list | None = None) -> str:
    """导入设定：characters/world_rules/terms/taboos/timeline_events 列表。"""
    return _j(http.post("/lore/import", {
        "project_id": project_id,
        "characters": characters or [],
        "world_rules": world_rules or [],
        "terms": terms or [],
        "taboos": taboos or [],
        "timeline_events": timeline_events or [],
    }))


@mcp.tool()
def nh_get_lore(project_id: int) -> str:
    """读取项目设定上下文（角色/世界规则/术语/禁忌/时间线）。"""
    return _j(http.get(f"/lore?project_id={project_id}"))


@mcp.tool()
def nh_delete_lore_item(project_id: int, item_id: int) -> str:
    """删除一条设定（世界规则/术语/禁忌）。"""
    return _j(http.delete(f"/projects/{project_id}/lore/items/{item_id}"))


@mcp.tool()
def nh_delete_character(project_id: int, character_id: int) -> str:
    """删除一张角色卡。"""
    return _j(http.delete(f"/projects/{project_id}/characters/{character_id}"))


@mcp.tool()
def nh_timeline(project_id: int) -> str:
    """读取项目事件时间线。"""
    return _j(http.get(f"/timeline?project_id={project_id}"))


# ---- 主线 / 故事线 -----------------------------------------------------------

@mcp.tool()
def nh_get_mainline(project_id: int) -> str:
    """读取全书主线。"""
    return _j(http.get(f"/projects/{project_id}/mainline"))


@mcp.tool()
def nh_save_mainline(project_id: int, content: str = "", summary: str = "") -> str:
    """保存全书主线。"""
    return _j(http.put(f"/projects/{project_id}/mainline", {"content": content, "summary": summary}))


@mcp.tool()
def nh_get_chapter_mainline(chapter_id: int) -> str:
    """读取章节主线。"""
    return _j(http.get(f"/chapters/{chapter_id}/mainline"))


@mcp.tool()
def nh_save_chapter_mainline(project_id: int, chapter_id: int, content: str = "") -> str:
    """保存章节主线。"""
    return _j(http.put(f"/chapters/{chapter_id}/mainline", {"project_id": project_id, "content": content}))


@mcp.tool()
def nh_get_storyline(project_id: int) -> str:
    """读取项目故事线图（节点/边）。"""
    return _j(http.get(f"/projects/{project_id}/storyline"))


@mcp.tool()
def nh_patch_storyline_graph(project_id: int, expected_graph_version: int, nodes: list | None = None,
                             edges: list | None = None, deleted_node_ids: list | None = None,
                             deleted_edge_ids: list | None = None, viewport: dict | None = None) -> str:
    """更新故事线图（节点/边/删除/视口）。"""
    return _j(http.patch(f"/projects/{project_id}/storyline/graph", {
        "expected_graph_version": expected_graph_version,
        "viewport": viewport or {},
        "nodes": nodes or [],
        "deleted_node_ids": deleted_node_ids or [],
        "edges": edges or [],
        "deleted_edge_ids": deleted_edge_ids or [],
    }))


# ---- 灵感卡片 ---------------------------------------------------------------

@mcp.tool()
def nh_list_inspiration_cards(project_id: int, search: str = "", card_type: str = "") -> str:
    """列出项目灵感卡片（可按搜索/类型过滤）。"""
    return _j(http.get(f"/projects/{project_id}/inspiration/cards?search={search}&card_type={card_type}"))


@mcp.tool()
def nh_create_inspiration_card(project_id: int, title: str, content: str = "",
                               card_type: str = "idea", tags: list | None = None, color: str = "amber") -> str:
    """创建灵感卡片。"""
    return _j(http.post(f"/projects/{project_id}/inspiration/cards", {
        "card_type": card_type, "title": title, "content": content,
        "tags": tags or [], "color": color,
    }))


@mcp.tool()
def nh_update_inspiration_card(project_id: int, card_id: int, card_type: str | None = None,
                               title: str | None = None, content: str | None = None,
                               tags: list | None = None, color: str | None = None) -> str:
    """更新灵感卡片（只改传入字段）。"""
    return _j(http.patch(f"/projects/{project_id}/inspiration/cards/{card_id}",
                         _body(card_type=card_type, title=title, content=content, tags=tags, color=color)))


@mcp.tool()
def nh_delete_inspiration_card(project_id: int, card_id: int) -> str:
    """删除灵感卡片。"""
    return _j(http.delete(f"/projects/{project_id}/inspiration/cards/{card_id}"))


# ---- 灵感看板 ---------------------------------------------------------------

@mcp.tool()
def nh_list_inspiration_boards(project_id: int) -> str:
    """列出项目灵感看板。"""
    return _j(http.get(f"/projects/{project_id}/inspiration/boards"))


@mcp.tool()
def nh_create_inspiration_board(project_id: int, title: str, description: str = "") -> str:
    """创建灵感看板。"""
    return _j(http.post(f"/projects/{project_id}/inspiration/boards", {"title": title, "description": description}))


@mcp.tool()
def nh_get_inspiration_board(project_id: int, board_id: int) -> str:
    """读取灵感看板（含图结构：节点/边）。"""
    return _j(http.get(f"/projects/{project_id}/inspiration/boards/{board_id}"))


@mcp.tool()
def nh_update_inspiration_board(project_id: int, board_id: int, title: str | None = None,
                                description: str | None = None) -> str:
    """更新灵感看板（只改传入字段）。"""
    return _j(http.patch(f"/projects/{project_id}/inspiration/boards/{board_id}",
                         _body(title=title, description=description)))


@mcp.tool()
def nh_delete_inspiration_board(project_id: int, board_id: int) -> str:
    """删除灵感看板。"""
    return _j(http.delete(f"/projects/{project_id}/inspiration/boards/{board_id}"))


@mcp.tool()
def nh_patch_inspiration_graph(project_id: int, board_id: int, expected_graph_version: int,
                               nodes: list | None = None, edges: list | None = None,
                               deleted_node_ids: list | None = None, deleted_edge_ids: list | None = None,
                               viewport: dict | None = None) -> str:
    """更新灵感看板图（节点/边/删除/视口）。"""
    return _j(http.patch(f"/projects/{project_id}/inspiration/boards/{board_id}/graph", {
        "expected_graph_version": expected_graph_version,
        "viewport": viewport or {},
        "nodes": nodes or [],
        "deleted_node_ids": deleted_node_ids or [],
        "edges": edges or [],
        "deleted_edge_ids": deleted_edge_ids or [],
    }))


# ---- AI 生成 / 审查 / 补丁 ---------------------------------------------------

@mcp.tool()
def nh_continue(project_id: int, input_text: str, chapter_title: str = "未命名章节",
                budget: str = "medium", target_latency_ms: int = 6000) -> str:
    """AI 续写（生成候选文本）。"""
    return _j(http.post("/draft/continue", {
        "project_id": project_id, "chapter_title": chapter_title, "input_text": input_text,
        "budget": budget, "target_latency_ms": target_latency_ms,
    }))


@mcp.tool()
def nh_continue_accept(project_id: int, accepted_text: str, chapter_title: str = "未命名章节",
                       directive: dict | None = None, consistency_score: int | None = None) -> str:
    """采纳一段续写：写时间线事件并回流风格样本。"""
    return _j(http.post("/draft/continue/accept", {
        "project_id": project_id, "chapter_title": chapter_title, "accepted_text": accepted_text,
        "directive": directive or {}, "consistency_score": consistency_score,
    }))


@mcp.tool()
def nh_polish(project_id: int, input_text: str, chapter_title: str = "未命名章节",
              budget: str = "medium", target_latency_ms: int = 6000) -> str:
    """AI 润色文本。"""
    return _j(http.post("/draft/polish", {
        "project_id": project_id, "chapter_title": chapter_title, "input_text": input_text,
        "budget": budget, "target_latency_ms": target_latency_ms,
    }))


@mcp.tool()
def nh_consistency_check(project_id: int, text: str) -> str:
    """一致性检测：对照设定，找出冲突/OOC/时间线错误并给修复建议。"""
    return _j(http.post("/consistency/check", {"project_id": project_id, "text": text}))


@mcp.tool()
def nh_analyze(project_id: int, selection: str, prefix: str = "", suffix: str = "",
               chapter_title: str = "未命名章节") -> str:
    """选段 AI 分析（带前后文）。"""
    return _j(http.post("/draft/analyze", {
        "project_id": project_id, "selection": selection, "prefix": prefix,
        "suffix": suffix, "chapter_title": chapter_title,
    }))


@mcp.tool()
def nh_revise(project_id: int, selection: str, annotation: str = "", analysis: str = "",
              prefix: str = "", suffix: str = "", chapter_title: str = "未命名章节") -> str:
    """结合批注的选段重写。"""
    return _j(http.post("/draft/revise", {
        "project_id": project_id, "selection": selection, "annotation": annotation,
        "analysis": analysis, "prefix": prefix, "suffix": suffix, "chapter_title": chapter_title,
        "budget": "medium", "target_latency_ms": 6000,
    }))


@mcp.tool()
def nh_apply_patch(patch_set_id: int, accepted_ids: list | None = None,
                   chapter_title: str = "未命名章节", chapter_id: int | None = None,
                   group_title: str = "默认卷") -> str:
    """应用选中的差异补丁。"""
    return _j(http.post("/patch/apply", {
        "patch_set_id": patch_set_id, "accepted_ids": accepted_ids or [],
        "chapter_title": chapter_title, "chapter_id": chapter_id, "group_title": group_title,
    }))


# ---- 聊天 -------------------------------------------------------------------

@mcp.tool()
def nh_list_chat_sessions(project_id: int) -> str:
    """列出项目聊天会话。"""
    return _j(http.get(f"/projects/{project_id}/chat-sessions"))


@mcp.tool()
def nh_create_chat_session(project_id: int, title: str | None = None) -> str:
    """创建聊天会话。"""
    return _j(http.post("/chat-sessions", {"project_id": project_id, "title": title}))


@mcp.tool()
def nh_list_chat_messages(session_id: int) -> str:
    """列出聊天会话消息。"""
    return _j(http.get(f"/chat-sessions/{session_id}/messages"))


@mcp.tool()
def nh_send_chat_message(session_id: int, content: str, chapter_title: str = "未命名章节",
                         chapter_group_title: str = "默认卷", active_chapter_id: int | None = None,
                         selection_text: str | None = None) -> str:
    """发送聊天消息（非流式）。"""
    return _j(http.post(f"/chat-sessions/{session_id}/messages", {
        "content": content, "chapter_title": chapter_title,
        "chapter_group_title": chapter_group_title,
        "active_chapter_id": active_chapter_id, "selection_text": selection_text,
    }))


@mcp.tool()
def nh_clear_chat_session(session_id: int) -> str:
    """清空聊天会话。"""
    return _j(http.post(f"/chat-sessions/{session_id}/clear", {}))


# ---- 备份 -------------------------------------------------------------------

@mcp.tool()
def nh_get_backup_status(chapter_id: int) -> str:
    """读取章节备份状态。"""
    return _j(http.get(f"/chapters/{chapter_id}/backup"))


@mcp.tool()
def nh_create_backup(chapter_id: int) -> str:
    """为章节创建备份。"""
    return _j(http.post(f"/chapters/{chapter_id}/backup", {}))


# ---- LLM 设置 ---------------------------------------------------------------

@mcp.tool()
def nh_get_llm_settings() -> str:
    """读取 LLM 设置（不回显密钥）。"""
    return _j(http.get("/settings/llm"))


@mcp.tool()
def nh_update_llm_settings(provider: str = "stub", base_url: str = "", api_key: str = "",
                           writer_model: str = "", planner_model: str = "", judge_model: str = "") -> str:
    """更新 LLM 设置。api_key 留空表示保留已存密钥。"""
    return _j(http.put("/settings/llm", {
        "provider": provider, "base_url": base_url, "api_key": api_key,
        "writer_model": writer_model, "planner_model": planner_model, "judge_model": judge_model,
    }))


@mcp.tool()
def nh_test_llm_settings(provider: str = "stub", base_url: str = "", api_key: str = "",
                          writer_model: str = "", planner_model: str = "", judge_model: str = "") -> str:
    """测试 LLM 连接。"""
    return _j(http.post("/settings/llm/test", {
        "provider": provider, "base_url": base_url, "api_key": api_key,
        "writer_model": writer_model, "planner_model": planner_model, "judge_model": judge_model,
    }))


# ---- 文风 -------------------------------------------------------------------

@mcp.tool()
def nh_get_style_profile(project_id: int) -> str:
    """读取项目最新文风画像。"""
    return _j(http.get(f"/style/profile?project_id={project_id}"))


@mcp.tool()
def nh_create_style_profile(project_id: int, samples: list, name: str = "default") -> str:
    """生成/刷新文风画像（samples 为正文样本列表）。"""
    return _j(http.post("/style/profile", {"project_id": project_id, "name": name, "samples": samples}))


def main() -> None:
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
