"""大纲树服务：支持 卷 → 章 → 场景 → 细纲 的任意层级，可增删改、移动、排序。"""
from __future__ import annotations

from app.database import get_conn, utc_now


class OutlineService:
    def build_tree(self, project_id: int) -> list[dict]:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                "SELECT id, parent_id, kind, title, summary, sort_order, status "
                "FROM outline_nodes WHERE project_id = %s ORDER BY sort_order, id",
                (project_id,),
            )
            rows = c.fetchall()

        nodes = {r["id"]: {**dict(r), "children": []} for r in rows}
        roots: list[dict] = []
        for r in rows:
            node = nodes[r["id"]]
            pid = r["parent_id"]
            if pid is not None and pid in nodes:
                nodes[pid]["children"].append(node)
            else:
                roots.append(node)
        return roots

    def create_node(self, project_id: int, payload: dict) -> dict:
        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            parent_id = payload.get("parent_id")
            if parent_id is not None:
                c.execute("SELECT id FROM outline_nodes WHERE id = %s AND project_id = %s", (parent_id, project_id))
                if not c.fetchone():
                    raise ValueError("父节点不存在")
            sort_order = self._next_sort(c, project_id, parent_id)
            c.execute(
                "INSERT INTO outline_nodes (project_id, parent_id, kind, title, summary, sort_order, status, created_at, updated_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (project_id, parent_id, payload.get("kind", "chapter"), payload["title"],
                 payload.get("summary", ""), sort_order, "draft", now, now),
            )
            node_id = c.lastrowid
        return self._get(node_id)

    def update_node(self, node_id: int, payload: dict) -> dict:
        allowed = {"title", "summary", "status", "kind", "sort_order", "parent_id"}
        updates: dict = {}
        for k, v in payload.items():
            if k not in allowed:
                continue
            if k == "parent_id":
                updates[k] = v  # 允许 None（移动到根）
            elif v is not None:
                updates[k] = v

        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT id FROM outline_nodes WHERE id = %s", (node_id,))
            if not c.fetchone():
                raise ValueError("节点不存在")
            if "parent_id" in updates and updates["parent_id"] is not None:
                new_parent = updates["parent_id"]
                c.execute("SELECT id FROM outline_nodes WHERE id = %s", (new_parent,))
                if not c.fetchone():
                    raise ValueError("父节点不存在")
                if new_parent == node_id or new_parent in self._descendant_ids(c, node_id):
                    raise ValueError("不能移动到自身或其子节点下")
            if updates:
                set_sql = ", ".join(f"{k} = %s" for k in updates)
                values = list(updates.values()) + [now, node_id]
                c.execute(f"UPDATE outline_nodes SET {set_sql}, updated_at = %s WHERE id = %s", values)
        return self._get(node_id)

    def delete_node(self, node_id: int) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT id FROM outline_nodes WHERE id = %s", (node_id,))
            if not c.fetchone():
                raise ValueError("节点不存在")
            ids = self._descendant_ids(c, node_id)
            placeholders = ",".join(["%s"] * len(ids))
            c.execute(f"DELETE FROM outline_nodes WHERE id IN ({placeholders})", tuple(ids))
            return {"deleted": len(ids)}

    def _get(self, node_id: int) -> dict | None:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute("SELECT * FROM outline_nodes WHERE id = %s", (node_id,))
            r = c.fetchone()
        return dict(r) if r else None

    def _next_sort(self, cursor, project_id: int, parent_id: int | None) -> int:
        if parent_id is None:
            cursor.execute(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM outline_nodes WHERE project_id = %s AND parent_id IS NULL",
                (project_id,),
            )
        else:
            cursor.execute(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM outline_nodes WHERE project_id = %s AND parent_id = %s",
                (project_id, parent_id),
            )
        return cursor.fetchone()["n"]

    def _descendant_ids(self, cursor, node_id: int) -> set[int]:
        ids = {node_id}
        frontier = [node_id]
        while frontier:
            cur = frontier.pop()
            cursor.execute("SELECT id FROM outline_nodes WHERE parent_id = %s", (cur,))
            for r in cursor.fetchall():
                if r["id"] not in ids:
                    ids.add(r["id"])
                    frontier.append(r["id"])
        return ids
