from fastapi import FastAPI, HTTPException

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


@app.post("/lore/import")
def import_lore(payload: LoreImportPayload):
    return lore_service.import_lore(payload.model_dump())


@app.post("/style/profile")
def create_style_profile(payload: StyleProfilePayload):
    metrics = style_service.build_profile(payload.project_id, payload.name, payload.samples)
    return {"project_id": payload.project_id, "metrics": metrics}


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
