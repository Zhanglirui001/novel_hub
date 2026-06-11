import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.database import get_conn, init_db, utc_now
from app.schemas import (
    ConsistencyPayload,
    DraftPayload,
    LoreImportPayload,
    PatchApplyPayload,
    ProjectCreate,
    StyleProfilePayload,
)
from app.services import ConsistencyGuard, GenerationService, LoreService, StyleService

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
