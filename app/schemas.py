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
    chapter_id: int | None = None
    group_title: str = "默认卷"


class ChapterSavePayload(BaseModel):
    project_id: int
    title: str = Field(min_length=1, max_length=255)
    content: str
    group_title: str = Field(default="默认卷", max_length=255)
    sort_order: int | None = None
    # 传入即更新该章节，否则按 (project_id, group_title, title) 查找；找不到则插入新章。
    chapter_id: int | None = None


class ChapterPlacementPayload(BaseModel):
    group_title: str
    sort_order: int | None = None


class ChapterRenamePayload(BaseModel):
    title: str


class ConsistencyPayload(BaseModel):
    project_id: int
    text: str


class InlineAnalyzePayload(BaseModel):
    """选段 AI 分析。前后文用于让模型理解选段处的语境，不会被改动。"""

    project_id: int
    selection: str
    prefix: str = ""
    suffix: str = ""
    chapter_title: str = "未命名章节"


class InlineRevisePayload(BaseModel):
    """结合批注的选段重写。analysis 可选，前端拿到分析后回传以便模型对齐结论。"""

    project_id: int
    selection: str
    prefix: str = ""
    suffix: str = ""
    annotation: str = ""
    analysis: str = ""
    chapter_title: str = "未命名章节"
    budget: str = "medium"
    target_latency_ms: int = 6000


class LlmSettingsPayload(BaseModel):
    provider: str = "stub"
    base_url: str = ""
    # api_key 留空表示保留 DB 中已存在的密钥（前端不回显原文）。
    api_key: str = ""
    writer_model: str = ""
    planner_model: str = ""
    judge_model: str = ""


class ChatSessionCreatePayload(BaseModel):
    project_id: int
    title: str | None = None


class ChatMessageCreatePayload(BaseModel):
    content: str = Field(min_length=1)
    chapter_title: str = "未命名章节"
    chapter_group_title: str = "默认卷"
    active_chapter_id: int | None = None
    selection_text: str | None = None

