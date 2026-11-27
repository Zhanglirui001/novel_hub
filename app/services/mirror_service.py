"""保存即落盘：把数据库里的章节镜像到工作区，不用再靠手动「汇编」。

为什么要有这一层：正文唯一实时保存的地方是 SQLite。以前只有手动执行
`bridge pull` / `bridge assemble` 才会在磁盘上留下文件，忘了这一步，
"成品"就永远停在上一版。现在每次保存 / 重命名 / 移动 / 删除，都会：

  1. 同步该章的 Markdown：`手稿/成品/<卷>/<章>.md`（默认卷则直接放 `成品/`）
  2. 重排整本书：`手稿/成品/完整书稿.md`
  3. 节流导出 Word：`手稿/成品/完整书稿.docx`（每 30 秒最多一次）

镜像文件是单向产物：别直接在里面改，下一次保存会覆盖。
开关：环境变量 NOVEL_HUB_MIRROR=0 可整体关掉（默认开）。
"""
from __future__ import annotations

import logging
import re
import time
from pathlib import Path

from bridge import assemble as asm

from app.database import get_conn

logger = logging.getLogger("novel_hub.mirror")

DOCX_THROTTLE_SECONDS = 30
_last_docx_at: dict[int, float] = {}


def enabled() -> bool:
    import os

    return os.getenv("NOVEL_HUB_MIRROR", "1").strip().lower() not in {"0", "false", "off", "no"}


def workspace_root() -> Path:
    # novel_hub/app/services/mirror_service.py → 上四级是工作区根
    return Path(__file__).resolve().parents[3]


def project_dir(project_name: str) -> Path | None:
    if not project_name:
        return None
    base = workspace_root() / "03-项目沉淀"
    target = base / project_name
    return target if target.is_dir() else None


def _safe(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]', "_", name or "").strip() or "未命名"


def chapter_path(pdir: Path, title: str, group_title: str) -> Path:
    out = pdir / "手稿" / "成品"
    group = (group_title or "").strip()
    if group and group not in {"默认卷", *asm.STAGING_GROUPS}:
        out = out / _safe(group)
    return out / f"{_safe(title)}.md"


def _project(pdir: Path) -> dict:
    return {"name": pdir.name}


def _rows(project_id: int) -> list[dict]:
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            """
            SELECT id, title, group_title, content, sort_order, version, updated_at
            FROM chapters WHERE project_id = %s
            ORDER BY group_title ASC, sort_order ASC, id ASC
            """,
            (project_id,),
        )
        return list(c.fetchall())


def _prepare(rows: list[dict]) -> list[dict]:
    return asm.prepare_chapters(rows)


def write_chapter(project_id: int, project_name: str, chapter: dict, previous: tuple[str, str] | None = None) -> None:
    """写单章镜像；标题或卷名变了就顺手删掉旧文件。"""
    pdir = project_dir(project_name)
    if pdir is None:
        return
    target = chapter_path(pdir, chapter.get("title", ""), chapter.get("group_title", ""))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(chapter.get("content") or "", encoding="utf-8")
    if previous:
        old = chapter_path(pdir, previous[0], previous[1])
        if old != target and old.is_file():
            try:
                old.unlink()
            except OSError:
                logger.warning("旧镜像删不掉: %s", old)


def remove_chapter(project_id: int, project_name: str, title: str, group_title: str) -> None:
    pdir = project_dir(project_name)
    if pdir is None:
        return
    path = chapter_path(pdir, title, group_title)
    if path.is_file():
        try:
            path.unlink()
        except OSError:
            logger.warning("镜像删不掉: %s", path)


def refresh_book(project_id: int, project_name: str, with_docx: bool = True) -> None:
    """重排整本书（固定 Markdown；Word 走节流）。

    没有可收录章节时也要写一份「空书」——否则磁盘上会留着一份含旧正文的过期书稿。
    """
    pdir = project_dir(project_name)
    if pdir is None:
        return
    chapters = _prepare(_rows(project_id))
    groups = asm.order_groups(chapters)
    generated_at = time.strftime("%Y-%m-%d %H:%M")
    out_dir = pdir / "手稿" / "成品"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "完整书稿.md").write_text(
        asm.build_markdown(_project(pdir), groups, generated_at), encoding="utf-8"
    )

    if not chapters:
        # 一章都没有：别留一份含旧正文的 .docx 在目录里冒充成品。
        stale = out_dir / "完整书稿.docx"
        if stale.is_file():
            try:
                stale.unlink()
            except OSError:
                logger.warning("过期 docx 删不掉: %s", stale)
        return

    if not with_docx:
        return
    docx_path = out_dir / "完整书稿.docx"
    now = time.time()
    last = _last_docx_at.get(project_id) or (docx_path.stat().st_mtime if docx_path.is_file() else 0)
    if now - last < DOCX_THROTTLE_SECONDS:
        return
    note = asm.write_docx(docx_path, _project(pdir), groups, generated_at)
    if note == "written":
        _last_docx_at[project_id] = time.time()


def prune_empty_dirs(pdir: Path) -> list[Path]:
    """清掉 成品/ 下因改名、删除而空掉的子目录（不动 成品/ 本身）。"""
    out = pdir / "手稿" / "成品"
    removed: list[Path] = []
    if not out.is_dir():
        return removed
    for path in sorted(out.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if path.is_dir() and not any(path.iterdir()):
            try:
                path.rmdir()
                removed.append(path)
            except OSError:
                pass
    return removed


# ---- 供 api.py 调用的安全包装：镜像失败绝不影响保存 --------------------------

def _project_name(project_id: int) -> str:
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT name FROM projects WHERE id = %s", (project_id,))
        row = c.fetchone()
    return (row or {}).get("name", "") if row else ""


def on_chapter_saved(project_id: int, title: str, group_title: str, content: str, previous: tuple[str, str] | None = None) -> None:
    if not enabled():
        return
    try:
        name = _project_name(project_id)
        write_chapter(project_id, name, {"title": title, "group_title": group_title, "content": content}, previous)
        refresh_book(project_id, name)
    except Exception:  # noqa: BLE001
        logger.exception("镜像章节失败（不影响保存）：project_id=%s", project_id)


def on_chapter_removed(project_id: int, title: str, group_title: str) -> None:
    if not enabled():
        return
    try:
        name = _project_name(project_id)
        remove_chapter(project_id, name, title, group_title)
        pdir = project_dir(name)
        if pdir is not None:
            prune_empty_dirs(pdir)
        refresh_book(project_id, name)
    except Exception:  # noqa: BLE001
        logger.exception("移除章节镜像失败：project_id=%s", project_id)


def on_chapters_reordered(project_id: int) -> None:
    """只重排整本书（移动/改名后调用），不动单章文件。"""
    if not enabled():
        return
    try:
        refresh_book(project_id, _project_name(project_id))
    except Exception:  # noqa: BLE001
        logger.exception("刷新书稿失败：project_id=%s", project_id)


def on_volume_renamed(project_id: int, moves: list[tuple[str, str, str, str]]) -> None:
    """整卷改名 / 整卷挪进默认卷：把每章镜像搬到新路径，旧文件删掉。

    moves: [(title, old_group, new_group, content), ...]
    """
    if not enabled():
        return
    try:
        name = _project_name(project_id)
        pdir = project_dir(name)
        if pdir is None:
            return
        for title, old_group, new_group, content in moves:
            write_chapter(
                project_id,
                name,
                {"title": title, "group_title": new_group, "content": content},
                (title, old_group),
            )
        prune_empty_dirs(pdir)
        refresh_book(project_id, name)
    except Exception:  # noqa: BLE001
        logger.exception("整卷改名镜像失败：project_id=%s", project_id)


def on_volume_deleted(project_id: int, removed: list[tuple[str, str]]) -> None:
    """整卷删除：删掉该卷所有镜像文件、清空目录，再重排书稿。"""
    if not enabled():
        return
    try:
        name = _project_name(project_id)
        pdir = project_dir(name)
        if pdir is None:
            return
        for title, group in removed:
            remove_chapter(project_id, name, title, group)
        prune_empty_dirs(pdir)
        refresh_book(project_id, name)
    except Exception:  # noqa: BLE001
        logger.exception("整卷删除镜像失败：project_id=%s", project_id)
