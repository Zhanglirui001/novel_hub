import type {
  Chapter,
  ChapterSummary,
  ConsistencyResult,
  DraftRequest,
  GenerationResult,
  LoreContext,
  LoreImportRequest,
  LoreImportResponse,
  PatchApplyResponse,
  Project,
  StyleProfile,
  StyleProfileRequest,
  TaskType,
  TimelineEvent,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
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
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export const api = {
  listProjects() {
    return request<Project[]>("/projects");
  },

  createProject(payload: { name: string; description: string }) {
    return request<{ project_id: number; name: string }>("/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getProject(projectId: number) {
    return request<Project>(`/projects/${projectId}`);
  },

  listChapters(projectId: number) {
    return request<ChapterSummary[]>(`/projects/${projectId}/chapters`);
  },

  getChapter(chapterId: number) {
    return request<Chapter>(`/chapters/${chapterId}`);
  },

  getLore(projectId: number) {
    return request<LoreContext>(`/lore?project_id=${projectId}`);
  },

  importLore(payload: LoreImportRequest) {
    return request<LoreImportResponse>("/lore/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  getStyleProfile(projectId: number) {
    return request<StyleProfile | null>(`/style/profile?project_id=${projectId}`);
  },

  buildStyleProfile(payload: StyleProfileRequest) {
    return request<{ project_id: number; metrics: StyleProfile }>("/style/profile", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  createDraft(taskType: TaskType, payload: DraftRequest) {
    const path = taskType === "continue" ? "/draft/continue" : "/draft/polish";
    return request<GenerationResult>(path, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  checkConsistency(payload: { project_id: number; text: string }) {
    return request<ConsistencyResult>("/consistency/check", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  applyPatch(payload: {
    patch_set_id: number;
    accepted_ids: number[];
    chapter_title: string;
  }) {
    return request<PatchApplyResponse>("/patch/apply", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  listTimeline(projectId: number) {
    return request<TimelineEvent[]>(`/timeline?project_id=${projectId}`);
  },
};
