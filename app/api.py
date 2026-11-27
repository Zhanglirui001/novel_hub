import json
import os
import re

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from app.database import get_conn, init_db, utc_now
from app.schemas import (
    ChapterPlacementPayload,
    ChapterRenamePayload,
    ChapterSavePayload,
    VolumeRenamePayload,
    ChatMessageCreatePayload,
    ChatSessionCreatePayload,
    ConsistencyPayload,
    ContinueAcceptPayload,
    ContinuePayload,
    DailyCheckinPayload,
    DailyCheckinMakeupPayload,
    DailyTodoCreatePayload,
    DailyTodoUpdatePayload,
    MonthlyFixedTodoCreatePayload,
    MonthlyFixedTodoUpdatePayload,
    OutlineNodeCreatePayload,
    OutlineNodeUpdatePayload,
    DraftPayload,
    InspirationBoardCreatePayload,
    InspirationBoardUpdatePayload,
    InspirationCardCreatePayload,
    InspirationCardUpdatePayload,
    InspirationDiscussionPayload,
    InspirationGraphPatchPayload,
    InspirationProposalCreatePayload,
    InlineAnalyzePayload,
    InlineRevisePayload,
    LlmSettingsPayload,
    LoreImportPayload,
    CharacterUpdatePayload,
    LoreItemUpdatePayload,
    MainlineDiscussionPayload,
    MainlineSavePayload,
    GlobalMainlineSavePayload,
    PatchApplyPayload,
    ProjectCreate,
    StorylineGraphPatchPayload,
    StyleProfilePayload,
)
from app.services import ChatService, ConsistencyGuard, GenerationService, InspirationService, LoreService, OutlineService, StyleService
from app.services.inspiration_service import GraphConflictError
from app.services.storyline_service import StorylineService
from app.services.checkin_service import CheckinService
from app.services.writing_agent import WritingAgent
from app.services.mainline_service import MainlineService
from app.services import backup_service, settings_service
from app.services import mirror_service

init_db()
app = FastAPI(title="Novel Hub API", version="0.1.0")
# 允许本地 Next.js 前端跨域访问。可通过 CORS_ORIGINS 环境变量覆盖（逗号分隔）。
_default_origins = "http://localhost:3001,http://127.0.0.1:3001"
allow_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

lore_service = LoreService()
style_service = StyleService()
generation_service = GenerationService()
consistency_guard = ConsistencyGuard()
chat_service = ChatService()
inspiration_service = InspirationService()
storyline_service = StorylineService()
checkin_service = CheckinService()
writing_agent = WritingAgent()
mainline_service = MainlineService()
outline_service = OutlineService()


def _checkin_error(exc: ValueError) -> HTTPException:
    detail = str(exc)
    return HTTPException(status_code=404 if detail.startswith("project_id=") else 400, detail=detail)


@app.post("/projects")
def create_project(payload: ProjectCreate):
    now = utc_now()
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO projects (name, description, created_at) VALUES (%s, %s, %s)",
            (payload.name, payload.description, now),
        )
        project_id = c.lastrowid
    return {"project_id": project_id, "name": payload.name}


@app.get("/projects")
def list_projects():
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT id, name, description, created_at FROM projects ORDER BY id DESC")
        return list(c.fetchall())


@app.get("/projects/{project_id}")
def get_project(project_id: int):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT id, name, description, created_at FROM projects WHERE id = %s",
            (project_id,),
        )
        row = c.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"project_id={project_id} 不存在")
    return row


@app.get("/projects/{project_id}/inspiration/cards")
def list_inspiration_cards(project_id: int, search: str = "", card_type: str = ""):
    return inspiration_service.list_cards(project_id, search, card_type)


@app.post("/projects/{project_id}/inspiration/cards")
def create_inspiration_card(project_id: int, payload: InspirationCardCreatePayload):
    try:
        return inspiration_service.create_card(project_id, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/projects/{project_id}/inspiration/cards/{card_id}")
def update_inspiration_card(project_id: int, card_id: int, payload: InspirationCardUpdatePayload):
    try:
        return inspiration_service.update_card(project_id, card_id, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=404 if "不属于" in str(exc) else 400, detail=str(exc)) from exc


@app.delete("/projects/{project_id}/inspiration/cards/{card_id}")
def delete_inspiration_card(project_id: int, card_id: int):
    try:
        return inspiration_service.delete_card(project_id, card_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/projects/{project_id}/inspiration/boards")
def list_inspiration_boards(project_id: int):
    return inspiration_service.list_boards(project_id)


@app.post("/projects/{project_id}/inspiration/boards")
def create_inspiration_board(project_id: int, payload: InspirationBoardCreatePayload):
    try:
        return inspiration_service.create_board(project_id, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/projects/{project_id}/inspiration/boards/{board_id}")
def get_inspiration_board(project_id: int, board_id: int):
    try:
        return inspiration_service.get_board_graph(project_id, board_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/projects/{project_id}/inspiration/boards/{board_id}")
def update_inspiration_board(project_id: int, board_id: int, payload: InspirationBoardUpdatePayload):
    try:
        return inspiration_service.update_board(project_id, board_id, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=404 if "不属于" in str(exc) else 400, detail=str(exc)) from exc


@app.delete("/projects/{project_id}/inspiration/boards/{board_id}")
def delete_inspiration_board(project_id: int, board_id: int):
    try:
        return inspiration_service.delete_board(project_id, board_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/projects/{project_id}/inspiration/boards/{board_id}/graph")
def patch_inspiration_graph(project_id: int, board_id: int, payload: InspirationGraphPatchPayload):
    try:
        return inspiration_service.patch_graph(project_id, board_id, payload.model_dump())
    except GraphConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404 if "不属于" in str(exc) else 400, detail=str(exc)) from exc


@app.get("/projects/{project_id}/storyline")
def get_storyline(project_id: int):
    try:
        return storyline_service.get_or_create_graph(project_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/projects/{project_id}/storyline/graph")
def patch_storyline_graph(project_id: int, payload: StorylineGraphPatchPayload):
    try:
        return storyline_service.patch_graph(project_id, payload.model_dump())
    except GraphConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404 if "不存在" in str(exc) else 400, detail=str(exc)) from exc


@app.post("/projects/{project_id}/inspiration/boards/{board_id}/proposals")
def create_inspiration_proposal(project_id: int, board_id: int, payload: InspirationProposalCreatePayload):
    try:
        return inspiration_service.create_proposal(project_id, board_id, None, payload.model_dump())
    except GraphConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404 if "不属于" in str(exc) else 400, detail=str(exc)) from exc


@app.post("/projects/{project_id}/inspiration/proposals/{proposal_id}/apply")
def apply_inspiration_proposal(project_id: int, proposal_id: int):
    try:
        return inspiration_service.apply_proposal(project_id, proposal_id)
    except GraphConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=404 if "不属于" in str(exc) else 400, detail=str(exc)) from exc


@app.post("/projects/{project_id}/inspiration/proposals/{proposal_id}/dismiss")
def dismiss_inspiration_proposal(project_id: int, proposal_id: int):
    try:
        return inspiration_service.dismiss_proposal(project_id, proposal_id)
    except ValueError as exc:
        raise HTTPException(status_code=404 if "不属于" in str(exc) else 400, detail=str(exc)) from exc


@app.post("/projects/{project_id}/inspiration/boards/{board_id}/discussion/stream")
def stream_inspiration_discussion(project_id: int, board_id: int, payload: InspirationDiscussionPayload):
    try:
        session_id = inspiration_service.get_or_create_board_chat_session(project_id, board_id, chat_service.create_session)
        context = inspiration_service.build_discussion_context(project_id, board_id, payload.selected_node_ids)
        events = chat_service.stream_inspiration_message(session_id, payload.content, context)
    except ValueError as exc:
        raise HTTPException(status_code=404 if "不属于" in str(exc) else 400, detail=str(exc)) from exc

    def event_stream():
        for event in events:
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/chapters/{chapter_id}/mainline")
def get_chapter_mainline(chapter_id: int):
    row = mainline_service.get_mainline(chapter_id)
    return row or {}


@app.put("/chapters/{chapter_id}/mainline")
def save_chapter_mainline(chapter_id: int, payload: MainlineSavePayload):
    return mainline_service.save_mainline(payload.project_id, chapter_id, payload.content)


@app.post("/projects/{project_id}/chapters/{chapter_id}/mainline/discussion/stream")
def stream_mainline_discussion(project_id: int, chapter_id: int, payload: MainlineDiscussionPayload):
    history = [turn.model_dump() for turn in payload.history]
    events = mainline_service.stream_discussion(project_id, chapter_id, payload.content, history)

    def event_stream():
        for event in events:
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/projects/{project_id}/mainline")
def get_global_mainline(project_id: int):
    return mainline_service.get_global_mainline(project_id) or {}


@app.put("/projects/{project_id}/mainline")
def save_global_mainline(project_id: int, payload: GlobalMainlineSavePayload):
    return mainline_service.save_global_mainline(project_id, payload.content, payload.summary)


@app.get("/projects/{project_id}/chapters")
def list_chapters(project_id: int):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            """
            SELECT id, title, group_title, sort_order, version, updated_at
            FROM chapters WHERE project_id = %s
            ORDER BY group_title ASC, sort_order ASC, id ASC
            """,
            (project_id,),
        )
        return list(c.fetchall())


@app.get("/chapters/{chapter_id}")
def get_chapter(chapter_id: int):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT id, project_id, title, group_title, content, sort_order, version, updated_at FROM chapters WHERE id = %s",
            (chapter_id,),
        )
        row = c.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"chapter_id={chapter_id} 不存在")
    return row


@app.put("/chapters")
def save_chapter(payload: ChapterSavePayload):
    """直接保存正文（手动保存 / 自动保存通道，区别于 patch/apply）。"""
    now = utc_now()
    title = payload.title.strip() or "未命名章节"
    group_title = payload.group_title.strip() or "默认卷"
    if len(title) > 255:
        raise HTTPException(status_code=400, detail="title 不能超过 255 个字符")
    if len(group_title) > 255:
        raise HTTPException(status_code=400, detail="group_title 不能超过 255 个字符")
    previous: tuple[str, str] | None = None
    with get_conn() as conn:
        c = conn.cursor()
        target_id = payload.chapter_id
        sort_order = payload.sort_order
        if target_id is None:
            c.execute(
                """
                SELECT id, title, group_title, version FROM chapters
                WHERE project_id = %s AND group_title = %s AND title = %s
                ORDER BY id DESC LIMIT 1
                """,
                (payload.project_id, group_title, title),
            )
            existing = c.fetchone()
            if existing:
                target_id = existing["id"]
                version = existing["version"] + 1
                previous = (existing["title"], existing["group_title"])
            else:
                if sort_order is None:
                    c.execute(
                        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM chapters WHERE project_id = %s AND group_title = %s",
                        (payload.project_id, group_title),
                    )
                    sort_order = c.fetchone()["next_order"]
                c.execute(
                    """
                    INSERT INTO chapters (project_id, title, group_title, content, sort_order, version, updated_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (payload.project_id, title, group_title, payload.content, sort_order, 1, now),
                )
                new_id = c.lastrowid
                result = {
                    "chapter_id": new_id,
                    "version": 1,
                    "updated_at": now,
                    "created": True,
                }
        else:
            c.execute(
                "SELECT project_id, title, group_title, content, version, sort_order FROM chapters WHERE id = %s",
                (target_id,),
            )
            row = c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"chapter_id={target_id} 不存在")
            if row["project_id"] != payload.project_id:
                raise HTTPException(status_code=400, detail="chapter_id 不属于当前 project_id")
            # 防误清空：旧正文有内容、新正文却是空白，且没有显式声明 allow_empty → 拒绝。
            if (row["content"] or "").strip() and not (payload.content or "").strip() and not payload.allow_empty:
                raise HTTPException(
                    status_code=409,
                    detail="新正文为空，已拒绝覆盖（如确实要清空这一章，请显式允许空稿）",
                )
            version = row["version"] + 1
            previous = (row["title"], row["group_title"])
            if sort_order is None:
                sort_order = row["sort_order"]
            # 覆盖前先把旧版本留档（只保留最近 20 版），误清空也能找回。
            c.execute(
                """
                INSERT INTO chapter_revisions (chapter_id, project_id, title, group_title, content, version, saved_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (target_id, payload.project_id, row["title"], row["group_title"], row["content"], row["version"], now),
            )
            c.execute(
                """
                DELETE FROM chapter_revisions
                WHERE chapter_id = %s AND id NOT IN (
                    SELECT id FROM chapter_revisions WHERE chapter_id = %s ORDER BY id DESC LIMIT 20
                )
                """,
                (target_id, target_id),
            )

        if target_id is not None:
            c.execute(
                """
                UPDATE chapters
                SET title = %s, group_title = %s, content = %s, sort_order = %s, version = %s, updated_at = %s
                WHERE id = %s
                """,
                (title, group_title, payload.content, sort_order, version, now, target_id),
            )
            result = {
                "chapter_id": target_id,
                "version": version,
                "updated_at": now,
                "created": False,
            }

    # 事务已提交，再把这一章镜像到工作区（失败只记日志，不影响保存结果）。
    mirror_service.on_chapter_saved(payload.project_id, title, group_title, payload.content, previous)
    return result


@app.patch("/chapters/{chapter_id}/placement")
def move_chapter(chapter_id: int, payload: ChapterPlacementPayload):
    group_title = payload.group_title.strip() or "默认卷"
    now = utc_now()
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT project_id, title, group_title, content, sort_order FROM chapters WHERE id = %s", (chapter_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"chapter_id={chapter_id} 不存在")
        sort_order = payload.sort_order
        if sort_order is None:
            c.execute(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM chapters WHERE project_id = %s AND group_title = %s",
                (row["project_id"], group_title),
            )
            sort_order = c.fetchone()["next_order"]
        c.execute(
            "UPDATE chapters SET group_title = %s, sort_order = %s, updated_at = %s WHERE id = %s",
            (group_title, sort_order, now, chapter_id),
        )
    mirror_service.on_chapter_saved(
        row["project_id"],
        row["title"],
        group_title,
        row["content"] or "",
        (row["title"], row["group_title"]),
    )
    return {
        "chapter_id": chapter_id,
        "group_title": group_title,
        "sort_order": sort_order,
        "updated_at": now,
    }


@app.patch("/chapters/{chapter_id}")
def rename_chapter(chapter_id: int, payload: ChapterRenamePayload):
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title 不能为空")
    now = utc_now()
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT project_id, title, group_title, content FROM chapters WHERE id = %s", (chapter_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"chapter_id={chapter_id} 不存在")
        c.execute(
            "UPDATE chapters SET title = %s, updated_at = %s WHERE id = %s",
            (title, now, chapter_id),
        )
    mirror_service.on_chapter_saved(
        row["project_id"], title, row["group_title"], row["content"] or "", (row["title"], row["group_title"])
    )
    return {"chapter_id": chapter_id, "title": title, "updated_at": now}


@app.get("/chapters/{chapter_id}/revisions")
def list_chapter_revisions(chapter_id: int):
    """列出该章保留的历史版本（不含正文，便于先看再取）。"""
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            """
            SELECT id, version, title, group_title, length(content) AS chars, saved_at
            FROM chapter_revisions WHERE chapter_id = %s ORDER BY id DESC
            """,
            (chapter_id,),
        )
        return list(c.fetchall())


@app.get("/chapters/{chapter_id}/revisions/{revision_id}")
def get_chapter_revision(chapter_id: int, revision_id: int):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT id, chapter_id, version, title, group_title, content, saved_at FROM chapter_revisions WHERE id = %s AND chapter_id = %s",
            (revision_id, chapter_id),
        )
        row = c.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"revision_id={revision_id} 不存在")
    return row


@app.patch("/projects/{project_id}/volumes")
def rename_volume(project_id: int, payload: VolumeRenamePayload):
    """整卷改名（卷不是独立表，就是该卷所有章节的 group_title）。"""
    old_title = payload.old_title.strip()
    new_title = payload.new_title.strip() or "默认卷"
    if not old_title:
        raise HTTPException(status_code=400, detail="old_title 不能为空")
    if len(new_title) > 255:
        raise HTTPException(status_code=400, detail="卷名不能超过 255 个字符")
    now = utc_now()
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT id, title, content FROM chapters WHERE project_id = %s AND group_title = %s ORDER BY sort_order ASC, id ASC",
            (project_id, old_title),
        )
        rows = list(c.fetchall())
        if not rows:
            raise HTTPException(status_code=404, detail=f"卷「{old_title}」下没有章节")
        if old_title != new_title:
            c.execute(
                "UPDATE chapters SET group_title = %s, updated_at = %s WHERE project_id = %s AND group_title = %s",
                (new_title, now, project_id, old_title),
            )
    if old_title != new_title:
        mirror_service.on_volume_renamed(
            project_id, [(r["title"], old_title, new_title, r["content"] or "") for r in rows]
        )
    return {"project_id": project_id, "group_title": new_title, "updated": len(rows)}


@app.delete("/projects/{project_id}/volumes")
def delete_volume(project_id: int, title: str, keep_chapters: bool = False):
    """删除整卷。

    keep_chapters=true：章节保留，整体挪进「默认卷」；
    否则章节一并删除（正文仍可从历史版本取回）。
    """
    group_title = title.strip()
    if not group_title:
        raise HTTPException(status_code=400, detail="title 不能为空")
    now = utc_now()
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT id, title, content FROM chapters WHERE project_id = %s AND group_title = %s ORDER BY sort_order ASC, id ASC",
            (project_id, group_title),
        )
        rows = list(c.fetchall())
        if not rows:
            raise HTTPException(status_code=404, detail=f"卷「{group_title}」下没有章节")

        if keep_chapters:
            target = "默认卷" if group_title != "默认卷" else "未分卷"
            c.execute(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM chapters WHERE project_id = %s AND group_title = %s",
                (project_id, target),
            )
            start = c.fetchone()["next_order"]
            for offset, r in enumerate(rows):
                c.execute(
                    "UPDATE chapters SET group_title = %s, sort_order = %s, updated_at = %s WHERE id = %s",
                    (target, start + offset, now, r["id"]),
                )
            result = {"moved": len(rows), "deleted": 0, "group_title": target}
        else:
            for r in rows:
                c.execute("DELETE FROM chapter_mainlines WHERE chapter_id = %s", (r["id"],))
                c.execute("DELETE FROM consistency_issues WHERE chapter_id = %s", (r["id"],))
                c.execute("UPDATE patch_sets SET chapter_id = NULL WHERE chapter_id = %s", (r["id"],))
                c.execute("UPDATE model_run_logs SET chapter_id = NULL WHERE chapter_id = %s", (r["id"],))
                c.execute("DELETE FROM chapters WHERE id = %s", (r["id"],))
            result = {"moved": 0, "deleted": len(rows), "group_title": group_title}

    if keep_chapters:
        mirror_service.on_volume_renamed(
            project_id,
            [(r["title"], group_title, result["group_title"], r["content"] or "") for r in rows],
        )
    else:
        mirror_service.on_volume_deleted(project_id, [(r["title"], group_title) for r in rows])
    return {"project_id": project_id, **result}


@app.delete("/chapters/{chapter_id}")
def delete_chapter(chapter_id: int):
    """删除章节并清理其下属数据（主线、一致性记录、补丁集引用）。

    章节栏的删除按钮前端早就调了 DELETE /chapters/{id}，但后端一直没这条路由，
    浏览器收到 405、UI 乐观删除后又回滚——表现为「删了又回来了」。
    """
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT id, project_id, title, group_title FROM chapters WHERE id = %s", (chapter_id,))
        row = c.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail=f"chapter_id={chapter_id} 不存在")

        c.execute("DELETE FROM chapter_mainlines WHERE chapter_id = %s", (chapter_id,))
        c.execute("DELETE FROM consistency_issues WHERE chapter_id = %s", (chapter_id,))
        c.execute("UPDATE patch_sets SET chapter_id = NULL WHERE chapter_id = %s", (chapter_id,))
        c.execute("UPDATE model_run_logs SET chapter_id = NULL WHERE chapter_id = %s", (chapter_id,))
        c.execute("DELETE FROM chapters WHERE id = %s", (chapter_id,))

        # 同卷内的 sort_order 重新紧凑排列，避免删除后出现空档。
        c.execute(
            "SELECT id FROM chapters WHERE project_id = %s AND group_title = %s ORDER BY sort_order ASC, id ASC",
            (row["project_id"], row["group_title"]),
        )
        for order, r in enumerate(c.fetchall()):
            c.execute("UPDATE chapters SET sort_order = %s WHERE id = %s", (order, r["id"]))

    mirror_service.on_chapter_removed(row["project_id"], row["title"], row["group_title"])
    return {"chapter_id": chapter_id, "deleted": True}


@app.get("/projects/{project_id}/daily-checkin")
def get_daily_checkin(project_id: int):
    try:
        return checkin_service.get_today(project_id)
    except ValueError as exc:
        raise _checkin_error(exc) from exc


@app.get("/projects/{project_id}/daily-checkin/month")
def get_daily_checkin_month(project_id: int, month: str):
    try:
        return checkin_service.get_month(project_id, month)
    except ValueError as exc:
        raise _checkin_error(exc) from exc


@app.get("/projects/{project_id}/daily-checkin/{day}")
def get_daily_checkin_day(project_id: int, day: str):
    try:
        return checkin_service.get_day(project_id, day)
    except ValueError as exc:
        raise _checkin_error(exc) from exc


@app.post("/projects/{project_id}/daily-todos")
def create_daily_todo(project_id: int, day: str, payload: DailyTodoCreatePayload):
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="待办内容不能为空")
    try:
        return checkin_service.create_todo(project_id, content, day)
    except ValueError as exc:
        raise _checkin_error(exc) from exc


@app.patch("/daily-todos/{todo_id}")
def update_daily_todo(todo_id: int, project_id: int, day: str, payload: DailyTodoUpdatePayload):
    content = payload.content.strip() if payload.content is not None else None
    if content == "":
        raise HTTPException(status_code=400, detail="待办内容不能为空")
    try:
        return checkin_service.update_todo(project_id, todo_id, day, content, payload.completed)
    except ValueError as exc:
        raise _checkin_error(exc) from exc


@app.delete("/daily-todos/{todo_id}")
def delete_daily_todo(todo_id: int, project_id: int, day: str):
    try:
        return checkin_service.delete_todo(project_id, todo_id, day)
    except ValueError as exc:
        raise _checkin_error(exc) from exc


@app.get("/projects/{project_id}/monthly-fixed-todos")
def list_monthly_fixed_todos(project_id: int, month: str):
    try:
        return checkin_service.list_fixed_todos(project_id, month)
    except ValueError as exc:
        raise _checkin_error(exc) from exc


@app.post("/projects/{project_id}/monthly-fixed-todos")
def create_monthly_fixed_todo(project_id: int, payload: MonthlyFixedTodoCreatePayload):
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="固定待办内容不能为空")
    try:
        return checkin_service.create_fixed_todo(project_id, payload.month, content, payload.weekdays)
    except ValueError as exc:
        raise _checkin_error(exc) from exc


@app.patch("/monthly-fixed-todos/{template_id}")
def update_monthly_fixed_todo(template_id: int, project_id: int, payload: MonthlyFixedTodoUpdatePayload):
    content = payload.content.strip() if payload.content is not None else None
    if content == "":
        raise HTTPException(status_code=400, detail="固定待办内容不能为空")
    try:
        return checkin_service.update_fixed_todo(project_id, template_id, content, payload.weekdays)
    except ValueError as exc:
        raise _checkin_error(exc) from exc


@app.delete("/monthly-fixed-todos/{template_id}")
def delete_monthly_fixed_todo(template_id: int, project_id: int):
    try:
        return checkin_service.delete_fixed_todo(project_id, template_id)
    except ValueError as exc:
        raise _checkin_error(exc) from exc


@app.post("/projects/{project_id}/daily-checkin")
def create_daily_checkin(project_id: int, _payload: DailyCheckinPayload):
    try:
        return checkin_service.check_in(project_id)
    except ValueError as exc:
        raise _checkin_error(exc) from exc


@app.post("/projects/{project_id}/daily-checkin/{day}/makeup")
def make_up_daily_checkin(project_id: int, day: str, _payload: DailyCheckinMakeupPayload):
    try:
        return checkin_service.make_up(project_id, day)
    except ValueError as exc:
        raise _checkin_error(exc) from exc


@app.get("/projects/{project_id}/chat-sessions")
def list_chat_sessions(project_id: int):
    return chat_service.list_sessions(project_id)


@app.post("/chat-sessions")
def create_chat_session(payload: ChatSessionCreatePayload):
    return chat_service.create_session(payload.project_id, payload.title)


@app.get("/chat-sessions/{session_id}/messages")
def list_chat_messages(session_id: int):
    return chat_service.list_messages(session_id)


@app.post("/chat-sessions/{session_id}/messages")
def create_chat_message(session_id: int, payload: ChatMessageCreatePayload):
    return chat_service.send_message(
        session_id=session_id,
        content=payload.content,
        chapter_title=payload.chapter_title,
        chapter_group_title=payload.chapter_group_title,
        active_chapter_id=payload.active_chapter_id,
        selection_text=payload.selection_text,
    )


@app.post("/chat-sessions/{session_id}/messages/stream")
def stream_chat_message(session_id: int, payload: ChatMessageCreatePayload):
    try:
        events = chat_service.stream_message(
            session_id=session_id,
            content=payload.content,
            chapter_title=payload.chapter_title,
            chapter_group_title=payload.chapter_group_title,
            active_chapter_id=payload.active_chapter_id,
            selection_text=payload.selection_text,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    def event_stream():
        for event in events:
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/chat-sessions/{session_id}/clear")
def clear_chat_session(session_id: int):
    return chat_service.clear_session(session_id)


@app.get("/chapters/{chapter_id}/backup")
def get_chapter_backup_status(chapter_id: int):
    try:
        return backup_service.get_status(chapter_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/chapters/{chapter_id}/backup")
def create_chapter_backup(chapter_id: int):
    try:
        return backup_service.backup_chapter(chapter_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/lore/import")
def import_lore(payload: LoreImportPayload):
    return lore_service.import_lore(payload.model_dump())


@app.get("/lore")
def get_lore(project_id: int):
    return lore_service.build_context(project_id)


@app.delete("/projects/{project_id}/lore/items/{item_id}")
def delete_lore_item(project_id: int, item_id: int):
    return lore_service.delete_lore_item(project_id, item_id)


@app.delete("/projects/{project_id}/characters/{character_id}")
def delete_character(project_id: int, character_id: int):
    return lore_service.delete_character(project_id, character_id)


@app.patch("/projects/{project_id}/characters/{character_id}")
def update_character(project_id: int, character_id: int, payload: CharacterUpdatePayload):
    try:
        return lore_service.update_character(project_id, character_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/projects/{project_id}/lore/items/{item_id}")
def update_lore_item(project_id: int, item_id: int, payload: LoreItemUpdatePayload):
    try:
        return lore_service.update_lore_item(project_id, item_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/style/profile")
def create_style_profile(payload: StyleProfilePayload):
    metrics = style_service.build_profile(payload.project_id, payload.name, payload.samples)
    return {"project_id": payload.project_id, "metrics": metrics}


@app.get("/style/profile")
def get_style_profile(project_id: int):
    return style_service.get_latest_profile(project_id)


@app.post("/draft/continue")
def continue_draft(payload: DraftPayload):
    return generation_service.run(
        project_id=payload.project_id,
        task_type="continue",
        chapter_title=payload.chapter_title,
        input_text=payload.input_text,
        budget=payload.budget,
        target_latency_ms=payload.target_latency_ms,
    )


@app.post("/draft/continue/stream")
def continue_draft_stream(payload: ContinuePayload):
    # 全书主线摘要：常驻注入，除非前端关闭「参考全书主线」开关。
    global_mainline = (
        mainline_service.get_global_summary(payload.project_id)
        if payload.use_global_mainline
        else ""
    )
    events = writing_agent.stream_continue(
        project_id=payload.project_id,
        tail_text=payload.tail_text,
        instruction=payload.instruction,
        directive=payload.directive,
        budget=payload.budget,
        target_latency_ms=payload.target_latency_ms,
        mode=payload.mode,
        mainline=payload.mainline,
        global_mainline=global_mainline,
    )

    def event_stream():
        for event in events:
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


_INTENT_LABELS = {
    "advance": "推进剧情",
    "dialogue": "对话推进",
    "scenery": "环境铺陈",
    "conflict": "制造冲突",
    "slow": "放慢节奏",
    "payoff": "回收伏笔",
    "free": "自由续写",
}


@app.post("/draft/continue/accept")
def accept_continue(payload: ContinueAcceptPayload):
    """采纳一段续写后：写时间线「续写落笔」事件 + 回流风格样本刷新活画像。"""
    text = payload.accepted_text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="accepted_text 不能为空")

    intent_type = (payload.directive or {}).get("intent_type", "free")
    intent_label = _INTENT_LABELS.get(intent_type, "自由续写")

    snippet = re.split(r"(?<=[。！？!?])", text.replace("\n", " ").strip(), maxsplit=1)[0]
    if len(snippet) > 40:
        snippet = snippet[:40] + "…"

    parts = [intent_label]
    if payload.consistency_score is not None:
        parts.append(f"一致性 {payload.consistency_score}")
    parts.append(snippet)
    description = " · ".join(parts)

    event = lore_service.add_timeline_event(
        payload.project_id, "续写落笔", description, "continue_accept"
    )
    style = style_service.record_accepted_sample(payload.project_id, text)
    return {"timeline_event": event, "style": style}


@app.post("/draft/polish")
def polish_draft(payload: DraftPayload):
    return generation_service.run(
        project_id=payload.project_id,
        task_type="polish",
        chapter_title=payload.chapter_title,
        input_text=payload.input_text,
        budget=payload.budget,
        target_latency_ms=payload.target_latency_ms,
    )


@app.post("/consistency/check")
def check_consistency(payload: ConsistencyPayload):
    context = lore_service.build_context(payload.project_id)
    return consistency_guard.check(payload.text, context)


@app.post("/draft/analyze")
def analyze_segment(payload: InlineAnalyzePayload):
    if not payload.selection.strip():
        raise HTTPException(status_code=400, detail="selection 不能为空")
    return generation_service.analyze_segment(
        project_id=payload.project_id,
        selection=payload.selection,
        prefix=payload.prefix,
        suffix=payload.suffix,
        chapter_title=payload.chapter_title,
    )


@app.post("/draft/revise")
def revise_segment(payload: InlineRevisePayload):
    if not payload.selection.strip():
        raise HTTPException(status_code=400, detail="selection 不能为空")
    return generation_service.revise_segment(
        project_id=payload.project_id,
        selection=payload.selection,
        prefix=payload.prefix,
        suffix=payload.suffix,
        annotation=payload.annotation,
        analysis=payload.analysis,
        chapter_title=payload.chapter_title,
        budget=payload.budget,
        target_latency_ms=payload.target_latency_ms,
    )


@app.post("/patch/apply")
def apply_patch(payload: PatchApplyPayload):
    try:
        return generation_service.apply_patch_set(
            patch_set_id=payload.patch_set_id,
            accepted_ids=payload.accepted_ids,
            chapter_title=payload.chapter_title,
            chapter_id=payload.chapter_id,
            group_title=payload.group_title,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/timeline")
def timeline(project_id: int):
    return lore_service.list_timeline(project_id)


@app.get("/projects/{project_id}/outline")
def get_outline(project_id: int):
    return outline_service.build_tree(project_id)


@app.post("/projects/{project_id}/outline")
def create_outline_node(project_id: int, payload: OutlineNodeCreatePayload):
    try:
        return outline_service.create_node(project_id, payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/outline/{node_id}")
def update_outline_node(node_id: int, payload: OutlineNodeUpdatePayload):
    try:
        return outline_service.update_node(node_id, payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/outline/{node_id}")
def delete_outline_node(node_id: int):
    try:
        return outline_service.delete_node(node_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/settings/llm")
def get_llm_settings():
    return settings_service.get_settings_public()


@app.put("/settings/llm")
def update_llm_settings(payload: LlmSettingsPayload):
    try:
        return settings_service.save_settings(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/settings/llm/test")
def test_llm_settings(payload: LlmSettingsPayload):
    return settings_service.test_connection(payload.model_dump())
