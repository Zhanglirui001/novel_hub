"""SQLite chapter snapshots, captured in the same transaction as every write."""
from app.database import get_conn, utc_now


def install(conn):
    c = conn.cursor()
    c.execute("""CREATE TABLE IF NOT EXISTS chapter_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, chapter_id INTEGER NOT NULL,
        project_id INTEGER NOT NULL, title TEXT NOT NULL, group_title TEXT NOT NULL,
        content TEXT NOT NULL, sort_order INTEGER NOT NULL, version INTEGER NOT NULL,
        updated_at TEXT NOT NULL, recorded_at TEXT NOT NULL)""")
    c.execute("CREATE INDEX IF NOT EXISTS idx_chapter_versions ON chapter_versions(chapter_id, id)")
    fields = "chapter_id, project_id, title, group_title, content, sort_order, version, updated_at, recorded_at"
    # Seed existing manuscripts once; triggers cover autosave, AI patches and renames.
    c.execute(f"""INSERT INTO chapter_versions ({fields})
        SELECT id, project_id, title, group_title, content, sort_order, version, updated_at, updated_at
        FROM chapters WHERE NOT EXISTS
        (SELECT 1 FROM chapter_versions v WHERE v.chapter_id = chapters.id)""")
    values = "NEW.id, NEW.project_id, NEW.title, NEW.group_title, NEW.content, NEW.sort_order, NEW.version, NEW.updated_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')"
    c.execute(f"""CREATE TRIGGER IF NOT EXISTS chapter_history_insert AFTER INSERT ON chapters
        BEGIN INSERT INTO chapter_versions ({fields}) VALUES ({values}); END""")
    c.execute(f"""CREATE TRIGGER IF NOT EXISTS chapter_history_update AFTER UPDATE ON chapters
        WHEN OLD.content IS NOT NEW.content OR OLD.title IS NOT NEW.title
          OR OLD.group_title IS NOT NEW.group_title OR OLD.sort_order IS NOT NEW.sort_order
        BEGIN INSERT INTO chapter_versions ({fields}) VALUES ({values}); END""")


def list_versions(chapter_id, limit=100, before=None):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("""SELECT id, chapter_id, title, version, recorded_at, LENGTH(content) AS character_count
            FROM chapter_versions WHERE chapter_id = %s AND (%s IS NULL OR id < %s)
            ORDER BY id DESC LIMIT %s""", (chapter_id, before, before, limit))
        return c.fetchall()


def get_version(chapter_id, version_id):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM chapter_versions WHERE chapter_id = %s AND id = %s", (chapter_id, version_id))
        row = c.fetchone()
        if not row:
            raise LookupError("此历史版本不存在")
        return row


def restore_version(chapter_id, version_id, expected_version, expected_updated_at):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT * FROM chapter_versions WHERE chapter_id = %s AND id = %s", (chapter_id, version_id))
        old = c.fetchone()
        if not old:
            raise LookupError("此历史版本不存在")
        now = utc_now()
        c.execute("""UPDATE chapters SET title=%s, group_title=%s, content=%s,
            version=version+1, updated_at=%s WHERE id=%s AND version=%s AND updated_at=%s""",
            (old['title'], old['group_title'], old['content'], now, chapter_id, expected_version, expected_updated_at))
        if c.rowcount != 1:
            raise ValueError("章节已变化，请重新打开历史记录后重试")
        c.execute("SELECT * FROM chapters WHERE id=%s", (chapter_id,))
        return c.fetchone()
