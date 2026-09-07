from __future__ import annotations

import argparse
import datetime as dt
import decimal
import os
import sqlite3
import sys
from pathlib import Path

import pymysql
from pymysql.cursors import DictCursor

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import config
from app.database import init_db


def normalize(value):
    if isinstance(value, (dt.date, dt.datetime, dt.time)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    return value


def migrate(target: Path) -> tuple[int, int]:
    target = target.resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    os.environ["DATABASE_BACKEND"] = "sqlite"
    os.environ["SQLITE_PATH"] = str(target)

    # Settings are loaded at import time, so update the frozen instance for this utility.
    object.__setattr__(config.settings, "database_backend", "sqlite")
    object.__setattr__(config.settings, "sqlite_path", str(target))
    init_db()

    source = pymysql.connect(
        host=config.settings.mysql_host,
        port=config.settings.mysql_port,
        user=config.settings.mysql_user,
        password=config.settings.mysql_password,
        database=config.settings.mysql_database,
        charset=config.settings.mysql_charset,
        cursorclass=DictCursor,
    )
    destination = sqlite3.connect(target)
    copied_tables = 0
    copied_rows = 0
    try:
        target_tables = {
            row[0]
            for row in destination.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        with source.cursor() as cursor:
            cursor.execute("SHOW TABLES")
            source_tables = {next(iter(row.values())) for row in cursor.fetchall()}
            for table in sorted(target_tables & source_tables):
                target_columns = [row[1] for row in destination.execute(f"PRAGMA table_info(`{table}`)")]
                cursor.execute(f"SELECT * FROM `{table}`")
                rows = cursor.fetchall()
                if not rows:
                    continue
                columns = [column for column in target_columns if column in rows[0]]
                quoted = ", ".join(f"`{column}`" for column in columns)
                placeholders = ", ".join("?" for _ in columns)
                sql = f"INSERT OR REPLACE INTO `{table}` ({quoted}) VALUES ({placeholders})"
                values = [tuple(normalize(row[column]) for column in columns) for row in rows]
                destination.executemany(sql, values)
                copied_tables += 1
                copied_rows += len(values)
        destination.commit()
        return copied_tables, copied_rows
    finally:
        destination.close()
        source.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate Novel Hub data from MySQL to SQLite.")
    parser.add_argument("--target", type=Path, required=True)
    args = parser.parse_args()
    tables, rows = migrate(args.target)
    print(f"Migrated {rows} rows from {tables} tables to {args.target.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
