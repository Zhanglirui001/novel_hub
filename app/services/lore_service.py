import json

from app.database import get_conn, utc_now


class LoreService:
    def import_lore(self, payload: dict) -> dict:
        project_id = payload["project_id"]
        now = utc_now()
        count = 0

        with get_conn() as conn:
            c = conn.cursor()
            for character in payload.get("characters", []):
                c.execute(
                    "INSERT INTO character_cards (project_id, name, profile, created_at) VALUES (%s, %s, %s, %s)",
                    (
                        project_id,
                        character.get("name", "未命名角色"),
                        character.get("profile", ""),
                        now,
                    ),
                )
                count += 1

            groups = [
                ("world_rule", payload.get("world_rules", [])),
                ("term", payload.get("terms", [])),
                ("taboo", payload.get("taboos", [])),
            ]
            for item_type, items in groups:
                for item in items:
                    c.execute(
                        """
                        INSERT INTO lore_items (project_id, item_type, name, content, tags, created_at)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        """,
                        (
                            project_id,
                            item_type,
                            item.get("name", item_type),
                            item.get("content", ""),
                            json.dumps(item.get("tags", []), ensure_ascii=False),
                            now,
                        ),
                    )
                    count += 1

            for event in payload.get("timeline_events", []):
                c.execute(
                    """
                    INSERT INTO timeline_events (project_id, event_time, label, description, source, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        project_id,
                        event.get("event_time", now),
                        event.get("label", "事件"),
                        event.get("description", ""),
                        event.get("source", "lore_import"),
                        now,
                    ),
                )
                count += 1

        return {"imported_count": count}

    def build_context(self, project_id: int) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT id, name, profile FROM character_cards WHERE project_id = %s", (project_id,))
            characters = [{"id": r["id"], "name": r["name"], "profile": r["profile"]} for r in c.fetchall()]

            c.execute(
                "SELECT id, item_type, name, content, tags FROM lore_items WHERE project_id = %s",
                (project_id,),
            )
            lore_rows = c.fetchall()

            world_rules, terms, taboos = [], [], []
            for row in lore_rows:
                item = {
                    "id": row["id"],
                    "name": row["name"],
                    "content": row["content"],
                    "tags": json.loads(row["tags"] or "[]"),
                }
                if row["item_type"] == "world_rule":
                    world_rules.append(item)
                elif row["item_type"] == "term":
                    terms.append(item)
                elif row["item_type"] == "taboo":
                    taboos.append(item)

            c.execute(
                """
                SELECT event_time, label, description, source
                FROM timeline_events WHERE project_id = %s
                ORDER BY event_time ASC
                """,
                (project_id,),
            )
            timeline = list(c.fetchall())

        return {
            "characters": characters,
            "world_rules": world_rules,
            "terms": terms,
            "taboos": taboos,
            "timeline": timeline,
        }

    def add_timeline_event(
        self,
        project_id: int,
        label: str,
        description: str,
        source: str,
        event_time: str | None = None,
    ) -> dict:
        """向时间线追加一条事件，返回落库后的事件 dict。"""
        now = utc_now()
        event_time = event_time or now
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                INSERT INTO timeline_events (project_id, event_time, label, description, source, created_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (project_id, event_time, label, description, source, now),
            )
        return {
            "project_id": project_id,
            "event_time": event_time,
            "label": label,
            "description": description,
            "source": source,
        }

    def list_timeline(self, project_id: int) -> list[dict]:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                SELECT event_time, label, description, source
                FROM timeline_events
                WHERE project_id = %s
                ORDER BY event_time DESC
                """,
                (project_id,),
            )
            return list(c.fetchall())

    # ---- 删除（前端「管理设定」用） ---------------------------------------

    def delete_lore_item(self, project_id: int, item_id: int) -> dict:
        """删除一条 lore_items（世界规则/术语/禁忌）。返回受影响行数。"""
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                "DELETE FROM lore_items WHERE id = %s AND project_id = %s",
                (item_id, project_id),
            )
            return {"deleted": c.rowcount}

    def delete_character(self, project_id: int, character_id: int) -> dict:
        """删除一张角色卡。返回受影响行数。"""
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                "DELETE FROM character_cards WHERE id = %s AND project_id = %s",
                (character_id, project_id),
            )
            return {"deleted": c.rowcount}
