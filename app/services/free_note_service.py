import json

from app.database import get_conn, utc_now


class FreeNoteService:
    _TABLES = {"free_notes": ("title", "content"), "prompt_templates": ("name", "content")}

    def list_items(self, project_id: int, kind: str, search: str = "", tags: str = "", item_type: str = "", applies_to: str = "", pinned: bool | None = None) -> list[dict]:
        table = self._table(kind)
        name_column, _ = self._TABLES[table]
        clauses = ["project_id = %s"]
        params: list[object] = [project_id]
        if search.strip():
            wildcard = f"%{search.strip()}%"
            clauses.append(f"({name_column} LIKE %s OR content LIKE %s OR tags_json LIKE %s)")
            params.extend([wildcard, wildcard, wildcard])
        if tags.strip():
            for tag in self._clean_tags(tags.split(",")):
                clauses.append("tags_json LIKE %s")
                params.append(f'%"{tag}"%')
        if table == "free_notes" and item_type:
            clauses.append("note_type = %s")
            params.append(item_type)
        if table == "prompt_templates" and applies_to:
            clauses.append("(applies_to = %s OR applies_to = 'all')")
            params.append(applies_to)
        if table == "prompt_templates" and pinned is not None:
            clauses.append("is_pinned = %s")
            params.append(pinned)
        with get_conn() as conn:
            c = conn.cursor()
            self._ensure_project(c, project_id)
            sort = "is_pinned DESC, last_used_at DESC, updated_at DESC, id DESC" if table == "prompt_templates" else "updated_at DESC, id DESC"
            c.execute(f'SELECT * FROM {table} WHERE {" AND ".join(clauses)} ORDER BY {sort}', tuple(params))
            return [self._from_row(row) for row in c.fetchall()]

    def get_item(self, project_id: int, kind: str, item_id: int) -> dict:
        table = self._table(kind)
        with get_conn() as conn:
            c = conn.cursor()
            c.execute(f'SELECT * FROM "{table}" WHERE id = %s AND project_id = %s', (item_id, project_id))
            row = c.fetchone()
            if not row:
                raise ValueError(f"{kind}_id={item_id} 不属于当前 project_id")
            return self._from_row(row)

    def create_item(self, project_id: int, kind: str, payload: dict) -> dict:
        table = self._table(kind)
        name_column, _ = self._TABLES[table]
        name = self._required(payload.get(name_column), name_column)
        content = self._required(payload.get("content"), "content")
        now = utc_now()
        with get_conn() as conn:
            c = conn.cursor()
            self._ensure_project(c, project_id)
            columns = ["project_id", name_column, "content", "tags_json"]
            values: list[object] = [project_id, name, content, json.dumps(self._clean_tags(payload.get("tags", [])), ensure_ascii=False)]
            if table == "free_notes":
                columns.append("note_type")
                values.append(payload.get("note_type", "note"))
            else:
                columns.extend(["applies_to", "is_pinned"])
                values.extend([payload.get("applies_to", "all"), payload.get("is_pinned", False)])
            columns.extend(["created_at", "updated_at"])
            values.extend([now, now])
            placeholders = ", ".join(["%s"] * len(columns))
            c.execute(f'INSERT INTO "{table}" ({", ".join(columns)}) VALUES ({placeholders})', tuple(values))
            c.execute(f'SELECT * FROM "{table}" WHERE id = %s', (c.lastrowid,))
            return self._from_row(c.fetchone())

    def update_item(self, project_id: int, kind: str, item_id: int, payload: dict) -> dict:
        table = self._table(kind)
        name_column, _ = self._TABLES[table]
        with get_conn() as conn:
            c = conn.cursor()
            self._ensure_item(c, project_id, kind, item_id)
            fields: list[str] = []
            params: list[object] = []
            if payload.get(name_column) is not None:
                fields.append(f"{name_column} = %s")
                params.append(self._required(payload[name_column], name_column))
            if payload.get("content") is not None:
                fields.append("content = %s")
                params.append(self._required(payload["content"], "content"))
            if table == "free_notes" and payload.get("note_type") is not None:
                fields.append("note_type = %s")
                params.append(payload["note_type"])
            if payload.get("tags") is not None:
                fields.append("tags_json = %s")
                params.append(json.dumps(self._clean_tags(payload["tags"]), ensure_ascii=False))
            if table == "prompt_templates":
                if payload.get("applies_to") is not None:
                    fields.append("applies_to = %s")
                    params.append(payload["applies_to"])
                if payload.get("is_pinned") is not None:
                    fields.append("is_pinned = %s")
                    params.append(payload["is_pinned"])
            if fields:
                fields.append("updated_at = %s")
                params.extend([utc_now(), item_id])
                c.execute(f'UPDATE "{table}" SET {", ".join(fields)} WHERE id = %s', tuple(params))
            c.execute(f'SELECT * FROM "{table}" WHERE id = %s AND project_id = %s', (item_id, project_id))
            return self._from_row(c.fetchone())

    def delete_item(self, project_id: int, kind: str, item_id: int) -> dict:
        table = self._table(kind)
        with get_conn() as conn:
            c = conn.cursor()
            self._ensure_item(c, project_id, kind, item_id)
            c.execute(f'DELETE FROM "{table}" WHERE id = %s AND project_id = %s', (item_id, project_id))
        return {"id": item_id, "deleted": True}

    def use_template(self, project_id: int, template_id: int) -> dict:
        with get_conn() as conn:
            c = conn.cursor()
            self._ensure_item(c, project_id, "prompt-template", template_id)
            now = utc_now()
            c.execute("UPDATE prompt_templates SET use_count = use_count + 1, last_used_at = %s, updated_at = %s WHERE id = %s AND project_id = %s", (now, now, template_id, project_id))
            c.execute("SELECT * FROM prompt_templates WHERE id = %s AND project_id = %s", (template_id, project_id))
            return self._from_row(c.fetchone())

    def _table(self, kind: str) -> str:
        table = "free_notes" if kind in {"note", "free-note"} else "prompt_templates" if kind in {"template", "prompt-template"} else ""
        if not table:
            raise ValueError("不支持的资源类型")
        return table

    def _ensure_project(self, c, project_id: int) -> None:
        c.execute("SELECT id FROM projects WHERE id = %s", (project_id,))
        if not c.fetchone():
            raise ValueError(f"project_id={project_id} 不存在")

    def _ensure_item(self, c, project_id: int, kind: str, item_id: int) -> None:
        table = self._table(kind)
        c.execute(f'SELECT id FROM "{table}" WHERE id = %s AND project_id = %s', (item_id, project_id))
        if not c.fetchone():
            raise ValueError(f"{kind}_id={item_id} 不属于当前 project_id")

    @staticmethod
    def _required(value: object, field: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise ValueError(f"{field} 不能为空")
        return text

    @staticmethod
    def _clean_tags(tags: object) -> list[str]:
        if not isinstance(tags, list):
            raise ValueError("tags 必须是数组")
        return list(dict.fromkeys(str(tag).strip()[:64] for tag in tags if str(tag).strip()))[:20]

    @staticmethod
    def _from_row(row: dict) -> dict:
        data = dict(row)
        try:
            data["tags"] = json.loads(data.pop("tags_json") or "[]")
        except (json.JSONDecodeError, TypeError):
            data["tags"] = []
        return data
