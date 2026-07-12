import json

from app.database import get_conn, utc_now
from app.services.modeling import build_model_client


# 保留最近多少条历史消息一起发给模型，避免上下文无限增长。
MAX_HISTORY_MESSAGES = 20
SYSTEM_PROMPT = (
    "你是小说创作助手，服务于一个中文小说写作工具。"
    "你要结合作者当前所在的章节、卷和选中的正文片段，"
    "帮助作者续写、润色、分析戏剧冲突、检查设定一致性或给出改写方案。"
    "输出自然、地道的中文，遵守作者既有的设定与文风，不要输出与写作无关的内容。"
)


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
        context = {
            "chapterTitle": chapter_title.strip() or "未命名章节",
            "chapterGroupTitle": chapter_group_title.strip() or "默认卷",
            "activeChapterId": active_chapter_id,
            "hasSelection": bool((selection_text or "").strip()),
            "selectionText": selection_text or None,
        }
        llm_messages = self._build_llm_messages(session_id, text, context)
        try:
            assistant_content = build_model_client().chat(llm_messages)
        except Exception as exc:  # 上游异常收敛为可读文案，避免 500 中断会话
            assistant_content = f"（生成失败）{exc}"
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

    def stream_message(
        self,
        session_id: int,
        content: str,
        chapter_title: str,
        chapter_group_title: str,
        active_chapter_id: int | None,
        selection_text: str | None,
    ):
        """流式生成回复。

        返回一个生成器，逐段 yield 事件字典：
        - {"type": "delta", "text": ...}   增量文本
        - {"type": "done", "session": ..., "messages": [...]}  结束并附持久化结果
        - {"type": "error", "message": ...}  生成失败（用户消息不会入库）
        用户消息与最终的完整回复在生成成功后一并写库，失败则不落库，便于前端重试。
        """
        text = content.strip()
        if not text:
            raise ValueError("content 不能为空")

        session = self._ensure_session(session_id)
        context = {
            "chapterTitle": chapter_title.strip() or "未命名章节",
            "chapterGroupTitle": chapter_group_title.strip() or "默认卷",
            "activeChapterId": active_chapter_id,
            "hasSelection": bool((selection_text or "").strip()),
            "selectionText": selection_text or None,
        }
        llm_messages = self._build_llm_messages(session_id, text, context)

        def _generate():
            pieces: list[str] = []
            try:
                for piece in build_model_client().stream_chat(llm_messages):
                    pieces.append(piece)
                    yield {"type": "delta", "text": piece}
            except Exception as exc:  # 生成失败：不落库，交给前端提示与重试
                yield {"type": "error", "message": str(exc)}
                return

            assistant_content = "".join(pieces).strip()
            if not assistant_content:
                yield {"type": "error", "message": "模型返回为空"}
                return

            result = self._persist_exchange(session, text, assistant_content, context)
            yield {"type": "done", **result}

        return _generate()

    def stream_inspiration_message(self, session_id: int, content: str, inspiration_context: dict):
        """围绕灵感画板进行流式讨论，普通章节聊天的请求与提示词保持不变。"""
        text = content.strip()
        if not text:
            raise ValueError("content 不能为空")
        session = self._ensure_session(session_id)
        context = {"inspiration": inspiration_context}
        llm_messages = self._build_inspiration_messages(session_id, text, inspiration_context)

        def _generate():
            pieces: list[str] = []
            try:
                for piece in build_model_client().stream_chat(llm_messages):
                    pieces.append(piece)
                    yield {"type": "delta", "text": piece}
            except Exception as exc:
                yield {"type": "error", "message": str(exc)}
                return

            assistant_content = "".join(pieces).strip()
            if not assistant_content:
                yield {"type": "error", "message": "模型返回为空"}
                return
            result = self._persist_exchange(session, text, assistant_content, context)
            yield {"type": "done", **result}

        return _generate()

    def stream_inspiration_message(self, session_id: int, content: str, inspiration_context: dict):
        """围绕灵感画板进行流式讨论，普通章节聊天的请求与提示词保持不变。"""
        text = content.strip()
        if not text:
            raise ValueError("content 不能为空")
        session = self._ensure_session(session_id)
        context = {"inspiration": inspiration_context}
        llm_messages = self._build_inspiration_messages(session_id, text, inspiration_context)

        def _generate():
            pieces: list[str] = []
            try:
                for piece in build_model_client().stream_chat(llm_messages):
                    pieces.append(piece)
                    yield {"type": "delta", "text": piece}
            except Exception as exc:
                yield {"type": "error", "message": str(exc)}
                return

            assistant_content = "".join(pieces).strip()
            if not assistant_content:
                yield {"type": "error", "message": "模型返回为空"}
                return
            result = self._persist_exchange(session, text, assistant_content, context)
            yield {"type": "done", **result}

        return _generate()

    def _persist_exchange(self, session: dict, user_text: str, assistant_content: str, context: dict) -> dict:
        """将一轮用户/助手消息写库并返回与 send_message 一致的结果结构。"""
        session_id = session["id"]
        now = utc_now()
        context_json = json.dumps(context, ensure_ascii=False)
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                INSERT INTO chat_messages (session_id, role, content, context_json, created_at)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (session_id, "user", user_text, context_json, now),
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
                next_title = self._title_from_message(user_text)
            c.execute(
                "UPDATE chat_sessions SET title = %s, updated_at = %s WHERE id = %s",
                (next_title, now, session_id),
            )

        user_message = {
            "id": user_id,
            "session_id": session_id,
            "role": "user",
            "content": user_text,
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

    def _build_inspiration_messages(self, session_id: int, user_text: str, inspiration_context: dict) -> list[dict[str, str]]:
        """将当前画板快照限定在独立会话的系统上下文中。"""
        cards = inspiration_context.get("cards") or []
        edges = inspiration_context.get("edges") or []
        selected = inspiration_context.get("selectedNodeIds") or []
        card_lines = []
        for card in cards:
            tags = "、".join(card.get("tags") or [])
            card_lines.append(
                f"- 卡片#{card.get('id')} [{card.get('card_type')}] {card.get('title')}"
                f"（标签：{tags or '无'}）\n{card.get('content') or ''}"
            )
        edge_lines = [
            f"- {edge.get('source_node_id')} -> {edge.get('target_node_id')}：{edge.get('label') or edge.get('edge_type')}"
            for edge in edges
        ]
        board_summary = "\n".join(
            [
                f"当前灵感画板：{inspiration_context.get('boardTitle') or '未命名画板'}",
                f"画板版本：{inspiration_context.get('graphVersion')}",
                f"选中节点：{', '.join(selected) if selected else '无'}",
                "当前可见卡片：",
                "\n".join(card_lines) or "（暂无卡片）",
                "当前关系：",
                "\n".join(edge_lines) or "（暂无关系）",
            ]
        )
        prompt = (
            "你是中文小说创作中的灵感策划助手。你必须围绕作者提供的灵感画板，"
            "帮助梳理剧情、人物动机、冲突、伏笔和可能的结构。输出自然、清晰的中文讨论，"
            "不要假装已经修改作者的画板，也不要输出代码或 JSON。"
        )
        messages: list[dict[str, str]] = [{"role": "system", "content": prompt + "\n\n" + board_summary}]
        for row in self._recent_history(session_id):
            role = row["role"] if row["role"] in ("user", "assistant") else "user"
            message = (row.get("content") or "").strip()
            if message:
                messages.append({"role": role, "content": message})
        messages.append({"role": "user", "content": user_text})
        return messages

    def _build_llm_messages(self, session_id: int, user_text: str, context: dict) -> list[dict[str, str]]:
        """构造发给模型的消息列表：系统提示 + 场景说明 + 历史消息 + 本次提问。"""
        scene_lines = [
            f"当前卷：{context.get('chapterGroupTitle') or '默认卷'}",
            f"当前章节：{context.get('chapterTitle') or '未命名章节'}",
        ]
        selection = (context.get("selectionText") or "").strip()
        if selection:
            clipped = selection[:1200]
            if len(selection) > 1200:
                clipped += "…"
            scene_lines.append(f"作者在正文中选中的片段：\n{clipped}")
        else:
            scene_lines.append("作者当前没有选中正文片段。")

        messages: list[dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT + "\n\n" + "\n".join(scene_lines)},
        ]
        for row in self._recent_history(session_id):
            role = row["role"] if row["role"] in ("user", "assistant") else "user"
            content = (row.get("content") or "").strip()
            if content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": user_text})
        return messages

    def _recent_history(self, session_id: int) -> list[dict]:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                SELECT role, content FROM chat_messages
                WHERE session_id = %s
                ORDER BY id DESC
                LIMIT %s
                """,
                (session_id, MAX_HISTORY_MESSAGES),
            )
            rows = list(c.fetchall())
        rows.reverse()  # 转回时间正序
        return rows

    def _title_from_message(self, content: str) -> str:
        compact = " ".join(content.split()).strip() or "未命名会话"
        return (compact[:18] + "…") if len(compact) > 18 else compact
