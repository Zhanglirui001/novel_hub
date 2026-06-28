import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.database import get_conn, init_db, utc_now
from app.schemas import (
    ChapterRenamePayload,
    ChapterSavePayload,
    ConsistencyPayload,
    DraftPayload,
    InlineAnalyzePayload,
    InlineRevisePayload,
    LlmSettingsPayload,
    LoreImportPayload,
    PatchApplyPayload,
    ProjectCreate,
    StyleProfilePayload,
)
from app.services import ConsistencyGuard, GenerationService, LoreService, StyleService
from app.services import backup_service, settings_service

init_db()
app = FastAPI(title="Novel Hub API", version="0.1.0")

# 允许本地 Next.js 前端跨域访问。可通过 CORS_ORIGINS 环境变量覆盖（逗号分隔）。
_default_origins = "http://localhost:3000,http://127.0.0.1:3000"
allow_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", _default_origins).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

lore_service = LoreService()
style_service = StyleService()
generation_service = GenerationService()
consistency_guard = ConsistencyGuard()


@app.post("/projects")
def create_project(payload: ProjectCreate):
    now = utc_now()
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            "INSERT INTO projects (name, description, created_at) VALUES (%s, %s, %s)",
            (payload.name, payload.description, now),
        )
        project_id = c.lastrowid
    return {"project_id": project_id, "name": payload.name}


@app.get("/projects")
def list_projects():
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT id, name, description, created_at FROM projects ORDER BY id DESC")
        return list(c.fetchall())


@app.get("/projects/{project_id}")
def get_project(project_id: int):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT id, name, description, created_at FROM projects WHERE id = %s",
            (project_id,),
        )
        row = c.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"project_id={project_id} 不存在")
    return row


@app.get("/projects/{project_id}/chapters")
def list_chapters(project_id: int):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            """
            SELECT id, title, version, updated_at
            FROM chapters WHERE project_id = %s
            ORDER BY id ASC
            """,
            (project_id,),
        )
        return list(c.fetchall())


@app.get("/chapters/{chapter_id}")
def get_chapter(chapter_id: int):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute(
            "SELECT id, project_id, title, content, version, updated_at FROM chapters WHERE id = %s",
            (chapter_id,),
        )
        row = c.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"chapter_id={chapter_id} 不存在")
    return row


@app.put("/chapters")
def save_chapter(payload: ChapterSavePayload):
    """直接保存正文（手动保存 / 自动保存通道，区别于 patch/apply）。"""
    now = utc_now()
    with get_conn() as conn:
        c = conn.cursor()
        target_id = payload.chapter_id
        if target_id is None:
            c.execute(
                "SELECT id, version FROM chapters WHERE project_id = %s AND title = %s ORDER BY id DESC LIMIT 1",
                (payload.project_id, payload.title),
            )
            existing = c.fetchone()
            if existing:
                target_id = existing["id"]
                version = existing["version"] + 1
            else:
                c.execute(
                    "INSERT INTO chapters (project_id, title, content, version, updated_at) VALUES (%s, %s, %s, %s, %s)",
                    (payload.project_id, payload.title, payload.content, 1, now),
                )
                return {
                    "chapter_id": c.lastrowid,
                    "version": 1,
                    "updated_at": now,
                    "created": True,
                }
        else:
            c.execute("SELECT version FROM chapters WHERE id = %s", (target_id,))
            row = c.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"chapter_id={target_id} 不存在")
            version = row["version"] + 1

        c.execute(
            "UPDATE chapters SET title = %s, content = %s, version = %s, updated_at = %s WHERE id = %s",
            (payload.title, payload.content, version, now, target_id),
        )
        return {
            "chapter_id": target_id,
            "version": version,
            "updated_at": now,
            "created": False,
        }


@app.patch("/chapters/{chapter_id}")
def rename_chapter(chapter_id: int, payload: ChapterRenamePayload):
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title 不能为空")
    now = utc_now()
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT id FROM chapters WHERE id = %s", (chapter_id,))
        if not c.fetchone():
            raise HTTPException(status_code=404, detail=f"chapter_id={chapter_id} 不存在")
        c.execute(
            "UPDATE chapters SET title = %s, updated_at = %s WHERE id = %s",
            (title, now, chapter_id),
        )
    return {"chapter_id": chapter_id, "title": title, "updated_at": now}


@app.delete("/chapters/{chapter_id}")
def delete_chapter(chapter_id: int):
    with get_conn() as conn:
        c = conn.cursor()
        c.execute("SELECT id FROM chapters WHERE id = %s", (chapter_id,))
        if not c.fetchone():
            raise HTTPException(status_code=404, detail=f"chapter_id={chapter_id} 不存在")
        c.execute("DELETE FROM chapters WHERE id = %s", (chapter_id,))
    return {"chapter_id": chapter_id, "deleted": True}


@app.get("/chapters/{chapter_id}/backup")
def get_chapter_backup_status(chapter_id: int):
    try:
        return backup_service.get_status(chapter_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/chapters/{chapter_id}/backup")
def create_chapter_backup(chapter_id: int):
    try:
        return backup_service.backup_chapter(chapter_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/lore/import")
def import_lore(payload: LoreImportPayload):
    return lore_service.import_lore(payload.model_dump())


@app.get("/lore")
def get_lore(project_id: int):
    return lore_service.build_context(project_id)


@app.post("/style/profile")
def create_style_profile(payload: StyleProfilePayload):
    metrics = style_service.build_profile(payload.project_id, payload.name, payload.samples)
    return {"project_id": payload.project_id, "metrics": metrics}


@app.get("/style/profile")
def get_style_profile(project_id: int):
    return style_service.get_latest_profile(project_id)


@app.post("/draft/continue")
def continue_draft(payload: DraftPayload):
    return generation_service.run(
        project_id=payload.project_id,
        task_type="continue",
        chapter_title=payload.chapter_title,
        input_text=payload.input_text,
        budget=payload.budget,
        target_latency_ms=payload.target_latency_ms,
    )


@app.post("/draft/polish")
def polish_draft(payload: DraftPayload):
    return generation_service.run(
        project_id=payload.project_id,
        task_type="polish",
        chapter_title=payload.chapter_title,
        input_text=payload.input_text,
        budget=payload.budget,
        target_latency_ms=payload.target_latency_ms,
    )


@app.post("/consistency/check")
def check_consistency(payload: ConsistencyPayload):
    context = lore_service.build_context(payload.project_id)
    return consistency_guard.check(payload.text, context)


@app.post("/draft/analyze")
def analyze_segment(payload: InlineAnalyzePayload):
    if not payload.selection.strip():
        raise HTTPException(status_code=400, detail="selection 不能为空")
    return generation_service.analyze_segment(
        project_id=payload.project_id,
        selection=payload.selection,
        prefix=payload.prefix,
        suffix=payload.suffix,
        chapter_title=payload.chapter_title,
    )


@app.post("/draft/revise")
def revise_segment(payload: InlineRevisePayload):
    if not payload.selection.strip():
        raise HTTPException(status_code=400, detail="selection 不能为空")
    return generation_service.revise_segment(
        project_id=payload.project_id,
        selection=payload.selection,
        prefix=payload.prefix,
        suffix=payload.suffix,
        annotation=payload.annotation,
        analysis=payload.analysis,
        chapter_title=payload.chapter_title,
        budget=payload.budget,
        target_latency_ms=payload.target_latency_ms,
    )


@app.post("/patch/apply")
def apply_patch(payload: PatchApplyPayload):
    try:
        return generation_service.apply_patch_set(
            patch_set_id=payload.patch_set_id,
            accepted_ids=payload.accepted_ids,
            chapter_title=payload.chapter_title,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/timeline")
def timeline(project_id: int):
    return lore_service.list_timeline(project_id)


@app.get("/settings/llm")
def get_llm_settings():
    return settings_service.get_settings_public()


@app.put("/settings/llm")
def update_llm_settings(payload: LlmSettingsPayload):
    try:
        return settings_service.save_settings(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/settings/llm/test")
def test_llm_settings(payload: LlmSettingsPayload):
    return settings_service.test_connection(payload.model_dump())
