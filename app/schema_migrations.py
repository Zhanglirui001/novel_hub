"""Numbered SQLite schema versions. Failed migrations roll back with the startup transaction."""
from app.database import utc_now
from app.version import __version__

CURRENT = 2


def _version(cursor) -> int:
    row = cursor.execute("SELECT MAX(version) AS v FROM schema_migrations").fetchone()
    return int(row["v"] or 0) if row else 0


def current() -> int:
    from app.database import get_conn
    with get_conn() as conn:
        return _version(conn.cursor())


def apply(conn) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL, app_version TEXT NOT NULL)"""
    )
    applied = _version(cursor)
    if applied > CURRENT:
        raise ValueError(f"数据库架构版本 {applied} 高于当前应用支持的 {CURRENT}，请升级应用后再打开此书架")
    for version in range(applied + 1, CURRENT + 1):
        MIGRATIONS[version](conn)
        cursor.execute(
            "INSERT INTO schema_migrations (version, applied_at, app_version) VALUES (%s, %s, %s)",
            (version, utc_now(), __version__),
        )


def migrate_v1(conn) -> None:
    from app.services.history_service import install
    install(conn)


def migrate_v2(conn) -> None:
    cursor = conn.cursor()
    cursor.execute(
        """CREATE TABLE IF NOT EXISTS project_lifecycle (
            project_id INTEGER PRIMARY KEY, archived_at TEXT)"""
    )


MIGRATIONS = {1: migrate_v1, 2: migrate_v2}
