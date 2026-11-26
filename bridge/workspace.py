"""工作区（Markdown 沉淀层）的读取与回写。

映射约定（对齐《笔记规范》前缀）：
  灵· 灵感   → inspiration cards
  人· 人物   → characters {name, profile}
  地· 地点   → terms {name, content, tags}
  金· 金句   → terms
  疑· 待定   → terms（tags 含「待定」）
  线· 伏笔   → timeline_events {label, description, source}
  段· 场景   → Phase 1 跳过（后续可映射为章节）
"""
from __future__ import annotations

import re
from pathlib import Path

_NOTE_RE = re.compile(r"^#{1,6}\s*([灵人地线段金疑])·\s*(.+?)\s*$")
_TAG_RE = re.compile(r"#([\w\u4e00-\u9fff\-]+)")


def _read(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def find_workspace_root(hint: Path | None = None) -> Path:
    """bridge 位于 <workspace>/novel_hub/bridge/ → 上三级即工作区根。"""
    if hint is not None:
        return Path(hint).resolve()
    return Path(__file__).resolve().parent.parent.parent


def find_project_dirs(workspace_root: Path) -> list[Path]:
    base = workspace_root / "03-项目沉淀"
    if not base.is_dir():
        return []
    return sorted(p for p in base.iterdir() if p.is_dir())


def split_notes(text: str) -> list[tuple[str, str, str]]:
    """把 Markdown 拆成 (前缀, 标题, 正文) 笔记列表。"""
    notes: list[tuple[str, str, str]] = []
    cur_prefix = cur_title = None
    cur_body: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        m = _NOTE_RE.match(line)
        if m:
            if cur_prefix is not None:
                notes.append((cur_prefix, cur_title, "\n".join(cur_body).strip()))
            cur_prefix, cur_title = m.group(1), m.group(2)
            cur_body = []
        elif cur_prefix is not None:
            cur_body.append(raw)
    if cur_prefix is not None:
        notes.append((cur_prefix, cur_title, "\n".join(cur_body).strip()))
    return notes


def _tags(text: str) -> list[str]:
    return list(dict.fromkeys(_TAG_RE.findall(text)))


def parse_lore(project_dir: Path) -> dict:
    world = _read(project_dir / "世界观.md")
    material = _read(project_dir / "素材与线索.md")

    characters, world_rules, terms, taboos, timeline = [], [], [], [], []

    bullet_re = re.compile(r"^[-*]\s*\*\*(.+?)\*\*\s*[：:]\s*(.*)$")
    plain_re = re.compile(r"^[-*]\s*([^：:]{1,40})\s*[：:]\s*(.+)$")
    for raw in world.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = bullet_re.match(line) or plain_re.match(line)
        if m:
            name, content = m.group(1).strip(), m.group(2).strip()
            if content and content not in ("（未定）", "（空）"):
                world_rules.append({"name": name, "content": content, "tags": ["世界观"]})

    for prefix, title, body in split_notes(world + "\n" + material):
        if prefix == "人":
            characters.append({"name": title, "profile": body})
        elif prefix == "地":
            terms.append({"name": title, "content": body, "tags": ["地点"]})
        elif prefix == "金":
            terms.append({"name": title, "content": body, "tags": ["金句"]})
        elif prefix == "疑":
            terms.append({"name": title, "content": body, "tags": ["待定"]})
        elif prefix == "线":
            timeline.append({"label": title, "description": body, "source": "伏笔"})

    return {
        "characters": characters,
        "world_rules": world_rules,
        "terms": terms,
        "taboos": taboos,
        "timeline_events": timeline,
    }


def parse_chapters(project_dir: Path) -> list[dict]:
    draft = project_dir / "手稿"
    if not draft.is_dir():
        return []
    chapters: list[dict] = []
    for path in sorted(draft.rglob("*.md")):
        if path.name == "章节编排表.md":
            continue
        rel = path.relative_to(draft)
        group = rel.parts[0] if len(rel.parts) > 1 else "默认卷"
        chapters.append({
            "title": path.stem,
            "group_title": group,
            "content": _read(path),
            "source": str(path),
        })
    return chapters


def parse_inspiration(project_dir: Path, workspace_root: Path) -> list[dict]:
    texts = [
        _read(project_dir / "灵感.md"),
        _read(workspace_root / "02-中间层" / "灵感池.md"),
    ]
    cards: list[dict] = []
    for prefix, title, body in split_notes("\n".join(texts)):
        if prefix == "灵":
            cards.append({
                "card_type": "idea",
                "title": title,
                "content": body,
                "tags": _tags(body),
                "color": "amber",
            })
    return cards


def parse_mainline(project_dir: Path) -> dict:
    story = _read(project_dir / "故事线.md")
    summary = ""
    m = re.search(r"## 故事的一句话概述\s*\n(.*?)(?=\n##|\Z)", story, re.S)
    if m:
        summary = m.group(1).strip()
        if summary in ("（未定）", ""):
            summary = ""
    return {"content": story, "summary": summary}


def project_description(project_dir: Path) -> str:
    world = _read(project_dir / "世界观.md")
    m = re.search(r"## 世界的一句话概述\s*\n(.*?)(?=\n##|\Z)", world, re.S)
    if m:
        desc = m.group(1).strip()
        return "" if desc in ("（未定）", "") else desc
    return ""


def write_chapters_back(project_dir: Path, chapters: list[dict]) -> list[Path]:
    out_dir = project_dir / "手稿" / "成品"
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for ch in chapters:
        title = ch.get("title") or "未命名章节"
        safe = re.sub(r'[\\/:*?"<>|]', "_", title)
        target = out_dir / f"{safe}.md"
        target.write_text(ch.get("content", ""), encoding="utf-8")
        written.append(target)
    return written
