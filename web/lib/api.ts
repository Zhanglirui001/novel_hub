import {
  Chapter,
  ChapterSaveRequest,
  ChapterSaveResponse,
  ChatMessageCreateRequest,
  ChatMessageCreateResponse,
  ChatSessionClearResponse,
  ChatSessionCreateRequest,
  ChatSessionMessage,
  ChatSessionSummary,
  ChatStreamEvent,
  ConsistencyResult,
  DraftRequest,
  GenerationResult,
  InlineAnalyzeRequest,
  InlineAnalyzeResult,
  InlineReviseRequest,
  InlineReviseResult,
  BackupInfo,
  DailyCheckinMonthSummary,
  DailyCheckinSummary,
  MonthlyFixedTodo,
  DailyTodoCreateRequest,
  DailyTodoUpdateRequest,
  LlmSettings,
  LlmSettingsPayload,
  LlmTestResult,
  LoreImportRequest,
  LoreImportResponse,
  LoreContext,
  PatchApplyResponse,
  TimelineEvent,
  Project,
  StyleProfile,
  StyleProfileRequest,
  InspirationBoardGraph,
  InspirationBoardSummary,
  InspirationCard,
  InspirationCardPayload,
  InspirationDiscussionEvent,
  InspirationDiscussionPayload,
  InspirationGraphPatch,
  InspirationProposal,
  InspirationProposalAction,
  TaskType,
} from "./types";

function getApiBase() {
  const configured = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") return `${window.location.protocol}//${window.location.hostname}:8000`;
  return "http://localhost:8000";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = `请求失败 (${response.status})`;
    try {
      const body = await response.json();
      message = body.detail || body.message || message;
    } catch {
      // keep fallback message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  listProjects() {
    return request<Project[]>('/projects');
  },
  createProject(payload: { name: string; description: string }) {
    return request<{ project_id: number; name: string }>('/projects', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getProject(projectId: number) {
    return request<Project>(`/projects/${projectId}`);
  },
  getDailyCheckin(projectId: number) {
    return request<DailyCheckinSummary>(`/projects/${projectId}/daily-checkin`);
  },
  getDailyCheckinDay(projectId: number, date: string) {
    return request<DailyCheckinSummary>(`/projects/${projectId}/daily-checkin/${date}`);
  },
  getDailyCheckinMonth(projectId: number, month: string) {
    return request<DailyCheckinMonthSummary>(`/projects/${projectId}/daily-checkin/month?month=${month}`);
  },
  createDailyTodo(projectId: number, day: string, payload: DailyTodoCreateRequest) {
    return request<DailyCheckinSummary>(`/projects/${projectId}/daily-todos?day=${day}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateDailyTodo(todoId: number, projectId: number, day: string, payload: DailyTodoUpdateRequest) {
    return request<DailyCheckinSummary>(`/daily-todos/${todoId}?project_id=${projectId}&day=${day}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteDailyTodo(todoId: number, projectId: number, day: string) {
    return request<DailyCheckinSummary>(`/daily-todos/${todoId}?project_id=${projectId}&day=${day}`, {
      method: 'DELETE',
    });
  },
  listMonthlyFixedTodos(projectId: number, month: string) {
    return request<MonthlyFixedTodo[]>(`/projects/${projectId}/monthly-fixed-todos?month=${month}`);
  },
  createMonthlyFixedTodo(projectId: number, payload: { month: string; content: string; weekdays: number[] }) {
    return request<MonthlyFixedTodo[]>(`/projects/${projectId}/monthly-fixed-todos`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  deleteMonthlyFixedTodo(templateId: number, projectId: number) {
    return request<{ month: string }>(`/monthly-fixed-todos/${templateId}?project_id=${projectId}`, {
      method: 'DELETE',
    });
  },
  createDailyCheckin(projectId: number) {
    return request<DailyCheckinSummary>(`/projects/${projectId}/daily-checkin`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  makeUpDailyCheckin(projectId: number, day: string) {
    return request<DailyCheckinSummary>(`/projects/${projectId}/daily-checkin/${day}/makeup`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  listChapters(projectId: number) {
    return request<Chapter[]>(`/projects/${projectId}/chapters`);
  },
  getChapter(chapterId: number) {
    return request<Chapter>(`/chapters/${chapterId}`);
  },
  saveChapter(payload: ChapterSaveRequest) {
    return request<ChapterSaveResponse>('/chapters', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  renameChapter(chapterId: number, title: string) {
    return request<{ chapter_id: number; title: string; updated_at: string }>(`/chapters/${chapterId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  },
  moveChapter(chapterId: number, payload: { group_title: string; sort_order?: number | null }) {
    return request<{ chapter_id: number; group_title: string; sort_order: number; updated_at: string }>(
      `/chapters/${chapterId}/placement`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  },
  deleteChapter(chapterId: number) {
    return request<{ chapter_id: number; deleted: boolean }>(`/chapters/${chapterId}`, {
      method: 'DELETE',
    });
  },
  getBackupStatus(chapterId: number) {
    return request<BackupInfo>(`/chapters/${chapterId}/backup`);
  },
  backupChapter(chapterId: number) {
    return request<BackupInfo>(`/chapters/${chapterId}/backup`, { method: 'POST' });
  },
  getLore(projectId: number) {
    return request<LoreContext>(`/lore?project_id=${projectId}`);
  },
  importLore(payload: LoreImportRequest) {
    return request<LoreImportResponse>('/lore/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getStyleProfile(projectId: number) {
    return request<StyleProfile | null>(`/style/profile?project_id=${projectId}`);
  },
  buildStyleProfile(payload: StyleProfileRequest) {
    return request<{ project_id: number; metrics: StyleProfile }>('/style/profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createDraft(taskType: TaskType, payload: DraftRequest) {
    const path = taskType === 'continue' ? '/draft/continue' : '/draft/polish';
    return request<GenerationResult>(path, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  analyzeSelection(payload: InlineAnalyzeRequest) {
    return request<InlineAnalyzeResult>('/draft/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  reviseSelection(payload: InlineReviseRequest) {
    return request<InlineReviseResult>('/draft/revise', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  checkConsistency(payload: { project_id: number; text: string }) {
    return request<ConsistencyResult>('/consistency/check', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  applyPatch(payload: {
    patch_set_id: number;
    accepted_ids: number[];
    chapter_title: string;
    chapter_id?: number | null;
    group_title?: string;
  }) {
    return request<PatchApplyResponse>('/patch/apply', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  listTimeline(projectId: number) {
    return request<TimelineEvent[]>(`/timeline?project_id=${projectId}`);
  },
  getLlmSettings() {
    return request<LlmSettings>('/settings/llm');
  },
  updateLlmSettings(payload: LlmSettingsPayload) {
    return request<LlmSettings>('/settings/llm', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  testLlmSettings(payload: LlmSettingsPayload) {
    return request<LlmTestResult>('/settings/llm/test', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  listChatSessions(projectId: number) {
    return request<ChatSessionSummary[]>(`/projects/${projectId}/chat-sessions`);
  },
  createChatSession(payload: ChatSessionCreateRequest) {
    return request<ChatSessionSummary>('/chat-sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  listChatMessages(sessionId: number) {
    return request<ChatSessionMessage[]>(`/chat-sessions/${sessionId}/messages`);
  },
  sendChatMessage(sessionId: number, payload: ChatMessageCreateRequest) {
    return request<ChatMessageCreateResponse>(`/chat-sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  async streamChatMessage(
    sessionId: number,
    payload: ChatMessageCreateRequest,
    handlers: { onEvent: (event: ChatStreamEvent) => void; signal?: AbortSignal },
  ) {
    const response = await fetch(`${getApiBase()}/chat-sessions/${sessionId}/messages/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: handlers.signal,
    });
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `请求失败：HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const flush = (chunk: string) => {
      // SSE 事件以空行分隔，每个事件可能含多行 data:。
      for (const rawEvent of chunk.split('\n\n')) {
        const dataLines = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice('data:'.length).trimStart());
        if (dataLines.length === 0) continue;
        const data = dataLines.join('\n');
        try {
          handlers.onEvent(JSON.parse(data) as ChatStreamEvent);
        } catch {
          /* 忽略无法解析的心跳/空片段 */
        }
      }
    };

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lastBreak = buffer.lastIndexOf('\n\n');
        if (lastBreak === -1) continue;
        flush(buffer.slice(0, lastBreak));
        buffer = buffer.slice(lastBreak + 2);
      }
      buffer += decoder.decode();
      if (buffer.trim()) flush(buffer);
    } finally {
      reader.releaseLock();
    }
  },
  clearChatSession(sessionId: number) {
    return request<ChatSessionClearResponse>(`/chat-sessions/${sessionId}/clear`, {
      method: 'POST',
    });
  },
  listInspirationCards(projectId: number, filters?: { search?: string; cardType?: string }) {
    const params = new URLSearchParams();
    if (filters?.search) params.set('search', filters.search);
    if (filters?.cardType) params.set('card_type', filters.cardType);
    const query = params.toString();
    return request<InspirationCard[]>(`/projects/${projectId}/inspiration/cards${query ? `?${query}` : ''}`);
  },
  createInspirationCard(projectId: number, payload: InspirationCardPayload) {
    return request<InspirationCard>(`/projects/${projectId}/inspiration/cards`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateInspirationCard(projectId: number, cardId: number, payload: Partial<InspirationCardPayload>) {
    return request<InspirationCard>(`/projects/${projectId}/inspiration/cards/${cardId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteInspirationCard(projectId: number, cardId: number) {
    return request<{ card_id: number; deleted: boolean }>(`/projects/${projectId}/inspiration/cards/${cardId}`, {
      method: 'DELETE',
    });
  },
  listInspirationBoards(projectId: number) {
    return request<InspirationBoardSummary[]>(`/projects/${projectId}/inspiration/boards`);
  },
  createInspirationBoard(projectId: number, payload: { title: string; description?: string }) {
    return request<InspirationBoardSummary>(`/projects/${projectId}/inspiration/boards`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getInspirationBoard(projectId: number, boardId: number) {
    return request<InspirationBoardGraph>(`/projects/${projectId}/inspiration/boards/${boardId}`);
  },
  updateInspirationBoard(projectId: number, boardId: number, payload: { title?: string; description?: string }) {
    return request<InspirationBoardSummary>(`/projects/${projectId}/inspiration/boards/${boardId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteInspirationBoard(projectId: number, boardId: number) {
    return request<{ board_id: number; deleted: boolean }>(`/projects/${projectId}/inspiration/boards/${boardId}`, {
      method: 'DELETE',
    });
  },
  patchInspirationGraph(projectId: number, boardId: number, payload: InspirationGraphPatch) {
    return request<InspirationBoardGraph>(`/projects/${projectId}/inspiration/boards/${boardId}/graph`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  createInspirationProposal(projectId: number, boardId: number, payload: { base_graph_version: number; actions: InspirationProposalAction[] }) {
    return request<InspirationProposal>(`/projects/${projectId}/inspiration/boards/${boardId}/proposals`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  applyInspirationProposal(projectId: number, proposalId: number) {
    return request<{ proposal_id: number; status: string; created_cards: InspirationCard[]; graph: InspirationBoardGraph }>(
      `/projects/${projectId}/inspiration/proposals/${proposalId}/apply`,
      { method: 'POST' },
    );
  },
  dismissInspirationProposal(projectId: number, proposalId: number) {
    return request<{ proposal_id: number; status: string }>(`/projects/${projectId}/inspiration/proposals/${proposalId}/dismiss`, {
      method: 'POST',
    });
  },
  async streamInspirationDiscussion(
    projectId: number,
    boardId: number,
    payload: InspirationDiscussionPayload,
    handlers: { onEvent: (event: InspirationDiscussionEvent) => void; signal?: AbortSignal },
  ) {
    const response = await fetch(`${getApiBase()}/projects/${projectId}/inspiration/boards/${boardId}/discussion/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: handlers.signal,
    });
    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `请求失败：HTTP ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const flush = (chunk: string) => {
      for (const rawEvent of chunk.split('\n\n')) {
        const data = rawEvent.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (!data) continue;
        try {
          handlers.onEvent(JSON.parse(data) as InspirationDiscussionEvent);
        } catch {
          // Ignore incomplete or invalid stream chunks.
        }
      }
    };
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lastBreak = buffer.lastIndexOf('\n\n');
        if (lastBreak === -1) continue;
        flush(buffer.slice(0, lastBreak));
        buffer = buffer.slice(lastBreak + 2);
      }
      buffer += decoder.decode();
      if (buffer.trim()) flush(buffer);
    } finally {
      reader.releaseLock();
    }
  },
};
