import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "./api";
import type {
  ChapterSaveRequest,
  DraftRequest,
  InlineAnalyzeRequest,
  InlineReviseRequest,
  LlmSettingsPayload,
  LoreImportRequest,
  StyleProfileRequest,
  TaskType,
  ChatMessageCreateRequest,
  ChatSessionCreateRequest,
} from "./types";

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useProject(projectId: number) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId),
    enabled: Number.isFinite(projectId),
  });
}

export function useChapters(projectId: number) {
  return useQuery({
    queryKey: ["chapters", projectId],
    queryFn: () => api.listChapters(projectId),
    enabled: Number.isFinite(projectId),
  });
}

export function useLore(projectId: number) {
  return useQuery({
    queryKey: ["lore", projectId],
    queryFn: () => api.getLore(projectId),
    enabled: Number.isFinite(projectId),
  });
}

export function useImportLore(_projectId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoreImportRequest) => api.importLore(payload),
    onSuccess: (_, payload) => queryClient.invalidateQueries({ queryKey: ["lore", payload.project_id] }),
  });
}

export function useStyleProfile(projectId: number) {
  return useQuery({
    queryKey: ["style-profile", projectId],
    queryFn: () => api.getStyleProfile(projectId),
    enabled: Number.isFinite(projectId),
  });
}

export function useBuildStyleProfile(_projectId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StyleProfileRequest) => api.buildStyleProfile(payload),
    onSuccess: (_, payload) => queryClient.invalidateQueries({ queryKey: ["style-profile", payload.project_id] }),
  });
}

type DraftMutationPayload = DraftRequest | { taskType: TaskType; payload: DraftRequest };

export function useGenerateDraft(taskType: TaskType = "continue") {
  return useMutation({
    mutationFn: (input: DraftMutationPayload) =>
      "payload" in input
        ? api.createDraft(input.taskType, input.payload)
        : api.createDraft(taskType, input),
  });
}

type ConsistencyPayload =
  | { project_id: number; text: string }
  | { projectId: number; text: string };

export function useConsistencyCheck() {
  return useMutation({
    mutationFn: (payload: ConsistencyPayload) =>
      api.checkConsistency(
        "projectId" in payload
          ? { project_id: payload.projectId, text: payload.text }
          : payload,
      ),
  });
}

export function useDraft(taskType: TaskType = "continue") {
  return useGenerateDraft(taskType);
}

export function useCheckConsistency() {
  return useConsistencyCheck();
}

type ApplyPatchPayload =
  | {
      patch_set_id: number;
      accepted_ids: number[];
      chapter_title: string;
      chapter_id?: number | null;
      group_title?: string;
    }
  | {
      patchSetId: number;
      acceptedIds: number[];
      chapterTitle: string;
      chapterId?: number | null;
      groupTitle?: string;
    };

export function useApplyPatch(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ApplyPatchPayload) => {
      if ("patchSetId" in payload) {
        return api.applyPatch({
          patch_set_id: payload.patchSetId,
          accepted_ids: payload.acceptedIds,
          chapter_title: payload.chapterTitle,
          chapter_id: payload.chapterId,
          group_title: payload.groupTitle,
        });
      }
      return api.applyPatch(payload);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chapters", projectId] }),
  });
}

export function useSaveChapter(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChapterSaveRequest) => api.saveChapter(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chapters", projectId] }),
  });
}

export function useRenameChapter(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterId, title }: { chapterId: number; title: string }) => api.renameChapter(chapterId, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chapters", projectId] }),
  });
}

export function useMoveChapter(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterId, groupTitle, sortOrder }: { chapterId: number; groupTitle: string; sortOrder?: number | null }) =>
      api.moveChapter(chapterId, { group_title: groupTitle, sort_order: sortOrder }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chapters", projectId] }),
  });
}

export function useDeleteChapter(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chapterId: number) => api.deleteChapter(chapterId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chapters", projectId] }),
  });
}

export function useBackupStatus(chapterId: number | null) {
  return useQuery({
    queryKey: ["backup-status", chapterId],
    queryFn: () => api.getBackupStatus(chapterId as number),
    enabled: chapterId !== null && Number.isFinite(chapterId),
    staleTime: 0,
  });
}

export function useBackupChapter() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chapterId: number) => api.backupChapter(chapterId),
    onSuccess: (data, chapterId) => queryClient.setQueryData(["backup-status", chapterId], data),
  });
}

export function useTimeline(projectId: number) {
  return useQuery({
    queryKey: ["timeline", projectId],
    queryFn: () => api.listTimeline(projectId),
    enabled: Number.isFinite(projectId),
  });
}

export function useLlmSettings() {
  return useQuery({ queryKey: ["llm-settings"], queryFn: api.getLlmSettings });
}

export function useUpdateLlmSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LlmSettingsPayload) => api.updateLlmSettings(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["llm-settings"] }),
  });
}

export function useTestLlmSettings() {
  return useMutation({ mutationFn: (payload: LlmSettingsPayload) => api.testLlmSettings(payload) });
}

export function useAnalyzeSelection() {
  return useMutation({ mutationFn: (payload: InlineAnalyzeRequest) => api.analyzeSelection(payload) });
}

export function useReviseSelection() {
  return useMutation({ mutationFn: (payload: InlineReviseRequest) => api.reviseSelection(payload) });
}

export function useChatSessions(projectId: number) {
  return useQuery({
    queryKey: ["chat-sessions", projectId],
    queryFn: () => api.listChatSessions(projectId),
    enabled: Number.isFinite(projectId),
  });
}

export function useChatMessages(sessionId: number | null) {
  return useQuery({
    queryKey: ["chat-messages", sessionId],
    queryFn: () => api.listChatMessages(sessionId as number),
    enabled: sessionId !== null && Number.isFinite(sessionId),
  });
}

export function useCreateChatSession(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload?: Partial<ChatSessionCreateRequest>) => api.createChatSession({ project_id: projectId, title: payload?.title ?? null }),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ["chat-sessions", projectId] });
      queryClient.setQueryData(["chat-messages", session.id], []);
    },
  });
}

export function useSendChatMessage(projectId: number, sessionId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChatMessageCreateRequest) => api.sendChatMessage(sessionId as number, payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["chat-sessions", projectId] });
      queryClient.setQueryData(["chat-messages", data.session.id], (prev: unknown) => {
        const existing = Array.isArray(prev) ? prev : [];
        return [...existing, ...data.messages];
      });
    },
  });
}

export function useClearChatSession(projectId: number, sessionId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.clearChatSession(sessionId as number),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-sessions", projectId] });
      queryClient.setQueryData(["chat-messages", sessionId], []);
    },
  });
}
