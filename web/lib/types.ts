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

export interface DailyTodo {
  id: number;
  content: string;
  completed: boolean;
  sort_order: number;
  created_at: string;
  completed_at: string | null;
}

export interface DailyCheckinSummary {
  project_id: number;
  date: string;
  todos: DailyTodo[];
  total_count: number;
  completed_count: number;
  checked_in: boolean;
  is_makeup: boolean;
  locked: boolean;
  current_streak: number;
  all_completed: boolean;
  makeup_total: number;
  makeup_used: number;
  makeup_remaining: number;
  can_make_up: boolean;
}

export interface DailyCheckinDayStatus {
  date: string;
  total_count: number;
  completed_count: number;
  all_completed: boolean;
  checked_in: boolean;
  is_makeup: boolean;
}

export interface DailyCheckinMonthSummary {
  project_id: number;
  month: string;
  today: string;
  days: DailyCheckinDayStatus[];
}

export interface MonthlyFixedTodo {
  id: number;
  month_key: string;
  content: string;
  weekdays: number[];
  created_at: string;
  updated_at: string;
}

export interface MonthlyFixedTodo {
  id: number;
  month_key: string;
  content: string;
  weekdays: number[];
  created_at: string;
  updated_at: string;
}

export interface DailyTodoCreateRequest {
  content: string;
}

export interface DailyTodoUpdateRequest {
  content?: string;
  completed?: boolean;
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

export type ContinueIntent =
  | "advance"
  | "dialogue"
  | "scenery"
  | "conflict"
  | "slow"
  | "payoff"
  | "free";

export interface WritingDirective {
  intent_type: ContinueIntent | string;
  beat: string;
  emotion: string;
  pov_lock: string;
  approx_length: number;
  must_include: string[];
  must_avoid: string[];
  open_threads: string[];
}

export interface ContinueRequest {
  project_id: number;
  tail_text: string;
  instruction: string;
  directive?: WritingDirective | null;
  chapter_title: string;
  budget: Budget;
  target_latency_ms: number;
}

/** 续写流式事件（对应后端 writing_agent 的 custom stream）。 */
export type ContinueStreamEvent =
  | { type: "stage"; key: "intent"; directive: WritingDirective; reused?: boolean }
  | { type: "stage"; key: "retrieve"; picked: Record<string, string[]> }
  | { type: "stage"; key: "guard"; score: number; issues: ConsistencyIssue[] }
  | { type: "stage"; key: "repair"; revision: number }
  | { type: "stage"; key: "reader"; reaction: string }
  | { type: "delta"; text: string; replace?: string }
  | {
      type: "done";
      directive: WritingDirective;
      result_text: string;
      consistency_score: number;
      issues: ConsistencyIssue[];
      reader_reaction: string;
    }
  | { type: "error"; message: string };

/** 续写实时进度（HUD）。 */
export interface GhostStages {
  intent?: WritingDirective;
  retrieveCount?: number;
  score?: number;
  issues?: ConsistencyIssue[];
  repairing?: boolean;
  reaction?: string;
}

/** 一个续写候选版本（幽灵文本轮播）。 */
export interface GhostCandidate {
  id: string;
  label: string;
  text: string;
  score: number;
  issues: ConsistencyIssue[];
  readerReaction: string;
  directive: WritingDirective | null;
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

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; session: ChatSessionSummary; messages: ChatSessionMessage[] }
  | { type: "error"; message: string };

export interface ChatSessionClearResponse {
  session_id: number;
  cleared: boolean;
  updated_at: string;
}

export type InspirationCardType = "idea" | "character" | "scene" | "conflict" | "question" | "research" | "note";

export interface InspirationCard {
  id: number;
  project_id: number;
  card_type: InspirationCardType | string;
  title: string;
  content: string;
  tags: string[];
  color: string;
  origin: "manual" | "ai";
  created_at: string;
  updated_at: string;
}

export interface InspirationCardPayload {
  card_type: InspirationCardType | string;
  title: string;
  content: string;
  tags: string[];
  color: string;
}

export interface InspirationBoardSummary {
  id: number;
  project_id: number;
  title: string;
  description: string;
  viewport: InspirationViewport;
  graph_version: number;
  node_count?: number;
  created_at: string;
  updated_at: string;
}

export interface InspirationViewport {
  x: number;
  y: number;
  zoom: number;
}

export type InspirationBoardNodeType = "card" | "annotation" | "event" | "character";

export interface InspirationBoardNode {
  id: string;
  board_id: number;
  card_id: number | null;
  node_type: InspirationBoardNodeType;
  position_x: number;
  position_y: number;
  width: number | null;
  height: number | null;
  z_index: number;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InspirationBoardEdge {
  id: string;
  board_id: number;
  source_node_id: string;
  target_node_id: string;
  edge_type: string;
  label: string;
  style: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InspirationBoardGraph extends InspirationBoardSummary {
  nodes: InspirationBoardNode[];
  edges: InspirationBoardEdge[];
}

export interface InspirationGraphPatch {
  expected_graph_version: number;
  viewport: InspirationViewport;
  nodes: InspirationBoardNode[];
  deleted_node_ids: string[];
  edges: InspirationBoardEdge[];
  deleted_edge_ids: string[];
}

export interface InspirationProposalAction {
  action_type: "create_card" | "create_edge";
  card?: InspirationCardPayload;
  source_node_id?: string;
  target_node_id?: string;
  label?: string;
}

export interface InspirationProposal {
  id: number;
  project_id: number;
  board_id: number;
  assistant_message_id: number | null;
  base_graph_version: number;
  actions: InspirationProposalAction[];
  status: "draft" | "applied" | "dismissed";
  created_at: string;
  updated_at: string;
}

export interface InspirationDiscussionPayload {
  content: string;
  selected_node_ids: string[];
}

export type InspirationDiscussionEvent =
  | { type: "delta"; text: string }
  | { type: "done"; session: ChatSessionSummary; messages: ChatSessionMessage[] }
  | { type: "error"; message: string };
