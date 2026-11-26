"""同步逻辑：工作区 ⇄ novel_hub。"""
from __future__ import annotations

import os
import socket
from pathlib import Path

from . import http
from . import workspace as ws


def _get_or_create_project(name: str, description: str) -> dict:
    for row in http.get("/projects") or []:
        if row.get("name") == name:
            return row
    created = http.post("/projects", {"name": name, "description": description})
    return {"id": created["project_id"], "name": name, "description": description}


def _existing_chapter_keys(project_id: int) -> set[tuple[str, str]]:
    rows = http.get(f"/projects/{project_id}/chapters") or []
    return {(r.get("group_title", ""), r.get("title", "")) for r in rows}


def _existing_card_titles(project_id: int) -> set[str]:
    rows = http.get(f"/projects/{project_id}/inspiration/cards") or []
    return {r.get("title", "") for r in rows}


def _dedupe_lore(project_id: int, lore: dict) -> dict:
    """去掉 novel_hub 中已存在的 lore 条目（按 name/label 去重），保证 sync 幂等。"""
    try:
        existing = http.get(f"/lore?project_id={project_id}") or {}
    except http.HttpError:
        return lore
    char_names = {c.get("name") for c in existing.get("characters", [])}
    rule_names = {i.get("name") for i in existing.get("world_rules", [])}
    term_names = {i.get("name") for i in existing.get("terms", [])}
    taboo_names = {i.get("name") for i in existing.get("taboos", [])}
    timeline_labels = {e.get("label") for e in existing.get("timeline", [])}

    return {
        "characters": [c for c in lore.get("characters", []) if c.get("name") not in char_names],
        "world_rules": [i for i in lore.get("world_rules", []) if i.get("name") not in rule_names],
        "terms": [i for i in lore.get("terms", []) if i.get("name") not in term_names],
        "taboos": [i for i in lore.get("taboos", []) if i.get("name") not in taboo_names],
        "timeline_events": [e for e in lore.get("timeline_events", []) if e.get("label") not in timeline_labels],
    }


def push(workspace_root: Path | None = None, force: bool = False) -> dict:
    root = ws.find_workspace_root(workspace_root)
    summary = {
        "projects": [],
        "lore_imported": 0,
        "chapters_pushed": 0,
        "chapters_skipped": 0,
        "cards": 0,
        "mainline": 0,
    }
    for pdir in ws.find_project_dirs(root):
        name = pdir.name
        project = _get_or_create_project(name, ws.project_description(pdir))
        pid = project["id"]
        summary["projects"].append(name)

        lore = _dedupe_lore(pid, ws.parse_lore(pdir))
        n_lore = sum(len(lore[k]) for k in ("characters", "world_rules", "terms", "taboos", "timeline_events"))
        if n_lore:
            lore["project_id"] = pid
            res = http.post("/lore/import", lore)
            summary["lore_imported"] += res.get("imported_count", 0)

        ml = ws.parse_mainline(pdir)
        if ml["content"] or ml["summary"]:
            http.put(f"/projects/{pid}/mainline", {"content": ml["content"], "summary": ml["summary"]})
            summary["mainline"] += 1

        existing = _existing_chapter_keys(pid)
        for ch in ws.parse_chapters(pdir):
            key = (ch["group_title"], ch["title"])
            if not force and key in existing:
                summary["chapters_skipped"] += 1
                continue
            http.put("/chapters", {
                "project_id": pid,
                "title": ch["title"],
                "group_title": ch["group_title"],
                "content": ch["content"],
            })
            summary["chapters_pushed"] += 1

        card_titles = _existing_card_titles(pid)
        for card in ws.parse_inspiration(pdir, root):
            if card["title"] in card_titles:
                continue
            http.post(f"/projects/{pid}/inspiration/cards", card)
            summary["cards"] += 1
    return summary


def pull(workspace_root: Path | None = None) -> dict:
    root = ws.find_workspace_root(workspace_root)
    result = {"chapters": 0}
    for pdir in ws.find_project_dirs(root):
        project = next((r for r in http.get("/projects") or [] if r.get("name") == pdir.name), None)
        if not project:
            continue
        rows = http.get(f"/projects/{project['id']}/chapters") or []
        chapters = []
        for row in rows:
            detail = http.get(f"/chapters/{row['id']}") or {}
            chapters.append({
                "title": detail.get("title", row.get("title")),
                "group_title": detail.get("group_title", ""),
                "content": detail.get("content", ""),
            })
        result["chapters"] += len(ws.write_chapters_back(pdir, chapters))
    return result


def status() -> dict:
    def port_open(port: int) -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1.0)
            return s.connect_ex(("127.0.0.1", port)) == 0

    sqlite_path = os.getenv("SQLITE_PATH") or str(Path(__file__).resolve().parent.parent / "novel_hub.db")
    out = {"sqlite": os.path.exists(sqlite_path), "api": port_open(8000), "web": port_open(3001)}
    if out["api"]:
        try:
            out["projects"] = len(http.get("/projects") or [])
        except Exception as exc:  # noqa: BLE001
            out["api_error"] = str(exc)
    return out
