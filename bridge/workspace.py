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

# 这些是模板 / 说明书 / 汇编产物，不是正文章节：既不该被 push 成章节，
# 也不该被 pull 写成文件。（历史上 README、单元模板 就是这么被当成「章节」
# 塞进库里的，后来又会跟着汇编混进书稿。）
PSEUDO_TITLES = {"readme", "单元模板", "章节编排表", "完整书稿"}
# 草稿暂存区：pull 不往 成品/ 里搬。
STAGING_GROUPS = {"单元"}


def _is_pseudo_title(title: str) -> bool:
    return (title or "").strip().lower() in PSEUDO_TITLES


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
        if _is_pseudo_title(path.stem):
            continue
        rel = path.relative_to(draft)
        parts = rel.parts
        if len(parts) > 2 and parts[0] in {"成品", "单元"}:
            # pull 会写成 成品/<卷>/<章>.md；回读时跳过「成品」这一层，
            # 否则 group 会退化成「成品」，重新 push 时同一章会以新分组再存一份。
            group = parts[1]
        elif len(parts) > 1:
            group = parts[0]
        else:
            group = "默认卷"
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
    """把 novel_hub 章节回写成 Markdown。

    以前是「一股脑平铺进 成品/」：README、单元模板 这类模板条目也会变成文件，
    而且卷/分组信息直接丢掉。现在：
      - 跳过伪章节（README / 单元模板 / 章节编排表 / 完整书稿）
      - 跳过「单元」草稿区（那是写作暂存，不是成品）
      - 有卷名的写进 成品/<卷名>/<章节>.md，默认卷才平铺
    """
    out_dir = project_dir / "手稿" / "成品"
    out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for ch in chapters:
        title = ch.get("title") or "未命名章节"
        if _is_pseudo_title(title):
            continue
        group = (ch.get("group_title") or "").strip()
        if group in STAGING_GROUPS:
            continue
        safe = re.sub(r'[\\/:*?"<>|]', "_", title)
        if group and group != "默认卷":
            safe_group = re.sub(r'[\\/:*?"<>|]', "_", group)
            target_dir = out_dir / safe_group
        else:
            target_dir = out_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{safe}.md"
        target.write_text(ch.get("content", ""), encoding="utf-8")
        written.append(target)
    return written
