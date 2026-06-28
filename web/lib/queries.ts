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
} from "./types";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
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

export function useImportLore(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LoreImportRequest) => api.importLore(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lore", projectId] });
      queryClient.invalidateQueries({ queryKey: ["timeline", projectId] });
    },
  });
}

export function useStyleProfile(projectId: number) {
  return useQuery({
    queryKey: ["style-profile", projectId],
    queryFn: () => api.getStyleProfile(projectId),
    enabled: Number.isFinite(projectId),
  });
}

export function useBuildStyleProfile(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: StyleProfileRequest) => api.buildStyleProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["style-profile", projectId] });
    },
  });
}

export function useDraft() {
  return useMutation({
    mutationFn: ({ taskType, payload }: { taskType: TaskType; payload: DraftRequest }) =>
      api.createDraft(taskType, payload),
  });
}

export function useCheckConsistency() {
  return useMutation({
    mutationFn: ({ projectId, text }: { projectId: number; text: string }) =>
      api.checkConsistency({ project_id: projectId, text }),
  });
}

export function useApplyPatch(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      patchSetId,
      acceptedIds,
      chapterTitle,
      chapterId,
      groupTitle,
    }: {
      patchSetId: number;
      acceptedIds: number[];
      chapterTitle: string;
      chapterId?: number | null;
      groupTitle?: string;
    }) =>
      api.applyPatch({
        patch_set_id: patchSetId,
        accepted_ids: acceptedIds,
        chapter_title: chapterTitle,
        chapter_id: chapterId,
        group_title: groupTitle,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapters", projectId] });
      queryClient.invalidateQueries({ queryKey: ["timeline", projectId] });
    },
  });
}

export function useSaveChapter(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChapterSaveRequest) => api.saveChapter(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapters", projectId] });
    },
  });
}

export function useRenameChapter(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterId, title }: { chapterId: number; title: string }) =>
      api.renameChapter(chapterId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapters", projectId] });
    },
  });
}

export function useMoveChapter(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      chapterId,
      groupTitle,
      sortOrder,
    }: {
      chapterId: number;
      groupTitle: string;
      sortOrder?: number | null;
    }) =>
      api.moveChapter(chapterId, {
        group_title: groupTitle,
        sort_order: sortOrder,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapters", projectId] });
    },
  });
}

export function useDeleteChapter(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chapterId: number) => api.deleteChapter(chapterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chapters", projectId] });
    },
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
    onSuccess: (data, chapterId) => {
      queryClient.setQueryData(["backup-status", chapterId], data);
    },
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
  return useQuery({
    queryKey: ["llm-settings"],
    queryFn: api.getLlmSettings,
  });
}

export function useUpdateLlmSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: LlmSettingsPayload) => api.updateLlmSettings(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["llm-settings"] });
    },
  });
}

export function useTestLlmSettings() {
  return useMutation({
    mutationFn: (payload: LlmSettingsPayload) => api.testLlmSettings(payload),
  });
}

export function useAnalyzeSelection() {
  return useMutation({
    mutationFn: (payload: InlineAnalyzeRequest) => api.analyzeSelection(payload),
  });
}

export function useReviseSelection() {
  return useMutation({
    mutationFn: (payload: InlineReviseRequest) => api.reviseSelection(payload),
  });
}
