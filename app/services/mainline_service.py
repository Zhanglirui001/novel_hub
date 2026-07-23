"""章节级故事主线服务。

- get/save：每章一条「生效」主线，按 chapter_id upsert。
- stream_discussion：无状态的剧情讨论（对话历史由前端携带），基于 build_model_client().stream_chat
  流式产出，system 中注入故事线（timeline）、角色、术语与上一章结尾作为讨论素材。

主线「仅按需引用」：不进 build_context，只在前端点「据此生成」或勾选「参考主线」时随续写请求带入。
"""

from __future__ import annotations

from typing import Iterator, Optional

from app.database import get_conn, utc_now
from app.services.lore_service import LoreService
from app.services.modeling import build_model_client


class MainlineService:
    def __init__(self) -> None:
        self.lore_service = LoreService()

    # ---- 读写 --------------------------------------------------------------

    def get_mainline(self, chapter_id: int) -> Optional[dict]:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                SELECT id, project_id, chapter_id, content, status, updated_at
                FROM chapter_mainlines
                WHERE chapter_id = %s
                ORDER BY updated_at DESC, id DESC
                LIMIT 1
                """,
                (chapter_id,),
            )
            return c.fetchone()

    def save_mainline(self, project_id: int, chapter_id: int, content: str) -> dict:
        """按 chapter_id upsert 生效主线，返回落库后的记录。"""
        text = (content or "").strip()
        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT id FROM chapter_mainlines WHERE chapter_id = %s ORDER BY id ASC LIMIT 1",
                (chapter_id,),
            )
            row = c.fetchone()
            if row:
                mainline_id = row["id"]
                c.execute(
                    """
                    UPDATE chapter_mainlines
                    SET content = %s, status = 'confirmed', project_id = %s, updated_at = %s
                    WHERE id = %s
                    """,
                    (text, project_id, now, mainline_id),
                )
            else:
                c.execute(
                    """
                    INSERT INTO chapter_mainlines (project_id, chapter_id, content, status, updated_at)
                    VALUES (%s, %s, %s, 'confirmed', %s)
                    """,
                    (project_id, chapter_id, text, now),
                )
                mainline_id = c.lastrowid
        return {
            "id": mainline_id,
            "project_id": project_id,
            "chapter_id": chapter_id,
            "content": text,
            "status": "confirmed",
            "updated_at": now,
        }

    # ---- 全局主线（项目级，1 条生效） -------------------------------------

    _SUMMARY_FALLBACK_LIMIT = 200

    def get_global_mainline(self, project_id: int) -> Optional[dict]:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                SELECT id, project_id, content, summary, status, updated_at
                FROM project_mainlines
                WHERE project_id = %s
                ORDER BY updated_at DESC, id DESC
                LIMIT 1
                """,
                (project_id,),
            )
            return c.fetchone()

    def save_global_mainline(self, project_id: int, content: str, summary: str = "") -> dict:
        """按 project_id upsert 全局主线。summary 为空时用 content 截断兜底。"""
        text = (content or "").strip()
        summary_text = (summary or "").strip() or text[: self._SUMMARY_FALLBACK_LIMIT]
        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT id FROM project_mainlines WHERE project_id = %s ORDER BY id ASC LIMIT 1",
                (project_id,),
            )
            row = c.fetchone()
            if row:
                mainline_id = row["id"]
                c.execute(
                    """
                    UPDATE project_mainlines
                    SET content = %s, summary = %s, status = 'confirmed', updated_at = %s
                    WHERE id = %s
                    """,
                    (text, summary_text, now, mainline_id),
                )
            else:
                c.execute(
                    """
                    INSERT INTO project_mainlines (project_id, content, summary, status, updated_at)
                    VALUES (%s, %s, %s, 'confirmed', %s)
                    """,
                    (project_id, text, summary_text, now),
                )
                mainline_id = c.lastrowid
        return {
            "id": mainline_id,
            "project_id": project_id,
            "content": text,
            "summary": summary_text,
            "status": "confirmed",
            "updated_at": now,
        }

    def get_global_summary(self, project_id: int) -> str:
        """取全局主线的常驻注入摘要（无则空串）。供续写/生成 prompt 注入。"""
        row = self.get_global_mainline(project_id)
        if not row:
            return ""
        return (row.get("summary") or row.get("content") or "").strip()

    # ---- 讨论 --------------------------------------------------------------

    def _prev_chapter_tail(self, project_id: int, chapter_id: int, limit: int = 1200) -> str:
        """按 (group_title, sort_order, id) 找到当前章的上一章，取其末尾若干字。"""
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT group_title, sort_order, id FROM chapters WHERE id = %s AND project_id = %s",
                (chapter_id, project_id),
            )
            cur = c.fetchone()
            if not cur:
                return ""
            c.execute(
                """
                SELECT content FROM chapters
                WHERE project_id = %s
                  AND (group_title < %s
                       OR (group_title = %s AND sort_order < %s)
                       OR (group_title = %s AND sort_order = %s AND id < %s))
                ORDER BY group_title DESC, sort_order DESC, id DESC
                LIMIT 1
                """,
                (
                    project_id,
                    cur["group_title"], cur["group_title"], cur["sort_order"],
                    cur["group_title"], cur["sort_order"], cur["id"],
                ),
            )
            prev = c.fetchone()
        if not prev or not prev.get("content"):
            return ""
        return prev["content"].strip()[-limit:]

    def _build_discussion_messages(
        self, project_id: int, chapter_id: int, message: str, history: list[dict]
    ) -> list[dict]:
        context = self.lore_service.build_context(project_id)
        characters = "、".join(c.get("name", "") for c in context.get("characters", [])[:8] if c.get("name"))
        terms = "、".join(t.get("name", "") for t in context.get("terms", [])[:8] if t.get("name"))
        timeline = context.get("timeline", []) or []
        recent = timeline[-6:] if timeline else []
        timeline_text = "；".join(
            f"{e.get('label', '')}:{e.get('description', '')}" for e in recent if e.get("label")
        )
        existing = self.get_mainline(chapter_id)
        prev_tail = self._prev_chapter_tail(project_id, chapter_id)

        system = (
            "你是小说策划，正与作者讨论「本章故事主线」。目标是帮作者把本章要发生什么、"
            "冲突与转折、要推进或回收的线索，梳理成一条清晰、可执行、不剧透过头的主线。\n"
            "讨论时多提可选方案与追问，避免直接大段代写正文。当作者说「整理主线/确认」时，"
            "用一段 120 字以内的话概括本章主线。\n"
            f"已有主线：{(existing or {}).get('content') or '（尚未确认）'}\n"
            f"主要角色：{characters or '（无）'}\n"
            f"关键术语：{terms or '（无）'}\n"
            f"近期故事线：{timeline_text or '（无）'}\n"
            f"上一章结尾：{prev_tail or '（无，可能是开篇）'}"
        )
        messages: list[dict] = [{"role": "system", "content": system}]
        for turn in history[-10:]:
            role = turn.get("role")
            content = (turn.get("content") or "").strip()
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": message.strip()})
        return messages

    def stream_discussion(
        self, project_id: int, chapter_id: int, message: str, history: list[dict] | None = None
    ) -> Iterator[dict]:
        text = (message or "").strip()
        if not text:
            yield {"type": "error", "message": "content 不能为空"}
            return
        try:
            llm_messages = self._build_discussion_messages(project_id, chapter_id, text, history or [])
        except Exception as exc:
            yield {"type": "error", "message": f"读取设定失败：{exc}"}
            return

        pieces: list[str] = []
        try:
            for piece in build_model_client().stream_chat(llm_messages):
                if not piece:
                    continue
                pieces.append(piece)
                yield {"type": "delta", "text": piece}
        except Exception as exc:
            yield {"type": "error", "message": str(exc)}
            return

        reply = "".join(pieces).strip()
        if not reply:
            yield {"type": "error", "message": "模型返回为空"}
            return
        yield {"type": "done", "reply": reply}
