"""Single-project portable archives. Import always creates a new project; IDs are remapped."""
import hashlib
import json
import uuid
from datetime import datetime

from app.database import utc_now
from app.services.library_backup import MAX_BYTES, TABLES, canonical, connect
from app.version import __version__

FORMAT = "novelhub-project"
STRING_PK = {
    "storyline_nodes", "storyline_edges", "inspiration_board_nodes", "inspiration_board_edges",
}
REFS = {
    "project_id": "projects", "chapter_id": "chapters", "template_id": "monthly_fixed_todos",
    "session_id": "chat_sessions", "chat_session_id": "chat_sessions", "graph_id": "storyline_graphs",
    "board_id": "inspiration_boards", "card_id": "inspiration_cards",
    "assistant_message_id": "chat_messages",
}


def _columns(conn, table):
    return [row[1] for row in conn.execute(f'PRAGMA table_info("{table}")')]


def _rows_for(conn, table, project_id):
    columns = set(_columns(conn, table))
    if table == "projects":
        sql = "SELECT * FROM projects WHERE id=?"
    elif "project_id" in columns:
        sql = f'SELECT * FROM "{table}" WHERE project_id=?'
    elif "graph_id" in columns:
        sql = f'SELECT t.* FROM "{table}" t JOIN storyline_graphs g ON g.id=t.graph_id WHERE g.project_id=?'
    elif "board_id" in columns:
        sql = f'SELECT t.* FROM "{table}" t JOIN inspiration_boards b ON b.id=t.board_id WHERE b.project_id=?'
    elif "session_id" in columns:
        sql = f'SELECT t.* FROM "{table}" t JOIN chat_sessions s ON s.id=t.session_id WHERE s.project_id=?'
    else:
        raise ValueError(f"无法导出数据表：{table}")
    return [dict(row) for row in conn.execute(sql, (project_id,))]


def export_project(project_id):
    conn = connect()
    try:
        if not conn.execute("SELECT 1 FROM projects WHERE id=?", (project_id,)).fetchone():
            raise LookupError("作品不存在")
        tables = {table: _rows_for(conn, table, project_id) for table in TABLES}
        payload = {
            "format": FORMAT, "format_version": 1, "app_version": __version__,
            "created_at": utc_now(), "tables": tables,
        }
        payload["sha256"] = hashlib.sha256(canonical(payload)).hexdigest()
        return payload
    finally:
        conn.close()


def decode(raw):
    if len(raw) > MAX_BYTES:
        raise ValueError("备份不能超过 128 MB")
    try:
        data = json.loads(raw)
        if not isinstance(data, dict) or data.get("format") != FORMAT or data.get("format_version") != 1:
            raise ValueError("不支持的作品备份格式或版本")
        digest = data.get("sha256")
        unsigned = {key: value for key, value in data.items() if key != "sha256"}
        if digest != hashlib.sha256(canonical(unsigned)).hexdigest():
            raise ValueError("备份校验失败，文件可能已损坏")
        if not isinstance(data.get("tables"), dict) or set(data["tables"]) != set(TABLES):
            raise ValueError("作品备份缺少必要的数据表")
        projects = data["tables"]["projects"]
        if not isinstance(projects, list) or len(projects) != 1 or not isinstance(projects[0], dict):
            raise ValueError("作品备份必须恰好包含一部作品")
        datetime.fromisoformat(str(data.get("created_at", "")).replace("Z", "+00:00"))
        return data
    except (UnicodeError, json.JSONDecodeError, TypeError, RecursionError) as exc:
        raise ValueError("作品备份无法读取") from exc


def _node_parent(table):
    if table.startswith("storyline"):
        return "storyline_nodes"
    if "inspiration_board" in table:
        return "inspiration_board_nodes"
    return None


def preview(raw):
    payload = decode(raw)
    project = payload["tables"]["projects"][0]
    return {
        "created_at": payload["created_at"], "app_version": payload["app_version"],
        "name": project.get("name") or "未命名作品",
        "chapters": len(payload["tables"]["chapters"]),
        "versions": len(payload["tables"]["chapter_versions"]),
        "sha256": payload["sha256"],
    }


def _remap(incoming, table, maps):
    parent = _node_parent(table)
    try:
        for column, source in REFS.items():
            if incoming.get(column) is not None:
                incoming[column] = maps[source][incoming[column]]
        if parent:
            for column in ("source_node_id", "target_node_id"):
                if incoming.get(column) is not None:
                    incoming[column] = maps[parent][incoming[column]]
    except KeyError as exc:
        raise ValueError(f"作品备份存在断开的数据关联：{table}") from exc


def import_project(raw, expected_sha256):
    payload = decode(raw)
    if payload["sha256"] != expected_sha256:
        raise ValueError("备份已变化，请重新预览")
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        maps = {table: {} for table in TABLES}
        conn.execute("DROP TRIGGER IF EXISTS chapter_history_insert")
        conn.execute("DROP TRIGGER IF EXISTS chapter_history_update")
        for table in TABLES:
            columns = _columns(conn, table)
            pk = "board_id" if table == "inspiration_board_chat_sessions" else "id"
            for row in payload["tables"][table]:
                if not isinstance(row, dict) or set(row) != set(columns):
                    raise ValueError(f"作品备份数据结构与此版本不兼容：{table}")
                incoming = dict(row)
                old_pk = incoming[pk]
                _remap(incoming, table, maps)
                if table in STRING_PK:
                    incoming["id"] = uuid.uuid4().hex
                    maps[table][old_pk] = incoming["id"]
                    conn.execute(
                        f'INSERT INTO "{table}" VALUES ({",".join("?" for _ in columns)})',
                        [incoming[column] for column in columns],
                    )
                elif table == "inspiration_board_chat_sessions":
                    maps[table][old_pk] = incoming["board_id"]
                    conn.execute(
                        f'INSERT INTO "{table}" VALUES ({",".join("?" for _ in columns)})',
                        [incoming[column] for column in columns],
                    )
                else:
                    insert_cols = [column for column in columns if column != "id"]
                    conn.execute(
                        f'INSERT INTO "{table}" ({",".join(insert_cols)}) VALUES ({",".join("?" for _ in insert_cols)})',
                        [incoming[column] for column in insert_cols],
                    )
                    maps[table][old_pk] = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        from app.services.history_service import install
        install(conn)
        conn.commit()
        source = payload["tables"]["projects"][0]
        return {
            "project_id": maps["projects"][source["id"]],
            "name": source["name"],
            "chapters": len(payload["tables"]["chapters"]),
        }
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()
