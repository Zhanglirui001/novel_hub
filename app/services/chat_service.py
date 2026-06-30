import json

from app.database import get_conn, utc_now


class ChatService:
    def list_sessions(self, project_id: int) -> list[dict]:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                SELECT
                    s.id,
                    s.project_id,
                    s.title,
                    s.created_at,
                    s.updated_at,
                    COUNT(m.id) AS message_count,
                    (
                        SELECT content FROM chat_messages
                        WHERE session_id = s.id
                        ORDER BY id DESC LIMIT 1
                    ) AS last_message_preview
                FROM chat_sessions s
                LEFT JOIN chat_messages m ON m.session_id = s.id
                WHERE s.project_id = %s
                GROUP BY s.id, s.project_id, s.title, s.created_at, s.updated_at
                ORDER BY s.updated_at DESC, s.id DESC
                """,
                (project_id,),
            )
            rows = list(c.fetchall())
        for row in rows:
            preview = row.get("last_message_preview") or ""
            row["last_message_preview"] = preview[:120]
            row["message_count"] = int(row.get("message_count") or 0)
        return rows

    def create_session(self, project_id: int, title: str | None = None) -> dict:
        now = utc_now()
        clean_title = (title or "").strip()
        with get_conn() as conn:
            c = conn.cursor()
            if not clean_title:
                c.execute("SELECT COUNT(*) AS count FROM chat_sessions WHERE project_id = %s", (project_id,))
                clean_title = f"会话 {int(c.fetchone()['count']) + 1}"
            c.execute(
                """
                INSERT INTO chat_sessions (project_id, title, created_at, updated_at)
                VALUES (%s, %s, %s, %s)
                """,
                (project_id, clean_title[:255], now, now),
            )
            session_id = c.lastrowid
        return {
            "id": session_id,
            "project_id": project_id,
            "title": clean_title[:255],
            "created_at": now,
            "updated_at": now,
            "message_count": 0,
            "last_message_preview": "",
        }

    def list_messages(self, session_id: int) -> list[dict]:
        self._ensure_session(session_id)
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                SELECT id, session_id, role, content, context_json, created_at
                FROM chat_messages
                WHERE session_id = %s
                ORDER BY id ASC
                """,
                (session_id,),
            )
            rows = list(c.fetchall())
        return [self._message_from_row(row) for row in rows]

    def send_message(
        self,
        session_id: int,
        content: str,
        chapter_title: str,
        chapter_group_title: str,
        active_chapter_id: int | None,
        selection_text: str | None,
    ) -> dict:
        text = content.strip()
        if not text:
            raise ValueError("content 不能为空")

        session = self._ensure_session(session_id)
        selected_preview = (selection_text or "").strip()[:120]
        context = {
            "chapterTitle": chapter_title.strip() or "未命名章节",
            "chapterGroupTitle": chapter_group_title.strip() or "默认卷",
            "activeChapterId": active_chapter_id,
            "hasSelection": bool((selection_text or "").strip()),
            "selectionText": selection_text or None,
        }
        assistant_content = self._assistant_reply(context, selected_preview)
        now = utc_now()
        context_json = json.dumps(context, ensure_ascii=False)

        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                INSERT INTO chat_messages (session_id, role, content, context_json, created_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (session_id, "user", text, context_json, now),
            )
            user_id = c.lastrowid
            c.execute(
                """
                INSERT INTO chat_messages (session_id, role, content, context_json, created_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (session_id, "assistant", assistant_content, context_json, now),
            )
            assistant_id = c.lastrowid
            next_title = session["title"]
            if not next_title or next_title.startswith("会话 "):
                next_title = self._title_from_message(text)
            c.execute(
                "UPDATE chat_sessions SET title = %s, updated_at = %s WHERE id = %s",
                (next_title, now, session_id),
            )

        user_message = {
            "id": user_id,
            "session_id": session_id,
            "role": "user",
            "content": text,
            "context": context,
            "created_at": now,
        }
        assistant_message = {
            "id": assistant_id,
            "session_id": session_id,
            "role": "assistant",
            "content": assistant_content,
            "context": context,
            "created_at": now,
        }
        return {
            "session": {
                "id": session_id,
                "project_id": session["project_id"],
                "title": next_title,
                "created_at": session["created_at"],
                "updated_at": now,
                "message_count": session.get("message_count", 0) + 2,
                "last_message_preview": assistant_content[:120],
            },
            "messages": [user_message, assistant_message],
        }

    def clear_session(self, session_id: int) -> dict:
        self._ensure_session(session_id)
        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("DELETE FROM chat_messages WHERE session_id = %s", (session_id,))
            c.execute("UPDATE chat_sessions SET updated_at = %s WHERE id = %s", (now, session_id))
        return {"session_id": session_id, "cleared": True, "updated_at": now}

    def _ensure_session(self, session_id: int) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                SELECT s.*, COUNT(m.id) AS message_count
                FROM chat_sessions s
                LEFT JOIN chat_messages m ON m.session_id = s.id
                WHERE s.id = %s
                GROUP BY s.id
                """,
                (session_id,),
            )
            row = c.fetchone()
        if not row:
            raise ValueError(f"session_id={session_id} 不存在")
        row["message_count"] = int(row.get("message_count") or 0)
        return row

    def _message_from_row(self, row: dict) -> dict:
        context = {}
        try:
            context = json.loads(row.get("context_json") or "{}")
        except json.JSONDecodeError:
            context = {}
        return {
            "id": row["id"],
            "session_id": row["session_id"],
            "role": row["role"],
            "content": row["content"],
            "context": context,
            "created_at": row["created_at"],
        }

    def _assistant_reply(self, context: dict, selected_preview: str) -> str:
        if selected_preview:
            suffix = "…" if len(context.get("selectionText") or "") > 120 else ""
            return (
                "我已看到你选中的片段，可以围绕节奏、画面感、人物动机和信息密度来处理。\n\n"
                f"选区开头：{selected_preview}{suffix}\n\n"
                "你可以继续要求我：润色这段、改成更压抑的语气、扩写心理活动，或检查这段是否和前文设定冲突。"
            )
        return (
            f"我会围绕当前章节「{context['chapterTitle']}」协助你。\n\n"
            "可以让我继续写下一段、分析戏剧冲突、检查人物动机，或给出几版改写方向。若要精修某一段，先在正文中选中文字再发送给我。"
        )

    def _title_from_message(self, content: str) -> str:
        compact = " ".join(content.split()).strip() or "未命名会话"
        return (compact[:18] + "…") if len(compact) > 18 else compact
