"use client";

import * as React from "react";
import { CheckCircle2, Circle, ListTodo, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useCreateDailyCheckin,
  useCreateDailyTodo,
  useDailyCheckin,
  useDeleteDailyTodo,
  useUpdateDailyTodo,
} from "@/lib/queries";
import type { DailyTodo } from "@/lib/types";

function TodoRow({
  todo,
  locked,
  pending,
  onUpdate,
  onDelete,
}: {
  todo: DailyTodo;
  locked: boolean;
  pending: boolean;
  onUpdate: (payload: { content?: string; completed?: boolean }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [content, setContent] = React.useState(todo.content);

  React.useEffect(() => setContent(todo.content), [todo.content]);

  function saveEdit() {
    const next = content.trim();
    if (!next) {
      toast.error("待办内容不能为空");
      return;
    }
    if (next !== todo.content) onUpdate({ content: next });
    setEditing(false);
  }

  return (
    <li className="flex min-w-0 items-center gap-2 border-b py-2 last:border-b-0">
      <button
        type="button"
        className="shrink-0 text-muted-foreground transition-colors hover:text-primary disabled:cursor-not-allowed"
        aria-label={todo.completed ? "标记为未完成" : "标记为已完成"}
        disabled={locked || pending}
        onClick={() => onUpdate({ completed: !todo.completed })}
      >
        {todo.completed ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4" />}
      </button>
      {editing ? (
        <Input
          value={content}
          disabled={pending}
          className="h-8 min-w-0 flex-1"
          autoFocus
          onChange={(event) => setContent(event.target.value)}
          onBlur={saveEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter") saveEdit();
            if (event.key === "Escape") {
              setContent(todo.content);
              setEditing(false);
            }
          }}
        />
      ) : (
        <span className={todo.completed ? "min-w-0 flex-1 truncate text-muted-foreground line-through" : "min-w-0 flex-1 truncate"}>
          {todo.content}
        </span>
      )}
      {!locked && !editing && (
        <div className="flex shrink-0 items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={pending} onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">编辑待办</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>编辑待办</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={pending} onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                <span className="sr-only">删除待办</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>删除待办</TooltipContent>
          </Tooltip>
        </div>
      )}
    </li>
  );
}

export function DailyCheckin({ projectId }: { projectId: number }) {
  const [open, setOpen] = React.useState(false);
  const [content, setContent] = React.useState("");
  const { data: summary, isLoading } = useDailyCheckin(projectId);
  const createTodo = useCreateDailyTodo(projectId);
  const updateTodo = useUpdateDailyTodo(projectId);
  const deleteTodo = useDeleteDailyTodo(projectId);
  const checkin = useCreateDailyCheckin(projectId);
  const isPending = createTodo.isPending || updateTodo.isPending || deleteTodo.isPending || checkin.isPending;

  const completed = summary?.completed_count ?? 0;
  const total = summary?.total_count ?? 0;
  const remaining = Math.max(total - completed, 0);
  const canCheckIn = total > 0 && remaining === 0 && !summary?.checked_in;

  function showError(error: Error) {
    toast.error(error.message || "操作失败，请稍后重试");
  }

  function addTodo(event: React.FormEvent) {
    event.preventDefault();
    const next = content.trim();
    if (!next) return;
    createTodo.mutate(
      { content: next },
      {
        onSuccess: () => setContent(""),
        onError: showError,
      },
    );
  }

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(true)} aria-label="今日待办">
            {summary?.checked_in ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <ListTodo className="h-4 w-4" />}
            {total > 0 && !summary?.checked_in && (
              <span className="absolute -right-1 -top-1 rounded-full bg-muted px-1 text-[10px] leading-4 text-muted-foreground">
                {completed}/{total}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{summary?.checked_in ? "今日已签到" : "今日待办"}</TooltipContent>
      </Tooltip>

      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>今日待办</DialogTitle>
          <DialogDescription>
            {summary?.checked_in
              ? `今日已签到，连续 ${summary.current_streak} 天`
              : total > 0
                ? `已完成 ${completed}/${total} 项${remaining > 0 ? `，还差 ${remaining} 项` : "，可以签到"}`
                : "添加今天要完成的写作任务"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">正在加载待办...</div>
          ) : (
            <>
              {!summary?.locked && (
                <form className="flex gap-2" onSubmit={addTodo}>
                  <Input
                    value={content}
                    disabled={isPending}
                    maxLength={500}
                    placeholder="添加待办事项"
                    onChange={(event) => setContent(event.target.value)}
                  />
                  <Button type="submit" size="icon" disabled={isPending || !content.trim()} aria-label="添加待办">
                    <Plus className="h-4 w-4" />
                  </Button>
                </form>
              )}

              {summary?.todos.length ? (
                <ul className="max-h-64 overflow-y-auto">
                  {summary.todos.map((todo) => (
                    <TodoRow
                      key={todo.id}
                      todo={todo}
                      locked={summary.locked}
                      pending={isPending}
                      onUpdate={(payload) => updateTodo.mutate({ todoId: todo.id, payload }, { onError: showError })}
                      onDelete={() => deleteTodo.mutate(todo.id, { onError: showError })}
                    />
                  ))}
                </ul>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">今天还没有待办事项。</p>
              )}

              {summary?.checked_in ? (
                <div className="flex items-center justify-center gap-2 border-t pt-4 text-sm font-medium text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                  今日已签到，连续 {summary.current_streak} 天
                </div>
              ) : (
                <Button className="w-full" disabled={!canCheckIn || isPending} onClick={() => checkin.mutate(undefined, { onError: showError })}>
                  {checkin.isPending ? "正在签到..." : canCheckIn ? "完成今日签到" : total === 0 ? "请先添加待办" : `完成剩余 ${remaining} 项后签到`}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
