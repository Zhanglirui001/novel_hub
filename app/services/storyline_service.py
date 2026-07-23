import json

from app.database import get_conn, utc_now
from app.services.inspiration_service import GraphConflictError


class StorylineService:
    """每个项目一条故事线（可编辑流程图），持久化节点+边+视口+版本号。

    结构镜像 InspirationService 的图持久化范式，但更轻量：节点仅含标题+简介，
    首次访问时自动为项目创建空图。
    """

    def get_or_create_graph(self, project_id: int) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            self._ensure_project(c, project_id)
            graph = self._get_graph_row(c, project_id)
            if not graph:
                now = utc_now()
                c.execute(
                    """
                    INSERT INTO storyline_graphs (project_id, viewport_json, version, created_at, updated_at)
                    VALUES (%s, %s, 1, %s, %s)
                    """,
                    (project_id, json.dumps({"x": 0, "y": 0, "zoom": 1}), now, now),
                )
                graph = self._get_graph_row(c, project_id)
            return self._read_graph(c, graph)

    def patch_graph(self, project_id: int, payload: dict) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            self._ensure_project(c, project_id)
            graph = self._get_graph_row(c, project_id)
            if not graph:
                raise ValueError("故事线尚未创建")
            if graph["version"] != payload["expected_graph_version"]:
                raise GraphConflictError("故事线已在其他操作中更新，请重新加载后再保存")

            graph_id = graph["id"]
            deleted_node_ids = list(set(payload.get("deleted_node_ids", [])))
            deleted_edge_ids = list(set(payload.get("deleted_edge_ids", [])))

            if deleted_node_ids:
                placeholders = ", ".join(["%s"] * len(deleted_node_ids))
                c.execute(
                    f"DELETE FROM storyline_edges WHERE graph_id = %s AND (source_node_id IN ({placeholders}) OR target_node_id IN ({placeholders}))",
                    tuple([graph_id] + deleted_node_ids + deleted_node_ids),
                )
                c.execute(
                    f"DELETE FROM storyline_nodes WHERE graph_id = %s AND id IN ({placeholders})",
                    tuple([graph_id] + deleted_node_ids),
                )
            if deleted_edge_ids:
                placeholders = ", ".join(["%s"] * len(deleted_edge_ids))
                c.execute(
                    f"DELETE FROM storyline_edges WHERE graph_id = %s AND id IN ({placeholders})",
                    tuple([graph_id] + deleted_edge_ids),
                )

            now = utc_now()
            for node in payload.get("nodes", []):
                self._validate_node_graph(c, graph_id, node)
                values = (
                    graph_id,
                    self._clean_text(node.get("title"), 255),
                    str(node.get("description") or "").strip(),
                    node.get("position_x", 0),
                    node.get("position_y", 0),
                    node.get("width"),
                    node.get("height"),
                    node.get("z_index", 0),
                    now,
                )
                c.execute("SELECT id FROM storyline_nodes WHERE id = %s", (node["id"],))
                if c.fetchone():
                    c.execute(
                        """
                        UPDATE storyline_nodes
                        SET graph_id = %s, title = %s, description = %s, position_x = %s, position_y = %s,
                            width = %s, height = %s, z_index = %s, updated_at = %s
                        WHERE id = %s
                        """,
                        values + (node["id"],),
                    )
                else:
                    c.execute(
                        """
                        INSERT INTO storyline_nodes
                        (graph_id, title, description, position_x, position_y, width, height, z_index, updated_at, created_at, id)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        values + (now, node["id"]),
                    )

            for edge in payload.get("edges", []):
                self._validate_edge_nodes(c, graph_id, edge)
                values = (
                    graph_id,
                    edge["source_node_id"],
                    edge["target_node_id"],
                    self._clean_text(edge.get("label"), 255),
                    json.dumps(edge.get("style", {}), ensure_ascii=False),
                    now,
                )
                c.execute("SELECT id FROM storyline_edges WHERE id = %s", (edge["id"],))
                if c.fetchone():
                    c.execute(
                        """
                        UPDATE storyline_edges
                        SET graph_id = %s, source_node_id = %s, target_node_id = %s, label = %s,
                            style_json = %s, updated_at = %s
                        WHERE id = %s
                        """,
                        values + (edge["id"],),
                    )
                else:
                    c.execute(
                        """
                        INSERT INTO storyline_edges
                        (graph_id, source_node_id, target_node_id, label, style_json, updated_at, created_at, id)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        values + (now, edge["id"]),
                    )

            next_version = graph["version"] + 1
            viewport = payload.get("viewport") or {"x": 0, "y": 0, "zoom": 1}
            c.execute(
                "UPDATE storyline_graphs SET viewport_json = %s, version = %s, updated_at = %s WHERE id = %s",
                (json.dumps(viewport), next_version, now, graph_id),
            )
            graph = self._get_graph_row(c, project_id)
            return self._read_graph(c, graph)

    # ---- 内部工具 ----------------------------------------------------------

    def _read_graph(self, c, graph: dict) -> dict:
        graph_id = graph["id"]
        c.execute("SELECT * FROM storyline_nodes WHERE graph_id = %s ORDER BY z_index, id", (graph_id,))
        nodes = [self._node_from_row(row) for row in c.fetchall()]
        c.execute("SELECT * FROM storyline_edges WHERE graph_id = %s ORDER BY id", (graph_id,))
        edges = [self._edge_from_row(row) for row in c.fetchall()]
        return {**self._graph_from_row(graph), "nodes": nodes, "edges": edges}

    def _get_graph_row(self, c, project_id: int) -> dict | None:
        c.execute("SELECT * FROM storyline_graphs WHERE project_id = %s", (project_id,))
        return c.fetchone()

    def _ensure_project(self, c, project_id: int) -> dict:
        c.execute("SELECT id FROM projects WHERE id = %s", (project_id,))
        row = c.fetchone()
        if not row:
            raise ValueError(f"project_id={project_id} 不存在")
        return row

    def _validate_node_graph(self, c, graph_id: int, node: dict) -> None:
        c.execute("SELECT graph_id FROM storyline_nodes WHERE id = %s", (node["id"],))
        existing = c.fetchone()
        if existing and existing["graph_id"] != graph_id:
            raise ValueError("节点不能跨故事线移动")

    def _validate_edge_nodes(self, c, graph_id: int, edge: dict) -> None:
        if edge["source_node_id"] == edge["target_node_id"]:
            raise ValueError("连线不能连接到自身")
        c.execute(
            "SELECT id FROM storyline_nodes WHERE graph_id = %s AND id IN (%s, %s)",
            (graph_id, edge["source_node_id"], edge["target_node_id"]),
        )
        if len(c.fetchall()) != 2:
            raise ValueError("连线两端节点必须属于当前故事线")

    @staticmethod
    def _clean_text(value: object, limit: int) -> str:
        return str(value or "").strip()[:limit]

    @staticmethod
    def _graph_from_row(row: dict) -> dict:
        data = dict(row)
        try:
            data["viewport"] = json.loads(data.pop("viewport_json") or "{}")
        except json.JSONDecodeError:
            data["viewport"] = {"x": 0, "y": 0, "zoom": 1}
        return data

    @staticmethod
    def _node_from_row(row: dict) -> dict:
        return dict(row)

    @staticmethod
    def _edge_from_row(row: dict) -> dict:
        data = dict(row)
        try:
            data["style"] = json.loads(data.pop("style_json") or "{}")
        except json.JSONDecodeError:
            data["style"] = {}
        return data
