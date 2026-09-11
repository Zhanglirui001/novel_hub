"""Copy a 0.1 launcher library on first Tauri launch; never overwrite either library."""
import os
from pathlib import Path
import sqlite3
import uuid


def import_legacy(target: Path, source: Path) -> bool:
    if target.exists() or not source.is_file() or target.resolve() == source.resolve():
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.parent / f'.legacy-import-{uuid.uuid4().hex}.db'
    src = sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        if not src.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='projects'").fetchone():
            raise ValueError('旧版数据库不是 Novel Hub 书架')
        dst = sqlite3.connect(temporary)
        try:
            src.backup(dst)
            if dst.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                raise ValueError('旧版数据库完整性检查失败')
        finally:
            dst.close()
        # Atomic creation: hard-link fails if a target appeared meanwhile.
        os.link(temporary, target)
        return True
    finally:
        src.close()
        temporary.unlink(missing_ok=True)
