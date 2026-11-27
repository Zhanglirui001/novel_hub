"""汇编：把 novel_hub 里的章节按「卷 → 章」合并成一整本书稿。

这是手册里 `汇编` 口令的落地实现。此前只有文档承诺、没有代码，所以
「最终成品」永远只躺在 SQLite 里。

产物（写到工作区项目的 `手稿/成品/`）：
  完整书稿.md    —— 源文件，从头读到尾
  完整书稿.docx  —— 可选，装了 python-docx 才导

用法：
  python -m bridge assemble
  python -m bridge assemble --project 尚未兑现的明天
  python -m bridge assemble --project 尚未兑现的明天 --no-docx
  python -m bridge assemble --project 尚未兑现的明天 --include-staging   # 连「单元」草稿一起收
"""
from __future__ import annotations

import datetime as dt
import re
from pathlib import Path

from . import http
from . import workspace as ws

# 非正文条目：从工作区被当成章节塞进库的模板 / 说明文件。
PSEUDO_TITLES = {"readme", "单元模板", "章节编排表", "完整书稿"}
# 暂存区：单元草稿、回流产物，默认不进书稿。
STAGING_GROUPS = {"单元", "成品"}

_VOL_RE = re.compile(r"第\s*([0-9]+|[零一二三四五六七八九十百]+)\s*卷")
_CN_DIGITS = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}


def _cn_to_int(text: str) -> int | None:
    if text.isdigit():
        return int(text)
    total, section, num = 0, 0, 0
    for ch in text:
        if ch in _CN_DIGITS:
            num = _CN_DIGITS[ch]
        elif ch == "十":
            section += (num or 1) * 10
            num = 0
        elif ch == "百":
            section += (num or 1) * 100
            num = 0
        else:
            return None
    return total + section + num


def _volume_index(group_title: str) -> int | None:
    m = _VOL_RE.search(group_title or "")
    if not m:
        return None
    return _cn_to_int(m.group(1))


def _is_pseudo(title: str) -> bool:
    return (title or "").strip().lower() in PSEUDO_TITLES


def _char_count(text: str) -> int:
    return len(re.sub(r"\s", "", text or ""))


def prepare_chapters(rows: list[dict], include_staging: bool = False) -> list[dict]:
    """把「带 content 的章节行」过滤成汇编用的结构。

    API 进程的自动镜像也走这里，保证「自动落盘」和手动 `汇编` 用的是同一套规则：
    丢伪章节、丢草稿/回流分组、丢空章节，并补上卷序号。
    """
    chapters: list[dict] = []
    for row in rows:
        title = (row.get("title") or "").strip()
        group = (row.get("group_title") or "").strip() or "默认卷"
        if _is_pseudo(title):
            continue
        if not include_staging and group in STAGING_GROUPS:
            continue
        content = (row.get("content") or "").strip()
        if not content:
            continue
        chapters.append(
            {
                "id": row.get("id", 0),
                "title": title,
                "group_title": group,
                "content": content,
                "sort_order": row.get("sort_order", 0),
                "version": row.get("version", 1),
                "updated_at": row.get("updated_at", "") or "",
                "volume_index": _volume_index(group),
            }
        )
    return chapters


def collect_chapters(project_id: int, include_staging: bool = False) -> list[dict]:
    """拉取章节正文，丢掉伪章节 / 空章节，并补上排序用的卷序号。"""
    rows = http.get(f"/projects/{project_id}/chapters") or []
    hydrated: list[dict] = []
    for row in rows:
        detail = http.get(f"/chapters/{row['id']}") or {}
        hydrated.append({**row, "content": detail.get("content", "")})
    return prepare_chapters(hydrated, include_staging=include_staging)


def order_groups(chapters: list[dict]) -> list[tuple[str, list[dict]]]:
    """按「第N卷」的数字排卷；没有编号的卷排在最后，保持原始先后。"""
    order: list[str] = []
    vol_of: dict[str, int | None] = {}
    for ch in chapters:
        name = ch["group_title"]
        if name not in order:
            order.append(name)
            vol_of[name] = ch.get("volume_index")
    index = {name: i for i, name in enumerate(order)}

    def key(name: str):
        vol = vol_of.get(name)
        # 有卷号的按数字升序；无卷号的排后面，按首次出现顺序。
        return (0, vol, index[name]) if vol is not None else (1, 0, index[name])

    groups: list[tuple[str, list[dict]]] = []
    for name in sorted(order, key=key):
        items = [c for c in chapters if c["group_title"] == name]
        items.sort(key=lambda c: (c["sort_order"], c["id"]))
        groups.append((name, items))
    return groups


def build_markdown(project: dict, groups: list[tuple[str, list[dict]]], generated_at: str) -> str:
    total_chars = sum(_char_count(ch["content"]) for _, items in groups for ch in items)
    total_chapters = sum(len(items) for _, items in groups)
    name = project.get("name") or "未命名作品"
    only_default = len(groups) == 1 and groups[0][0] == "默认卷"

    lines: list[str] = [f"# {name}", ""]
    lines.append(f"> 由 novel_hub 章节汇编 · {generated_at}")
    lines.append(f"> 共 {len(groups)} 卷 / {total_chapters} 章 / {total_chars} 字")
    lines.append("")
    for group_title, items in groups:
        if not only_default:
            lines.append(f"## {group_title}")
            lines.append("")
        for ch in items:
            if only_default:
                lines.append(f"## {ch['title']}")
            else:
                lines.append(f"### {ch['title']}")
            lines.append("")
            lines.append(ch["content"])
            lines.append("")
            lines.append("---")
            lines.append("")
    # 去掉末尾多余的 --- 分隔
    while lines and lines[-1] in ("", "---"):
        lines.pop()
    return "\n".join(lines).rstrip() + "\n"


def write_docx(path: Path, project: dict, groups: list[tuple[str, list[dict]]], generated_at: str) -> str:
    """导 Word。没装 python-docx 就返回原因字符串，不炸整体流程。"""
    try:
        from docx import Document
        from docx.enum.text import WD_ALIGN_PARAGRAPH
        from docx.shared import Pt
    except Exception as exc:  # noqa: BLE001
        return f"skipped: python-docx 不可用（{exc.__class__.__name__}）"

    doc = Document()
    only_default = len(groups) == 1 and groups[0][0] == "默认卷"

    title = doc.add_heading(project.get("name") or "未命名作品", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    meta = doc.add_paragraph(f"由 novel_hub 章节汇编 · {generated_at}")
    meta.alignment = WD_ALIGN_PARAGRAPH.CENTER

    for group_title, items in groups:
        if not only_default:
            doc.add_heading(group_title, level=1)
        for ch in items:
            doc.add_heading(ch["title"], level=2 if not only_default else 1)
            for para in ch["content"].split("\n\n"):
                text = para.strip()
                if not text:
                    continue
                p = doc.add_paragraph(text)
                p.paragraph_format.first_line_indent = Pt(24)
    doc.save(str(path))
    return "written"


def assemble(
    workspace_root: Path | None = None,
    project_name: str | None = None,
    with_docx: bool = True,
    include_staging: bool = False,
) -> dict:
    root = ws.find_workspace_root(workspace_root)
    projects = http.get("/projects") or []
    if project_name:
        projects = [p for p in projects if p.get("name") == project_name]
    result: dict = {"projects": [], "written": 0}
    generated_at = dt.datetime.now().strftime("%Y-%m-%d %H:%M")

    for project in projects:
        chapters = collect_chapters(project["id"], include_staging=include_staging)
        if not chapters:
            result["projects"].append({"name": project.get("name"), "chapters": 0, "note": "没有可汇编的正文"})
            continue
        groups = order_groups(chapters)
        markdown = build_markdown(project, groups, generated_at)

        out_dir = root / "03-项目沉淀" / project["name"] / "手稿" / "成品"
        out_dir.mkdir(parents=True, exist_ok=True)
        md_path = out_dir / "完整书稿.md"
        md_path.write_text(markdown, encoding="utf-8")

        docx_note = ""
        if with_docx:
            docx_note = write_docx(out_dir / "完整书稿.docx", project, groups, generated_at)

        result["written"] += 1
        result["projects"].append(
            {
                "name": project.get("name"),
                "chapters": len(chapters),
                "volumes": len(groups),
                "chars": sum(_char_count(ch["content"]) for ch in chapters),
                "markdown": str(md_path),
                "docx": docx_note or "disabled",
            }
        )
    return result
