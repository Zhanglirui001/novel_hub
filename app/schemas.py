from typing import Any, Literal

from pydantic import BaseModel, Field


TaskType = Literal["continue", "polish"]


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class DailyTodoCreatePayload(BaseModel):
    content: str = Field(max_length=500)


class DailyTodoUpdatePayload(BaseModel):
    content: str | None = Field(default=None, max_length=500)
    completed: bool | None = None


class DailyCheckinPayload(BaseModel):
    pass


class DailyCheckinMakeupPayload(BaseModel):
    pass


class MonthlyFixedTodoCreatePayload(BaseModel):
    month: str
    content: str = Field(max_length=500)
    weekdays: list[int] = Field(min_length=1, max_length=7)


class MonthlyFixedTodoUpdatePayload(BaseModel):
    content: str | None = Field(default=None, max_length=500)
    weekdays: list[int] | None = Field(default=None, min_length=1, max_length=7)


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


class ContinuePayload(BaseModel):
    project_id: int
    tail_text: str = ""
    instruction: str = ""
    directive: dict[str, Any] | None = None
    chapter_title: str = "未命名章节"
    budget: str = "medium"
    target_latency_ms: int = 6000
    mode: str = "continue"  # continue（段中续写）| opening（新章起笔）
    mainline: str = ""  # 本章故事主线，按需引用
    use_global_mainline: bool = True  # 是否注入全书主线摘要（常驻，可关）


class ContinueAcceptPayload(BaseModel):
    project_id: int
    chapter_title: str = "未命名章节"
    accepted_text: str
    directive: dict[str, Any] | None = None
    consistency_score: int | None = None


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


class InspirationCardCreatePayload(BaseModel):
    card_type: str = Field(default="idea", min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=255)
    content: str = ""
    tags: list[str] = Field(default_factory=list)
    color: str = Field(default="amber", max_length=32)


class InspirationCardUpdatePayload(BaseModel):
    card_type: str | None = Field(default=None, min_length=1, max_length=64)
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = None
    tags: list[str] | None = None
    color: str | None = Field(default=None, max_length=32)


class InspirationBoardCreatePayload(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = ""


class InspirationBoardUpdatePayload(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class InspirationNodePayload(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    card_id: int | None = None
    node_type: Literal["card", "annotation", "event", "character"]
    position_x: float = 0
    position_y: float = 0
    width: float | None = None
    height: float | None = None
    z_index: int = 0
    data: dict[str, Any] = Field(default_factory=dict)


class InspirationEdgePayload(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    source_node_id: str = Field(min_length=1, max_length=64)
    target_node_id: str = Field(min_length=1, max_length=64)
    edge_type: str = Field(default="relation", min_length=1, max_length=32)
    label: str = Field(default="", max_length=255)
    style: dict[str, Any] = Field(default_factory=dict)


class InspirationGraphPatchPayload(BaseModel):
    expected_graph_version: int = Field(ge=1)
    viewport: dict[str, float] = Field(default_factory=dict)
    nodes: list[InspirationNodePayload] = Field(default_factory=list)
    deleted_node_ids: list[str] = Field(default_factory=list)
    edges: list[InspirationEdgePayload] = Field(default_factory=list)
    deleted_edge_ids: list[str] = Field(default_factory=list)


class InspirationDiscussionPayload(BaseModel):
    content: str = Field(min_length=1)
    selected_node_ids: list[str] = Field(default_factory=list)


class MainlineDiscussionTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class MainlineDiscussionPayload(BaseModel):
    project_id: int
    content: str = Field(min_length=1)
    history: list[MainlineDiscussionTurn] = Field(default_factory=list)


class MainlineSavePayload(BaseModel):
    project_id: int
    content: str = ""


class GlobalMainlineSavePayload(BaseModel):
    content: str = ""
    summary: str = ""


class InspirationProposalActionPayload(BaseModel):
    action_type: Literal["create_card", "create_edge"]
    card: InspirationCardCreatePayload | None = None
    source_node_id: str | None = Field(default=None, max_length=64)
    target_node_id: str | None = Field(default=None, max_length=64)
    label: str = Field(default="", max_length=255)


class InspirationProposalCreatePayload(BaseModel):
    base_graph_version: int = Field(ge=1)
    actions: list[InspirationProposalActionPayload] = Field(min_length=1)


class StorylineNodePayload(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    title: str = Field(default="", max_length=255)
    description: str = ""
    position_x: float = 0
    position_y: float = 0
    width: float | None = None
    height: float | None = None
    z_index: int = 0


class StorylineEdgePayload(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    source_node_id: str = Field(min_length=1, max_length=64)
    target_node_id: str = Field(min_length=1, max_length=64)
    label: str = Field(default="", max_length=255)
    style: dict[str, Any] = Field(default_factory=dict)


class StorylineGraphPatchPayload(BaseModel):
    expected_graph_version: int = Field(ge=1)
    viewport: dict[str, float] = Field(default_factory=dict)
    nodes: list[StorylineNodePayload] = Field(default_factory=list)
    deleted_node_ids: list[str] = Field(default_factory=list)
    edges: list[StorylineEdgePayload] = Field(default_factory=list)
    deleted_edge_ids: list[str] = Field(default_factory=list)

