"""章节正文备份到 .txt 文件。

目录结构(人类可读优先):
    <BACKUP_ROOT>/<project_name>/<chapter_title>.txt

文件首行存元数据 JSON(以 # 开头作为注释行,便于直接打开阅读):
    # {"chapter_id": 12, "version": 3, "sha1": "ab12cd34ef", "backed_up_at": "..."}

并发安全:用一把全局锁保护索引读写,文件 I/O 量级单机够用。
项目改名/章节改名感知:用 <BACKUP_ROOT>/.index.json 与每个项目下的
.chapters.json 维护 id→当前目录名/文件名 的映射,改名时重命名磁盘条目而不是
留下两份。
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
from pathlib import Path

from app.database import get_conn, utc_now


_LOCK = threading.Lock()
_INVALID_CHARS = re.compile(r'[\\/:*?"<>|\r\n\t]')


def _backup_root() -> Path:
    env = os.getenv("BACKUP_DIR")
    if env:
        return Path(env).resolve()
    # app/services/backup_service.py → 仓库根
    return (Path(__file__).resolve().parent.parent.parent / "backups").resolve()


def _safe(name: str, fallback: str) -> str:
    cleaned = _INVALID_CHARS.sub("_", name).strip().strip(".")
    cleaned = cleaned[:80] or fallback
    return cleaned


def _index_path(root: Path) -> Path:
    return root / ".index.json"


def _read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def _write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _unique_name(parent: Path, desired: str, suffix: str, exclude: Path | None) -> str:
    """在 parent 下找一个唯一的 desired+suffix;若 desired 已被别的文件/目录占用,
    追加 (2) (3) … 后缀。exclude 是当前条目本身,会被忽略掉。"""
    candidate = f"{desired}{suffix}"
    target = parent / candidate
    n = 2
    while target.exists() and (exclude is None or target.resolve() != exclude.resolve()):
        candidate = f"{desired} ({n}){suffix}"
        target = parent / candidate
        n += 1
    return candidate


def _resolve_project_dir(root: Path, project_id: int, project_name: str) -> Path:
    """根据 project_id 找出当前应该使用的目录。改名时会把磁盘目录一并改掉。"""
    root.mkdir(parents=True, exist_ok=True)
    index = _read_json(_index_path(root))
    desired = _safe(project_name, fallback=f"project-{project_id}")
    key = str(project_id)
    current_dir_name = index.get(key)

    if current_dir_name:
        current = root / current_dir_name
        if current_dir_name == desired and current.exists():
            return current
        # 改名:确定新目录名,把现有目录搬过去
        new_dir_name = _unique_name(root, desired, suffix="", exclude=current if current.exists() else None)
        new_path = root / new_dir_name
        if current.exists() and current != new_path:
            current.rename(new_path)
            index[key] = new_dir_name
            _write_json(_index_path(root), index)
            return new_path
        if not current.exists():
            new_path.mkdir(parents=True, exist_ok=True)
            index[key] = new_dir_name
            _write_json(_index_path(root), index)
            return new_path
        return current

    # 新项目目录
    new_dir_name = _unique_name(root, desired, suffix="", exclude=None)
    new_path = root / new_dir_name
    new_path.mkdir(parents=True, exist_ok=True)
    index[key] = new_dir_name
    _write_json(_index_path(root), index)
    return new_path


def _chapters_index_path(proj_dir: Path) -> Path:
    return proj_dir / ".chapters.json"


def _resolve_chapter_path(
    proj_dir: Path, chapter_id: int, chapter_title: str,
) -> tuple[Path, dict, str]:
    """返回 (目标文件路径, chapters_index 副本, 索引 key)。改名时会把旧文件搬过去。"""
    index = _read_json(_chapters_index_path(proj_dir))
    desired = _safe(chapter_title, fallback=f"chapter-{chapter_id}")
    key = str(chapter_id)
    current_name = index.get(key)
    current = proj_dir / current_name if current_name else None

    if current and current.exists():
        if current_name == f"{desired}.txt":
            return current, index, key
        new_name = _unique_name(proj_dir, desired, suffix=".txt", exclude=current)
        new_path = proj_dir / new_name
        current.rename(new_path)
        index[key] = new_name
        return new_path, index, key

    new_name = _unique_name(proj_dir, desired, suffix=".txt", exclude=None)
    return proj_dir / new_name, index, key


def _sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


def _read_header(path: Path) -> dict | None:
    try:
        with path.open("r", encoding="utf-8") as f:
            first = f.readline().strip()
    except OSError:
        return None
    if not first.startswith("#"):
        return None
    try:
        return json.loads(first.lstrip("#").strip())
    except json.JSONDecodeError:
        return None


def _fetch_chapter(chapter_id: int) -> dict | None:
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            """
            SELECT c.id, c.project_id, c.title, c.content, c.version, p.name AS project_name
            FROM chapters c JOIN projects p ON p.id = c.project_id
            WHERE c.id = %s
            """,
            (chapter_id,),
        )
        return c.fetchone()


def backup_chapter(chapter_id: int) -> dict:
    ch = _fetch_chapter(chapter_id)
    if not ch:
        raise ValueError(f"chapter_id={chapter_id} 不存在")

    root = _backup_root()
    sha = _sha1(ch["content"])
    now = utc_now()
    header = {
        "chapter_id": ch["id"],
        "project_id": ch["project_id"],
        "version": ch["version"],
        "sha1": sha,
        "backed_up_at": now,
    }
    body = "# " + json.dumps(header, ensure_ascii=False) + "\n" + ch["content"]

    with _LOCK:
        proj_dir = _resolve_project_dir(root, ch["project_id"], ch["project_name"])
        path, index, key = _resolve_chapter_path(proj_dir, ch["id"], ch["title"])
        path.write_text(body, encoding="utf-8")
        index[key] = path.name
        _write_json(_chapters_index_path(proj_dir), index)

    return {
        "status": "up_to_date",
        "path": str(path.relative_to(root.parent)) if path.is_relative_to(root.parent) else str(path),
        "version": ch["version"],
        "sha1": sha,
        "backed_up_at": now,
    }


def get_status(chapter_id: int) -> dict:
    ch = _fetch_chapter(chapter_id)
    if not ch:
        raise ValueError(f"chapter_id={chapter_id} 不存在")

    root = _backup_root()
    if not root.exists():
        return {"status": "not_backed_up", "version": ch["version"]}

    with _LOCK:
        index = _read_json(_index_path(root))
        proj_dir_name = index.get(str(ch["project_id"]))
        if not proj_dir_name:
            return {"status": "not_backed_up", "version": ch["version"]}
        proj_dir = root / proj_dir_name
        if not proj_dir.exists():
            return {"status": "not_backed_up", "version": ch["version"]}
        chapters_index = _read_json(_chapters_index_path(proj_dir))
        file_name = chapters_index.get(str(ch["id"]))
        if not file_name:
            return {"status": "not_backed_up", "version": ch["version"]}
        path = proj_dir / file_name
        if not path.exists():
            return {"status": "not_backed_up", "version": ch["version"]}
        header = _read_header(path)

    cur_sha = _sha1(ch["content"])
    if header and header.get("sha1") == cur_sha:
        return {
            "status": "up_to_date",
            "path": str(path.relative_to(root.parent)) if path.is_relative_to(root.parent) else str(path),
            "version": ch["version"],
            "backed_up_version": header.get("version"),
            "backed_up_at": header.get("backed_up_at"),
            "sha1": cur_sha,
        }
    return {
        "status": "stale",
        "path": str(path.relative_to(root.parent)) if path.is_relative_to(root.parent) else str(path),
        "version": ch["version"],
        "backed_up_version": header.get("version") if header else None,
        "backed_up_at": header.get("backed_up_at") if header else None,
        "sha1": cur_sha,
    }
