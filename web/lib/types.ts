export type TaskType = "continue" | "polish";
export type Budget = "low" | "medium" | "high";
export type Severity = "high" | "medium" | "low";
export type PatchOp = "replace" | "insert" | "delete";

export interface Project {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface ChapterSummary {
  id: number;
  title: string;
  group_title: string;
  sort_order: number;
  version: number;
  updated_at: string;
}

export interface Chapter extends ChapterSummary {
  project_id: number;
  content: string;
}

export interface LoreItem {
  id?: number;
  name: string;
  content?: string;
  tags: string[];
}

export interface CharacterCard {
  id?: number;
  name: string;
  profile?: string;
  tags: string[];
}

export interface LoreContext {
  characters: CharacterCard[];
  world_rules: LoreItem[];
  terms: LoreItem[];
  taboos: LoreItem[];
  timeline_events: TimelineEvent[];
}

export interface LoreImportRequest {
  project_id: number;
  characters: Record<string, unknown>[];
  world_rules: Record<string, unknown>[];
  terms: Record<string, unknown>[];
  taboos: Record<string, unknown>[];
  timeline_events: Record<string, unknown>[];
}

export interface LoreImportResponse {
  imported_count: number;
}

export interface StyleProfile {
  avg_sentence_length: number;
  sample_count: number;
  pov: string;
  cadence: string;
  top_words: string[];
}

export interface StyleProfileRequest {
  project_id: number;
  name: string;
  samples: string[];
}

export interface ConsistencyIssue {
  issue_type: string;
  severity: Severity;
  message: string;
  suggestion: string;
}

export interface ConsistencyResult {
  score: number;
  issues: ConsistencyIssue[];
}

export interface ModelRoute {
  planner: string;
  writer: string;
  judge: string;
}

export interface PatchItem {
  id: number;
  op: PatchOp;
  source: string;
  target: string;
  i1: number;
  i2: number;
  j1: number;
  j2: number;
}

export interface GenerationResult {
  result_text: string;
  consistency_score: number;
  issues: ConsistencyIssue[];
  patch_set_id: number;
  patch_items: PatchItem[];
  model_route: ModelRoute;
  repaired: boolean;
}

export interface DraftRequest {
  project_id: number;
  chapter_title: string;
  input_text: string;
  budget: Budget;
  target_latency_ms: number;
}

export interface InlineAnalyzeRequest {
  project_id: number;
  selection: string;
  prefix: string;
  suffix: string;
  chapter_title: string;
}

export interface InlineAnalyzeResult {
  analysis: string;
  consistency_score: number;
  issues: ConsistencyIssue[];
  chapter_title: string;
}

export interface InlineReviseRequest {
  project_id: number;
  selection: string;
  prefix: string;
  suffix: string;
  annotation: string;
  analysis: string;
  chapter_title: string;
  budget: Budget;
  target_latency_ms: number;
}

export interface InlineReviseResult {
  result_text: string;
  consistency_score: number;
  issues: ConsistencyIssue[];
  patch_set_id: number;
  patch_items: PatchItem[];
  chapter_title: string;
  model_route: ModelRoute;
}

export interface PatchApplyResponse {
  chapter_id: number;
  group_title?: string;
  version: number;
  applied_text: string;
}

export interface ChapterSaveRequest {
  project_id: number;
  title: string;
  content: string;
  group_title?: string;
  sort_order?: number | null;
  chapter_id?: number | null;
}

export interface ChapterSaveResponse {
  chapter_id: number;
  version: number;
  updated_at: string;
  created: boolean;
}

export type BackupStatus = "not_backed_up" | "up_to_date" | "stale";

export interface BackupInfo {
  status: BackupStatus;
  path?: string;
  version: number;
  backed_up_version?: number | null;
  backed_up_at?: string | null;
  sha1?: string;
}

export interface TimelineEvent {
  label: string;
  source: string;
  description?: string;
  event_time: string;
}

export type LlmProvider = "qwen" | "openai-compatible" | "stub";

export interface LlmSettings {
  provider: LlmProvider;
  base_url: string;
  api_key_masked: string;
  api_key_set: boolean;
  writer_model: string;
  planner_model: string;
  judge_model: string;
  updated_at: string;
}

export interface LlmSettingsPayload {
  provider: LlmProvider;
  base_url: string;
  api_key: string;
  writer_model: string;
  planner_model: string;
  judge_model: string;
}

export interface LlmTestResult {
  ok: boolean;
  provider: string;
  message: string;
}

export type ChatRole = "user" | "assistant";

export interface ChatSessionSummary {
  id: number;
  project_id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview: string;
}

export interface ChatSessionMessageContext {
  chapterTitle: string;
  chapterGroupTitle: string;
  activeChapterId: number | null;
  hasSelection: boolean;
  selectionText?: string | null;
}

export interface ChatSessionMessage {
  id: number;
  session_id: number;
  role: ChatRole;
  content: string;
  context: ChatSessionMessageContext;
  created_at: string;
}

export interface ChatSessionCreateRequest {
  project_id: number;
  title?: string | null;
}

export interface ChatMessageCreateRequest {
  content: string;
  chapter_title: string;
  chapter_group_title: string;
  active_chapter_id?: number | null;
  selection_text?: string | null;
}

export interface ChatMessageCreateResponse {
  session: ChatSessionSummary;
  messages: ChatSessionMessage[];
}

export interface ChatSessionClearResponse {
  session_id: number;
  cleared: boolean;
  updated_at: string;
}
