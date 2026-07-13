import json

from app.database import get_conn, utc_now


class GraphConflictError(ValueError):
    pass


class InspirationService:
    def list_cards(self, project_id: int, search: str = "", card_type: str = "") -> list[dict]:
        clauses = ["project_id = %s"]
        params: list[object] = [project_id]
        if card_type.strip():
            clauses.append("card_type = %s")
            params.append(card_type.strip())
        if search.strip():
            clauses.append("(title LIKE %s OR content LIKE %s OR tags_json LIKE %s)")
            wildcard = f"%{search.strip()}%"
            params.extend([wildcard, wildcard, wildcard])
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                f"""
                SELECT id, project_id, card_type, title, content, tags_json, color, origin, created_at, updated_at
                FROM inspiration_cards WHERE {' AND '.join(clauses)}
                ORDER BY updated_at DESC, id DESC
                """,
                tuple(params),
            )
            return [self._card_from_row(row) for row in c.fetchall()]

    def create_card(self, project_id: int, payload: dict, origin: str = "manual") -> dict:
        now = utc_now()
        title = self._clean_title(payload.get("title"), "title")
        with get_conn() as conn:
            c = conn.cursor()
            self._ensure_project(c, project_id)
            c.execute(
                """
                INSERT INTO inspiration_cards
                (project_id, card_type, title, content, tags_json, color, origin, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    project_id,
                    self._clean_short_text(payload.get("card_type"), "idea", 64),
                    title,
                    payload.get("content", "").strip(),
                    json.dumps(self._clean_tags(payload.get("tags", [])), ensure_ascii=False),
                    self._clean_short_text(payload.get("color"), "amber", 32),
                    origin,
                    now,
                    now,
                ),
            )
            card_id = c.lastrowid
            c.execute("SELECT * FROM inspiration_cards WHERE id = %s", (card_id,))
            return self._card_from_row(c.fetchone())

    def update_card(self, project_id: int, card_id: int, payload: dict) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            card = self._ensure_card(c, project_id, card_id)
            fields: list[str] = []
            params: list[object] = []
            if payload.get("title") is not None:
                fields.append("title = %s")
                params.append(self._clean_title(payload["title"], "title"))
            if payload.get("card_type") is not None:
                fields.append("card_type = %s")
                params.append(self._clean_short_text(payload["card_type"], "idea", 64))
            if payload.get("content") is not None:
                fields.append("content = %s")
                params.append(payload["content"].strip())
            if payload.get("tags") is not None:
                fields.append("tags_json = %s")
                params.append(json.dumps(self._clean_tags(payload["tags"]), ensure_ascii=False))
            if payload.get("color") is not None:
                fields.append("color = %s")
                params.append(self._clean_short_text(payload["color"], "amber", 32))
            if not fields:
                return self._card_from_row(card)
            fields.append("updated_at = %s")
            params.append(utc_now())
            params.append(card_id)
            c.execute(f"UPDATE inspiration_cards SET {', '.join(fields)} WHERE id = %s", tuple(params))
            c.execute("SELECT * FROM inspiration_cards WHERE id = %s", (card_id,))
            return self._card_from_row(c.fetchone())

    def delete_card(self, project_id: int, card_id: int) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            self._ensure_card(c, project_id, card_id)
            c.execute("SELECT id FROM inspiration_board_nodes WHERE card_id = %s", (card_id,))
            node_ids = [row["id"] for row in c.fetchall()]
            if node_ids:
                placeholders = ", ".join(["%s"] * len(node_ids))
                c.execute(
                    f"DELETE FROM inspiration_board_edges WHERE source_node_id IN ({placeholders}) OR target_node_id IN ({placeholders})",
                    tuple(node_ids + node_ids),
                )
                c.execute(f"DELETE FROM inspiration_board_nodes WHERE id IN ({placeholders})", tuple(node_ids))
            c.execute("DELETE FROM inspiration_cards WHERE id = %s", (card_id,))
        return {"card_id": card_id, "deleted": True}

    def list_boards(self, project_id: int) -> list[dict]:
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                SELECT b.*, COUNT(n.id) AS node_count
                FROM inspiration_boards b
                LEFT JOIN inspiration_board_nodes n ON n.board_id = b.id
                WHERE b.project_id = %s
                GROUP BY b.id
                ORDER BY b.updated_at DESC, b.id DESC
                """,
                (project_id,),
            )
            return [self._board_from_row(row) for row in c.fetchall()]

    def create_board(self, project_id: int, payload: dict) -> dict:
        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            self._ensure_project(c, project_id)
            c.execute(
                """
                INSERT INTO inspiration_boards
                (project_id, title, description, viewport_json, graph_version, created_at, updated_at)
                VALUES (%s, %s, %s, %s, 1, %s, %s)
                """,
                (
                    project_id,
                    self._clean_title(payload.get("title"), "title"),
                    payload.get("description", "").strip(),
                    json.dumps({"x": 0, "y": 0, "zoom": 1}),
                    now,
                    now,
                ),
            )
            board_id = c.lastrowid
            c.execute("SELECT * FROM inspiration_boards WHERE id = %s", (board_id,))
            return self._board_from_row(c.fetchone())

    def update_board(self, project_id: int, board_id: int, payload: dict) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            board = self._ensure_board(c, project_id, board_id)
            fields: list[str] = []
            params: list[object] = []
            if payload.get("title") is not None:
                fields.append("title = %s")
                params.append(self._clean_title(payload["title"], "title"))
            if payload.get("description") is not None:
                fields.append("description = %s")
                params.append(payload["description"].strip())
            if not fields:
                return self._board_from_row(board)
            fields.append("updated_at = %s")
            params.extend([utc_now(), board_id])
            c.execute(f"UPDATE inspiration_boards SET {', '.join(fields)} WHERE id = %s", tuple(params))
            c.execute("SELECT * FROM inspiration_boards WHERE id = %s", (board_id,))
            return self._board_from_row(c.fetchone())

    def delete_board(self, project_id: int, board_id: int) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            self._ensure_board(c, project_id, board_id)
            c.execute("DELETE FROM inspiration_board_edges WHERE board_id = %s", (board_id,))
            c.execute("DELETE FROM inspiration_board_nodes WHERE board_id = %s", (board_id,))
            c.execute("DELETE FROM inspiration_board_chat_sessions WHERE board_id = %s", (board_id,))
            c.execute("DELETE FROM inspiration_ai_proposals WHERE board_id = %s", (board_id,))
            c.execute("DELETE FROM inspiration_boards WHERE id = %s", (board_id,))
        return {"board_id": board_id, "deleted": True}

    def get_board_graph(self, project_id: int, board_id: int) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            board = self._ensure_board(c, project_id, board_id)
            c.execute("SELECT * FROM inspiration_board_nodes WHERE board_id = %s ORDER BY z_index, id", (board_id,))
            nodes = [self._node_from_row(row) for row in c.fetchall()]
            c.execute("SELECT * FROM inspiration_board_edges WHERE board_id = %s ORDER BY id", (board_id,))
            edges = [self._edge_from_row(row) for row in c.fetchall()]
        return {**self._board_from_row(board), "nodes": nodes, "edges": edges}

    def patch_graph(self, project_id: int, board_id: int, payload: dict) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            board = self._ensure_board(c, project_id, board_id)
            if board["graph_version"] != payload["expected_graph_version"]:
                raise GraphConflictError("画板已在其他操作中更新，请重新加载后再保存")

            deleted_node_ids = list(set(payload.get("deleted_node_ids", [])))
            deleted_edge_ids = list(set(payload.get("deleted_edge_ids", [])))
            if deleted_node_ids:
                placeholders = ", ".join(["%s"] * len(deleted_node_ids))
                c.execute(
                    f"DELETE FROM inspiration_board_edges WHERE board_id = %s AND (source_node_id IN ({placeholders}) OR target_node_id IN ({placeholders}))",
                    tuple([board_id] + deleted_node_ids + deleted_node_ids),
                )
                c.execute(
                    f"DELETE FROM inspiration_board_nodes WHERE board_id = %s AND id IN ({placeholders})",
                    tuple([board_id] + deleted_node_ids),
                )
            if deleted_edge_ids:
                placeholders = ", ".join(["%s"] * len(deleted_edge_ids))
                c.execute(
                    f"DELETE FROM inspiration_board_edges WHERE board_id = %s AND id IN ({placeholders})",
                    tuple([board_id] + deleted_edge_ids),
                )

            now = utc_now()
            for node in payload.get("nodes", []):
                self._validate_node(c, project_id, board_id, node)
                c.execute("SELECT id FROM inspiration_board_nodes WHERE id = %s", (node["id"],))
                existing = c.fetchone()
                values = (
                    board_id,
                    node.get("card_id"),
                    node["node_type"],
                    node.get("position_x", 0),
                    node.get("position_y", 0),
                    node.get("width"),
                    node.get("height"),
                    node.get("z_index", 0),
                    json.dumps(node.get("data", {}), ensure_ascii=False),
                    now,
                )
                if existing:
                    c.execute(
                        """
                        UPDATE inspiration_board_nodes
                        SET board_id = %s, card_id = %s, node_type = %s, position_x = %s, position_y = %s,
                            width = %s, height = %s, z_index = %s, data_json = %s, updated_at = %s
                        WHERE id = %s
                        """,
                        values + (node["id"],),
                    )
                else:
                    c.execute(
                        """
                        INSERT INTO inspiration_board_nodes
                        (board_id, card_id, node_type, position_x, position_y, width, height, z_index, data_json, created_at, updated_at, id)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        values + (now, node["id"]),
                    )

            for edge in payload.get("edges", []):
                self._validate_edge_nodes(c, board_id, edge)
                c.execute("SELECT id FROM inspiration_board_edges WHERE id = %s", (edge["id"],))
                existing = c.fetchone()
                values = (
                    board_id,
                    edge["source_node_id"],
                    edge["target_node_id"],
                    self._clean_short_text(edge.get("edge_type"), "relation", 32),
                    self._clean_short_text(edge.get("label"), "", 255),
                    json.dumps(edge.get("style", {}), ensure_ascii=False),
                    now,
                )
                if existing:
                    c.execute(
                        """
                        UPDATE inspiration_board_edges
                        SET board_id = %s, source_node_id = %s, target_node_id = %s, edge_type = %s,
                            label = %s, style_json = %s, updated_at = %s
                        WHERE id = %s
                        """,
                        values + (edge["id"],),
                    )
                else:
                    c.execute(
                        """
                        INSERT INTO inspiration_board_edges
                        (board_id, source_node_id, target_node_id, edge_type, label, style_json, created_at, updated_at, id)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        values + (now, edge["id"]),
                    )

            next_version = board["graph_version"] + 1
            viewport = payload.get("viewport") or {"x": 0, "y": 0, "zoom": 1}
            c.execute(
                """
                UPDATE inspiration_boards
                SET viewport_json = %s, graph_version = %s, updated_at = %s
                WHERE id = %s
                """,
                (json.dumps(viewport), next_version, now, board_id),
            )
        return self.get_board_graph(project_id, board_id)

    def create_proposal(self, project_id: int, board_id: int, assistant_message_id: int | None, payload: dict) -> dict:
        self._validate_proposal_actions(payload["actions"])
        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            board = self._ensure_board(c, project_id, board_id)
            if board["graph_version"] != payload["base_graph_version"]:
                raise GraphConflictError("画板已更新，无法为旧版本创建提案")
            c.execute(
                """
                INSERT INTO inspiration_ai_proposals
                (project_id, board_id, assistant_message_id, base_graph_version, actions_json, status, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, 'draft', %s, %s)
                """,
                (project_id, board_id, assistant_message_id, board["graph_version"], json.dumps(payload["actions"], ensure_ascii=False), now, now),
            )
            proposal_id = c.lastrowid
            c.execute("SELECT * FROM inspiration_ai_proposals WHERE id = %s", (proposal_id,))
            return self._proposal_from_row(c.fetchone())

    def apply_proposal(self, project_id: int, proposal_id: int) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            proposal = self._ensure_proposal(c, project_id, proposal_id)
            if proposal["status"] != "draft":
                raise ValueError("提案已经处理")
            board = self._ensure_board(c, project_id, proposal["board_id"])
            if board["graph_version"] != proposal["base_graph_version"]:
                raise GraphConflictError("画板已更新，请重新生成提案")
            actions = json.loads(proposal["actions_json"])
            self._validate_proposal_actions(actions)
            created_cards: list[dict] = []
            new_nodes: list[dict] = []
            for action in actions:
                if action["action_type"] != "create_card":
                    continue
                card = self._insert_card(c, project_id, action["card"], "ai")
                created_cards.append(card)
                node_id = f"proposal-card-{card['id']}"
                c.execute(
                    """
                    INSERT INTO inspiration_board_nodes
                    (id, board_id, card_id, node_type, position_x, position_y, width, height, z_index, data_json, created_at, updated_at)
                    VALUES (%s, %s, %s, 'card', %s, %s, NULL, NULL, 0, %s, %s, %s)
                    """,
                    (node_id, board["id"], card["id"], 80 + len(new_nodes) * 40, 80 + len(new_nodes) * 40, "{}", utc_now(), utc_now()),
                )
                new_nodes.append({"id": node_id, "card_id": card["id"]})
            for action in actions:
                if action["action_type"] != "create_edge":
                    continue
                self._validate_edge_nodes(c, board["id"], action)
                edge_id = f"proposal-edge-{proposal_id}-{len(new_nodes)}-{action['source_node_id'][:12]}"
                c.execute(
                    """
                    INSERT INTO inspiration_board_edges
                    (id, board_id, source_node_id, target_node_id, edge_type, label, style_json, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, 'relation', %s, '{}', %s, %s)
                    """,
                    (edge_id, board["id"], action["source_node_id"], action["target_node_id"], action.get("label", ""), utc_now(), utc_now()),
                )
            now = utc_now()
            c.execute("UPDATE inspiration_ai_proposals SET status = 'applied', updated_at = %s WHERE id = %s", (now, proposal_id))
            c.execute("UPDATE inspiration_boards SET graph_version = graph_version + 1, updated_at = %s WHERE id = %s", (now, board["id"]))
        return {"proposal_id": proposal_id, "status": "applied", "created_cards": created_cards, "graph": self.get_board_graph(project_id, proposal["board_id"])}

    def dismiss_proposal(self, project_id: int, proposal_id: int) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            proposal = self._ensure_proposal(c, project_id, proposal_id)
            if proposal["status"] != "draft":
                raise ValueError("提案已经处理")
            c.execute("UPDATE inspiration_ai_proposals SET status = 'dismissed', updated_at = %s WHERE id = %s", (utc_now(), proposal_id))
        return {"proposal_id": proposal_id, "status": "dismissed"}

    def build_discussion_context(self, project_id: int, board_id: int, selected_node_ids: list[str]) -> dict:
        graph = self.get_board_graph(project_id, board_id)
        selected = set(selected_node_ids)
        nodes = [node for node in graph["nodes"] if not selected or node["id"] in selected]
        card_ids = [node["card_id"] for node in nodes if node.get("card_id")]
        cards_by_id: dict[int, dict] = {}
        if card_ids:
            placeholders = ", ".join(["%s"] * len(card_ids))
            with get_conn() as conn:
                c = conn.cursor()
                c.execute(
                    f"SELECT * FROM inspiration_cards WHERE project_id = %s AND id IN ({placeholders})",
                    tuple([project_id] + card_ids),
                )
                cards_by_id = {row["id"]: self._card_from_row(row) for row in c.fetchall()}
        return {
            "boardId": graph["id"],
            "boardTitle": graph["title"],
            "graphVersion": graph["graph_version"],
            "selectedNodeIds": selected_node_ids,
            "nodes": nodes,
            "edges": graph["edges"],
            "cards": [
                {**card, "content": card["content"][:1200] + ("…" if len(card["content"]) > 1200 else "")}
                for card in cards_by_id.values()
            ],
        }

    def get_or_create_board_chat_session(self, project_id: int, board_id: int, create_session) -> int:
        with get_conn() as conn:
            c = conn.cursor()
            self._ensure_board(c, project_id, board_id)
            c.execute("SELECT chat_session_id FROM inspiration_board_chat_sessions WHERE board_id = %s", (board_id,))
            row = c.fetchone()
            if row:
                return row["chat_session_id"]
        session = create_session(project_id, "灵感讨论")
        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(
                """
                INSERT INTO inspiration_board_chat_sessions (board_id, chat_session_id, created_at, updated_at)
                VALUES (%s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)
                """,
                (board_id, session["id"], now, now),
            )
            c.execute("SELECT chat_session_id FROM inspiration_board_chat_sessions WHERE board_id = %s", (board_id,))
            return c.fetchone()["chat_session_id"]

    def _insert_card(self, c, project_id: int, payload: dict, origin: str) -> dict:
        now = utc_now()
        c.execute(
            """
            INSERT INTO inspiration_cards
            (project_id, card_type, title, content, tags_json, color, origin, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                project_id,
                self._clean_short_text(payload.get("card_type"), "idea", 64),
                self._clean_title(payload.get("title"), "title"),
                payload.get("content", "").strip(),
                json.dumps(self._clean_tags(payload.get("tags", [])), ensure_ascii=False),
                self._clean_short_text(payload.get("color"), "amber", 32),
                origin,
                now,
                now,
            ),
        )
        c.execute("SELECT * FROM inspiration_cards WHERE id = %s", (c.lastrowid,))
        return self._card_from_row(c.fetchone())

    def _ensure_project(self, c, project_id: int) -> dict:
        c.execute("SELECT id FROM projects WHERE id = %s", (project_id,))
        row = c.fetchone()
        if not row:
            raise ValueError(f"project_id={project_id} 不存在")
        return row

    def _ensure_card(self, c, project_id: int, card_id: int) -> dict:
        c.execute("SELECT * FROM inspiration_cards WHERE id = %s AND project_id = %s", (card_id, project_id))
        row = c.fetchone()
        if not row:
            raise ValueError(f"card_id={card_id} 不属于当前 project_id")
        return row

    def _ensure_board(self, c, project_id: int, board_id: int) -> dict:
        c.execute("SELECT * FROM inspiration_boards WHERE id = %s AND project_id = %s", (board_id, project_id))
        row = c.fetchone()
        if not row:
            raise ValueError(f"board_id={board_id} 不属于当前 project_id")
        return row

    def _ensure_proposal(self, c, project_id: int, proposal_id: int) -> dict:
        c.execute("SELECT * FROM inspiration_ai_proposals WHERE id = %s AND project_id = %s", (proposal_id, project_id))
        row = c.fetchone()
        if not row:
            raise ValueError(f"proposal_id={proposal_id} 不属于当前 project_id")
        return row

    def _validate_node(self, c, project_id: int, board_id: int, node: dict) -> None:
        if node["node_type"] == "card":
            if not node.get("card_id"):
                raise ValueError("卡片节点必须关联 card_id")
            self._ensure_card(c, project_id, node["card_id"])
        elif node.get("card_id"):
            raise ValueError("轻量节点不能关联 card_id")
        c.execute("SELECT board_id FROM inspiration_board_nodes WHERE id = %s", (node["id"],))
        existing = c.fetchone()
        if existing and existing["board_id"] != board_id:
            raise ValueError("节点不能跨画板移动")

    def _validate_edge_nodes(self, c, board_id: int, edge: dict) -> None:
        if edge["source_node_id"] == edge["target_node_id"]:
            raise ValueError("连线不能连接到自身")
        c.execute(
            "SELECT id FROM inspiration_board_nodes WHERE board_id = %s AND id IN (%s, %s)",
            (board_id, edge["source_node_id"], edge["target_node_id"]),
        )
        if len(c.fetchall()) != 2:
            raise ValueError("连线两端节点必须属于当前画板")

    def _validate_proposal_actions(self, actions: list[dict]) -> None:
        for action in actions:
            action_type = action.get("action_type")
            if action_type == "create_card":
                if not action.get("card"):
                    raise ValueError("创建卡片提案缺少 card")
            elif action_type == "create_edge":
                if not action.get("source_node_id") or not action.get("target_node_id"):
                    raise ValueError("创建连线提案缺少节点")
            else:
                raise ValueError("提案包含不支持的操作")

    @staticmethod
    def _clean_short_text(value: object, fallback: str, limit: int) -> str:
        text = str(value or "").strip() or fallback
        return text[:limit]

    @staticmethod
    def _clean_title(value: object, name: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise ValueError(f"{name} 不能为空")
        return text[:255]

    @staticmethod
    def _clean_tags(tags: object) -> list[str]:
        if not isinstance(tags, list):
            raise ValueError("tags 必须是数组")
        return list(dict.fromkeys(str(tag).strip()[:64] for tag in tags if str(tag).strip()))[:20]

    @staticmethod
    def _card_from_row(row: dict) -> dict:
        data = dict(row)
        try:
            data["tags"] = json.loads(data.pop("tags_json") or "[]")
        except json.JSONDecodeError:
            data["tags"] = []
        return data

    @staticmethod
    def _board_from_row(row: dict) -> dict:
        data = dict(row)
        try:
            data["viewport"] = json.loads(data.pop("viewport_json") or "{}")
        except json.JSONDecodeError:
            data["viewport"] = {"x": 0, "y": 0, "zoom": 1}
        return data

    @staticmethod
    def _node_from_row(row: dict) -> dict:
        data = dict(row)
        try:
            data["data"] = json.loads(data.pop("data_json") or "{}")
        except json.JSONDecodeError:
            data["data"] = {}
        return data

    @staticmethod
    def _edge_from_row(row: dict) -> dict:
        data = dict(row)
        try:
            data["style"] = json.loads(data.pop("style_json") or "{}")
        except json.JSONDecodeError:
            data["style"] = {}
        return data

    @staticmethod
    def _proposal_from_row(row: dict) -> dict:
        data = dict(row)
        try:
            data["actions"] = json.loads(data.pop("actions_json") or "[]")
        except json.JSONDecodeError:
            data["actions"] = []
        return data
