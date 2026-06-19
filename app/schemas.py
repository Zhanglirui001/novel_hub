from typing import Any, Literal

from pydantic import BaseModel, Field


TaskType = Literal["continue", "polish"]


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class LoreImportPayload(BaseModel):
    project_id: int
    characters: list[dict[str, Any]] = Field(default_factory=list)
    world_rules: list[dict[str, Any]] = Field(default_factory=list)
    terms: list[dict[str, Any]] = Field(default_factory=list)
    taboos: list[dict[str, Any]] = Field(default_factory=list)
    timeline_events: list[dict[str, Any]] = Field(default_factory=list)


class StyleProfilePayload(BaseModel):
    project_id: int
    name: str = "default"
    samples: list[str]


class DraftPayload(BaseModel):
    project_id: int
    chapter_title: str = "未命名章节"
    input_text: str
    budget: str = "medium"
    target_latency_ms: int = 6000


class PatchApplyPayload(BaseModel):
    patch_set_id: int
    accepted_ids: list[int]
    chapter_title: str = "未命名章节"


class ConsistencyPayload(BaseModel):
    project_id: int
    text: str


class LlmSettingsPayload(BaseModel):
    provider: str = "stub"
    base_url: str = ""
    # api_key 留空表示保留 DB 中已存在的密钥（前端不回显原文）。
    api_key: str = ""
    writer_model: str = ""
    planner_model: str = ""
    judge_model: str = ""

