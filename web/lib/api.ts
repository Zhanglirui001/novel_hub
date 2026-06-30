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
  ConsistencyResult,
  DraftRequest,
  GenerationResult,
  InlineAnalyzeRequest,
  InlineAnalyzeResult,
  InlineReviseRequest,
  InlineReviseResult,
  BackupInfo,
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
  clearChatSession(sessionId: number) {
    return request<ChatSessionClearResponse>(`/chat-sessions/${sessionId}/clear`, {
      method: 'POST',
    });
  },
};
