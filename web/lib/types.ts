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

export interface PatchApplyResponse {
  chapter_id: number;
  version: number;
  applied_text: string;
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
