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
  DailyTodoCreateRequest,
  DailyTodoUpdateRequest,
  InspirationCardPayload,
  InspirationGraphPatch,
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

export function useDailyCheckin(projectId: number, day?: string) {
  return useQuery({
    queryKey: ["daily-checkin", projectId, day ?? "today"],
    queryFn: () => (day ? api.getDailyCheckinDay(projectId, day) : api.getDailyCheckin(projectId)),
    enabled: Number.isFinite(projectId),
  });
}

export function useDailyCheckinMonth(projectId: number, month: string) {
  return useQuery({
    queryKey: ["daily-checkin-month", projectId, month],
    queryFn: () => api.getDailyCheckinMonth(projectId, month),
    enabled: Number.isFinite(projectId) && /^\d{4}-\d{2}$/.test(month),
  });
}

function useDailyCheckinCache(projectId: number) {
  const queryClient = useQueryClient();
  return (summary: Awaited<ReturnType<typeof api.getDailyCheckin>>) => {
    queryClient.setQueryData(["daily-checkin", projectId, summary.date], summary);
    queryClient.setQueryData(["daily-checkin", projectId, "today"], summary);
    queryClient.invalidateQueries({ queryKey: ["daily-checkin-month", projectId] });
  };
}

export function useCreateDailyTodo(projectId: number) {
  const setSummary = useDailyCheckinCache(projectId);
  return useMutation({
    mutationFn: ({ day, payload }: { day: string; payload: DailyTodoCreateRequest }) =>
      api.createDailyTodo(projectId, day, payload),
    onSuccess: setSummary,
  });
}

export function useUpdateDailyTodo(projectId: number) {
  const setSummary = useDailyCheckinCache(projectId);
  return useMutation({
    mutationFn: ({ todoId, day, payload }: { todoId: number; day: string; payload: DailyTodoUpdateRequest }) =>
      api.updateDailyTodo(todoId, projectId, day, payload),
    onSuccess: setSummary,
  });
}

export function useDeleteDailyTodo(projectId: number) {
  const setSummary = useDailyCheckinCache(projectId);
  return useMutation({
    mutationFn: ({ todoId, day }: { todoId: number; day: string }) => api.deleteDailyTodo(todoId, projectId, day),
    onSuccess: setSummary,
  });
}

export function useMonthlyFixedTodos(projectId: number, month: string) {
  return useQuery({
    queryKey: ["monthly-fixed-todos", projectId, month],
    queryFn: () => api.listMonthlyFixedTodos(projectId, month),
    enabled: Number.isFinite(projectId) && /^\d{4}-\d{2}$/.test(month),
  });
}

function useMonthlyFixedTodoCache(projectId: number) {
  const queryClient = useQueryClient();
  return (month: string) => {
    queryClient.invalidateQueries({ queryKey: ["monthly-fixed-todos", projectId, month] });
    queryClient.invalidateQueries({ queryKey: ["daily-checkin-month", projectId, month] });
    queryClient.invalidateQueries({ queryKey: ["daily-checkin", projectId] });
  };
}

export function useCreateMonthlyFixedTodo(projectId: number) {
  const invalidate = useMonthlyFixedTodoCache(projectId);
  return useMutation({
    mutationFn: (payload: { month: string; content: string; weekdays: number[] }) => api.createMonthlyFixedTodo(projectId, payload),
    onSuccess: (_, payload) => invalidate(payload.month),
  });
}

export function useDeleteMonthlyFixedTodo(projectId: number) {
  const invalidate = useMonthlyFixedTodoCache(projectId);
  return useMutation({
    mutationFn: ({ templateId, month: _month }: { templateId: number; month: string }) => api.deleteMonthlyFixedTodo(templateId, projectId),
    onSuccess: (_, payload) => invalidate(payload.month),
  });
}

export function useCreateDailyCheckin(projectId: number) {
  const setSummary = useDailyCheckinCache(projectId);
  return useMutation({
    mutationFn: () => api.createDailyCheckin(projectId),
    onSuccess: setSummary,
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

export function useInspirationCards(projectId: number, filters?: { search?: string; cardType?: string }) {
  return useQuery({
    queryKey: ["inspiration-cards", projectId, filters?.search ?? "", filters?.cardType ?? ""],
    queryFn: () => api.listInspirationCards(projectId, filters),
    enabled: Number.isFinite(projectId),
  });
}

export function useCreateInspirationCard(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InspirationCardPayload) => api.createInspirationCard(projectId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inspiration-cards", projectId] }),
  });
}

export function useUpdateInspirationCard(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ cardId, payload }: { cardId: number; payload: Partial<InspirationCardPayload> }) =>
      api.updateInspirationCard(projectId, cardId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inspiration-cards", projectId] }),
  });
}

export function useDeleteInspirationCard(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardId: number) => api.deleteInspirationCard(projectId, cardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspiration-cards", projectId] });
      queryClient.invalidateQueries({ queryKey: ["inspiration-boards", projectId] });
    },
  });
}

export function useInspirationBoards(projectId: number) {
  return useQuery({
    queryKey: ["inspiration-boards", projectId],
    queryFn: () => api.listInspirationBoards(projectId),
    enabled: Number.isFinite(projectId),
  });
}

export function useCreateInspirationBoard(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { title: string; description?: string }) => api.createInspirationBoard(projectId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inspiration-boards", projectId] }),
  });
}

export function useInspirationBoard(projectId: number, boardId: number | null) {
  return useQuery({
    queryKey: ["inspiration-board", projectId, boardId],
    queryFn: () => api.getInspirationBoard(projectId, boardId as number),
    enabled: Number.isFinite(projectId) && boardId !== null,
  });
}

export function usePatchInspirationGraph(projectId: number, boardId: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: InspirationGraphPatch) => api.patchInspirationGraph(projectId, boardId as number, payload),
    onSuccess: (graph) => {
      queryClient.setQueryData(["inspiration-board", projectId, boardId], graph);
      queryClient.invalidateQueries({ queryKey: ["inspiration-boards", projectId] });
    },
  });
}
