"use client";

import * as React from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, ListTodo, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useCreateDailyCheckin,
  useCreateDailyTodo,
  useCreateMonthlyFixedTodo,
  useDailyCheckin,
  useDailyCheckinMonth,
  useDeleteDailyTodo,
  useDeleteMonthlyFixedTodo,
  useMakeUpDailyCheckin,
  useMonthlyFixedTodos,
  useUpdateDailyTodo,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { DailyCheckinDayStatus, DailyTodo } from "@/lib/types";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const TEMPLATE_WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function todayKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

function moveMonth(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, value - 1 + offset, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function calendarCells(month: string) {
  const [year, value] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, value - 1, 1));
  const leading = first.getUTCDay();
  const total = new Date(Date.UTC(year, value, 0)).getUTCDate();
  const cells: Array<{ date: string; label: number } | null> = Array(leading).fill(null);
  for (let day = 1; day <= total; day += 1) {
    cells.push({ date: `${month}-${String(day).padStart(2, "0")}`, label: day });
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}

function TodoItem({ todo, canEdit, canComplete, pending, onUpdate, onDelete }: {
  todo: DailyTodo;
  canEdit: boolean;
  canComplete: boolean;
  pending: boolean;
  onUpdate: (payload: { content?: string; completed?: boolean }) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [content, setContent] = React.useState(todo.content);

  React.useEffect(() => setContent(todo.content), [todo.content]);

  function save() {
    const next = content.trim();
    if (!next) return toast.error("待办内容不能为空");
    if (next !== todo.content) onUpdate({ content: next });
    setEditing(false);
  }

  return (
    <li className="flex items-center gap-2 border-b py-2 last:border-0">
      <button
        type="button"
        disabled={!canComplete || pending}
        className="shrink-0 disabled:cursor-not-allowed"
        aria-label={todo.completed ? "已完成" : "未完成"}
        onClick={() => onUpdate({ completed: !todo.completed })}
      >
        {todo.completed ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
      </button>
      {editing ? (
        <Input
          autoFocus
          className="h-8 flex-1"
          value={content}
          disabled={pending}
          onChange={(event) => setContent(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
            if (event.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <button type="button" disabled={!canEdit || pending} onClick={() => setEditing(true)} className={cn("min-w-0 flex-1 text-left text-sm", todo.completed && "text-muted-foreground line-through")}>
          {todo.content}
        </button>
      )}
      {canEdit && !editing && (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={pending} onClick={onDelete} aria-label="删除待办">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}
    </li>
  );
}

export function DailyCheckin({ projectId }: { projectId: number }) {
  const today = todayKey();
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState(today.slice(0, 7));
  const [selectedDay, setSelectedDay] = React.useState(today);
  const [taskContent, setTaskContent] = React.useState("");
  const [fixedContent, setFixedContent] = React.useState("");
  const [fixedWeekdays, setFixedWeekdays] = React.useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  const { data: todaySummary } = useDailyCheckin(projectId);
  const { data: summary, isLoading } = useDailyCheckin(projectId, selectedDay);
  const { data: monthSummary } = useDailyCheckinMonth(projectId, month);
  const { data: fixedTodos = [] } = useMonthlyFixedTodos(projectId, month);
  const createTodo = useCreateDailyTodo(projectId);
  const updateTodo = useUpdateDailyTodo(projectId);
  const deleteTodo = useDeleteDailyTodo(projectId);
  const checkin = useCreateDailyCheckin(projectId);
  const makeUp = useMakeUpDailyCheckin(projectId);
  const createFixed = useCreateMonthlyFixedTodo(projectId);
  const deleteFixed = useDeleteMonthlyFixedTodo(projectId);
  const pending = createTodo.isPending || updateTodo.isPending || deleteTodo.isPending || checkin.isPending || makeUp.isPending || createFixed.isPending || deleteFixed.isPending;
  const isToday = selectedDay === today;
  const isPast = selectedDay < today;
  const isFuture = selectedDay > today;
  const isEditable = selectedDay >= today && !summary?.locked;
  const completed = summary?.completed_count ?? 0;
  const total = summary?.total_count ?? 0;
  const allCompleted = summary?.all_completed ?? false;
  const canCheckIn = isToday && total > 0 && !summary?.checked_in;
  const canMakeUp = isPast && !summary?.checked_in && (summary?.makeup_remaining ?? 0) > 0;
  const statusByDate = React.useMemo(() => new Map(monthSummary?.days.map((status) => [status.date, status])), [monthSummary]);

  function fail(error: Error) {
    toast.error(error.message || "操作失败，请稍后重试");
  }

  function changeMonth(offset: number) {
    const next = moveMonth(month, offset);
    setMonth(next);
    setSelectedDay(`${next}-01`);
  }

  function addTask(event: React.FormEvent) {
    event.preventDefault();
    const content = taskContent.trim();
    if (!content) return;
    createTodo.mutate({ day: selectedDay, payload: { content } }, { onSuccess: () => setTaskContent(""), onError: fail });
  }

  function addFixedTask(event: React.FormEvent) {
    event.preventDefault();
    const content = fixedContent.trim();
    if (!content || fixedWeekdays.length === 0) return;
    createFixed.mutate({ month, content, weekdays: fixedWeekdays }, { onSuccess: () => setFixedContent(""), onError: fail });
  }

  function toggleWeekday(day: number) {
    setFixedWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b));
  }

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(true)} aria-label="签到日历">
              {todaySummary?.checked_in ? <CheckCircle2 className={cn("h-4 w-4", todaySummary.all_completed ? "text-primary" : "text-amber-500")} /> : <ListTodo className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>签到日历</TooltipContent>
        </Tooltip>
        <DialogContent className="grid w-[calc(100vw-2rem)] max-w-5xl gap-0 overflow-hidden p-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(19rem,0.9fr)]">
          <div className="min-w-0 p-4 lg:border-r lg:p-5">
            <DialogHeader className="mb-3 text-left">
              <DialogTitle>签到日历</DialogTitle>
              <DialogDescription>连续签到 {todaySummary?.current_streak ?? 0} 天</DialogDescription>
            </DialogHeader>
            <div className="mb-3 flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => changeMonth(-1)} aria-label="上个月"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm font-medium">{month.replace("-", " 年 ")} 月</span>
              <Button variant="ghost" size="icon" onClick={() => changeMonth(1)} aria-label="下个月"><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-7 border-l border-t">
              {WEEKDAYS.map((value) => <div key={value} className="border-b border-r py-1 text-center text-xs text-muted-foreground">{value}</div>)}
              {calendarCells(month).map((cell, index) => {
                const status: DailyCheckinDayStatus | undefined = cell ? statusByDate.get(cell.date) : undefined;
                const progress = status?.total_count ? `${status.completed_count}/${status.total_count}` : "";
                return cell ? (
                  <button key={cell.date} type="button" onClick={() => setSelectedDay(cell.date)} className={cn("relative min-h-16 border-b border-r p-1.5 text-left hover:bg-muted/60", selectedDay === cell.date && "bg-muted", today === cell.date && "ring-1 ring-inset ring-primary", status?.checked_in && (status.all_completed ? "bg-primary/10" : "bg-amber-500/10"))}>
                    <span className="text-xs font-medium">{cell.label}</span>
                    {status?.is_makeup && <span className="absolute right-1 top-1 rounded bg-amber-100 px-1 text-[9px] font-medium leading-tight text-amber-700">补</span>}
                    {progress && <span className="absolute bottom-1 left-1.5 text-[10px] text-muted-foreground">{progress}</span>}
                    {status?.checked_in && <CheckCircle2 className={cn("absolute bottom-1 right-1 h-3.5 w-3.5", status.all_completed ? "text-primary" : "text-amber-500")} aria-label={status.all_completed ? "全部完成已签到" : "部分完成已签到"} />}
                  </button>
                ) : <div key={`blank-${index}`} className="min-h-16 border-b border-r bg-muted/20" />;
              })}
            </div>
            {month >= today.slice(0, 7) && (
              <section className="mt-4 border-t pt-4">
                <h3 className="text-sm font-medium">本月固定待办</h3>
                <form className="mt-2 space-y-2" onSubmit={addFixedTask}>
                  <Input value={fixedContent} maxLength={500} placeholder="例如：完成 1000 字" onChange={(event) => setFixedContent(event.target.value)} />
                  <div className="flex flex-wrap gap-1">
                    {TEMPLATE_WEEKDAYS.map((label, index) => (
                      <Button key={label} type="button" size="sm" variant={fixedWeekdays.includes(index) ? "default" : "outline"} onClick={() => toggleWeekday(index)}>{label}</Button>
                    ))}
                  </div>
                  <Button type="submit" size="sm" disabled={pending || !fixedContent.trim() || fixedWeekdays.length === 0}>添加固定待办</Button>
                </form>
                {fixedTodos.length > 0 && <ul className="mt-3 space-y-1">{fixedTodos.map((item) => <li key={item.id} className="flex items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{item.content}</span><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteFixed.mutate({ templateId: item.id, month }, { onError: fail })} aria-label="删除固定待办"><Trash2 className="h-3.5 w-3.5" /></Button></li>)}</ul>}
              </section>
            )}
          </div>
          <div className="min-w-0 border-t p-4 lg:border-t-0 lg:p-5">
            <h3 className="text-sm font-medium">{selectedDay}</h3>
            {isLoading ? <p className="py-8 text-center text-sm text-muted-foreground">正在加载记录...</p> : <div className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">完成 {completed}/{total} 项{summary?.checked_in ? "，已签到" : ""}</p>
              {isEditable && <form className="flex gap-2" onSubmit={addTask}><Input value={taskContent} maxLength={500} placeholder={isFuture ? "规划未来待办" : "添加待办事项"} onChange={(event) => setTaskContent(event.target.value)} /><Button type="submit" size="icon" disabled={pending || !taskContent.trim()} aria-label="添加待办"><Plus className="h-4 w-4" /></Button></form>}
              {summary?.todos.length ? <ul className="max-h-72 overflow-y-auto">{summary.todos.map((todo) => <TodoItem key={todo.id} todo={todo} canEdit={isEditable} canComplete={isToday && isEditable} pending={pending} onUpdate={(payload) => updateTodo.mutate({ todoId: todo.id, day: selectedDay, payload }, { onError: fail })} onDelete={() => deleteTodo.mutate({ todoId: todo.id, day: selectedDay }, { onError: fail })} />)}</ul> : <p className="py-6 text-center text-sm text-muted-foreground">这一天没有待办。</p>}
              {summary?.checked_in ? (
                <div className={cn("flex items-center gap-2 border-t pt-3 text-sm font-medium", allCompleted ? "text-primary" : "text-amber-600")}>
                  <CheckCircle2 className={cn("h-4 w-4", allCompleted ? "text-primary" : "text-amber-500")} />
                  {summary.is_makeup ? `补签完成${total > 0 ? ` · 完成 ${completed}/${total} 项` : ""}` : allCompleted ? "当日已签到 · 全部完成" : `当日已签到 · 完成 ${completed}/${total} 项`}
                </div>
              ) : isToday ? (
                <Button className="w-full" disabled={!canCheckIn || pending} onClick={() => checkin.mutate(undefined, { onError: fail })}>
                  {total === 0 ? "请先添加待办" : allCompleted ? "完成今日签到" : `签到（还有 ${total - completed} 项未完成）`}
                </Button>
              ) : isPast ? (
                <div className="space-y-2 border-t pt-3">
                  <Button className="w-full" variant="outline" disabled={!canMakeUp || pending} onClick={() => makeUp.mutate(selectedDay, { onSuccess: () => toast.success("补签成功"), onError: fail })}>
                    {(summary?.makeup_remaining ?? 0) > 0 ? "使用补签卡补签" : "本月补签卡已用完"}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">本月补签卡剩余 {summary?.makeup_remaining ?? 0} / {summary?.makeup_total ?? 8} 张</p>
                </div>
              ) : null}
            </div>}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
