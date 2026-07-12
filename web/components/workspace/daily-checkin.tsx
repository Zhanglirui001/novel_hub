"use client";

import * as React from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  ListTodo,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useCreateDailyCheckin,
  useCreateDailyTodo,
  useDailyCheckin,
  useDailyCheckinMonth,
  useDeleteDailyTodo,
  useUpdateDailyTodo,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { DailyCheckinDayStatus, DailyTodo } from "@/lib/types";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function utcDateKey(value = new Date()) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, value] = month.split("-");
  return `${year} 年 ${Number(value)} 月`;
}

function addMonths(month: string, offset: number) {
  const [year, value] = month.split("-").map(Number);
  return monthKey(new Date(Date.UTC(year, value - 1 + offset, 1)));
}

function daysForMonth(month: string) {
  const [year, value] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, value - 1, 1));
  const firstWeekday = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, value, 0)).getUTCDate();
  const cells: Array<{ date: string; day: number } | null> = Array(firstWeekday).fill(null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: `${month}-${String(day).padStart(2, "0")}`, day });
  }
  while (cells.length < 42) cells.push(null);
  return cells;
}

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
  onUpdate?: (payload: { content?: string; completed?: boolean }) => void;
  onDelete?: () => void;
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
    if (next !== todo.content) onUpdate?.({ content: next });
    setEditing(false);
  }

  return (
    <li className="flex min-w-0 items-center gap-2 border-b py-2 last:border-b-0">
      <button
        type="button"
        className="shrink-0 text-muted-foreground transition-colors disabled:cursor-not-allowed"
        aria-label={todo.completed ? "已完成" : "未完成"}
        disabled={locked || pending}
        onClick={() => onUpdate?.({ completed: !todo.completed })}
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
        <span className={cn("min-w-0 flex-1 break-words", todo.completed && "text-muted-foreground line-through")}>
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

function DayCell({
  cell,
  status,
  selected,
  today,
  disabled,
  onSelect,
}: {
  cell: { date: string; day: number } | null;
  status?: DailyCheckinDayStatus;
  selected: boolean;
  today: string;
  disabled: boolean;
  onSelect: () => void;
}) {
  if (!cell) return <div className="min-h-16 border-b border-r bg-muted/20 sm:min-h-20" />;

  const allDone = status && status.total_count > 0 && status.completed_count === status.total_count;
  const progress = status && status.total_count > 0 ? `${status.completed_count}/${status.total_count}` : "";
  const label = `${cell.date}，${status?.checked_in ? "已签到" : progress ? `完成 ${progress} 项` : "无任务记录"}`;

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "relative flex min-h-16 min-w-0 flex-col items-start border-b border-r p-1.5 text-left transition-colors sm:min-h-20 sm:p-2",
        disabled ? "cursor-not-allowed text-muted-foreground/40" : "hover:bg-muted/60",
        selected && "bg-muted",
        cell.date === today && "ring-1 ring-inset ring-primary",
        status?.checked_in && "bg-primary/10",
        allDone && !status?.checked_in && "bg-emerald-500/10",
      )}
    >
      <span className="text-xs font-medium sm:text-sm">{cell.day}</span>
      {progress && <span className="mt-auto text-[10px] text-muted-foreground sm:text-xs">{progress}</span>}
      {status?.checked_in && <CheckCircle2 className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 text-primary" />}
      {!status?.checked_in && status && !allDone && status.total_count > 0 && (
        <span className="absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full bg-amber-500" />
      )}
    </button>
  );
}

export function DailyCheckin({ projectId }: { projectId: number }) {
  const today = utcDateKey();
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState(() => today.slice(0, 7));
  const [selectedDay, setSelectedDay] = React.useState(today);
  const [content, setContent] = React.useState("");
  const { data: todaySummary } = useDailyCheckin(projectId);
  const { data: monthSummary } = useDailyCheckinMonth(projectId, month);
  const { data: summary, isLoading: isDetailLoading } = useDailyCheckin(projectId, selectedDay);
  const createTodo = useCreateDailyTodo(projectId);
  const updateTodo = useUpdateDailyTodo(projectId);
  const deleteTodo = useDeleteDailyTodo(projectId);
  const checkin = useCreateDailyCheckin(projectId);
  const isPending = createTodo.isPending || updateTodo.isPending || deleteTodo.isPending || checkin.isPending;
  const isToday = selectedDay === today;
  const dayStatuses = React.useMemo(
    () => new Map(monthSummary?.days.map((status) => [status.date, status])),
    [monthSummary?.days],
  );

  const completed = summary?.completed_count ?? 0;
  const total = summary?.total_count ?? 0;
  const remaining = Math.max(total - completed, 0);
  const canCheckIn = isToday && total > 0 && remaining === 0 && !summary?.checked_in;
  const isFutureMonth = month >= today.slice(0, 7);

  function showError(error: Error) {
    toast.error(error.message || "操作失败，请稍后重试");
  }

  function selectMonth(offset: number) {
    const next = addMonths(month, offset);
    if (next > today.slice(0, 7)) return;
    setMonth(next);
    setSelectedDay(`${next}-01`);
  }

  function selectToday() {
    setMonth(today.slice(0, 7));
    setSelectedDay(today);
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
            <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(true)} aria-label="签到日历">
              {todaySummary?.checked_in ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <ListTodo className="h-4 w-4" />}
              {(todaySummary?.total_count ?? 0) > 0 && !todaySummary?.checked_in && (
                <span className="absolute -right-1 -top-1 rounded-full bg-muted px-1 text-[10px] leading-4 text-muted-foreground">
                  {todaySummary?.completed_count}/{todaySummary?.total_count}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{todaySummary?.checked_in ? "今日已签到" : "签到日历"}</TooltipContent>
        </Tooltip>

        <DialogContent className="grid w-[calc(100vw-2rem)] max-w-4xl gap-0 overflow-hidden p-0 sm:grid-cols-[minmax(0,1.45fr)_minmax(16rem,0.85fr)]">
          <div className="min-w-0 p-4 sm:border-r sm:p-5">
            <DialogHeader className="mb-4 text-left">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <DialogTitle>签到日历</DialogTitle>
                  <DialogDescription>连续签到 {todaySummary?.current_streak ?? 0} 天</DialogDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={selectToday}>今天</Button>
              </div>
            </DialogHeader>

            <div className="mb-3 flex items-center justify-between">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={() => selectMonth(-1)} aria-label="上个月">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>上个月</TooltipContent>
              </Tooltip>
              <span className="text-sm font-medium">{monthLabel(month)}</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" disabled={isFutureMonth} onClick={() => selectMonth(1)} aria-label="下个月">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>下个月</TooltipContent>
              </Tooltip>
            </div>

            <div className="grid grid-cols-7 border-l border-t">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday} className="border-b border-r py-1 text-center text-[10px] text-muted-foreground sm:text-xs">{weekday}</div>
              ))}
              {daysForMonth(month).map((cell, index) => (
                <DayCell
                  key={cell?.date ?? `blank-${index}`}
                  cell={cell}
                  status={cell ? dayStatuses.get(cell.date) : undefined}
                  selected={cell?.date === selectedDay}
                  today={today}
                  disabled={!cell || cell.date > today}
                  onSelect={() => cell && setSelectedDay(cell.date)}
                />
              ))}
            </div>
          </div>

          <div className="min-w-0 border-t p-4 sm:border-t-0 sm:p-5">
            <h3 className="text-sm font-medium">{selectedDay}</h3>
            {isDetailLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">正在加载记录...</p>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {summary?.checked_in ? `已签到，完成 ${completed}/${total} 项` : `完成 ${completed}/${total} 项`}
                </p>

                {isToday && !summary?.locked && (
                  <form className="flex gap-2" onSubmit={addTodo}>
                    <Input value={content} disabled={isPending} maxLength={500} placeholder="添加待办事项" onChange={(event) => setContent(event.target.value)} />
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
                        locked={!isToday || summary.locked}
                        pending={isPending}
                        onUpdate={isToday ? (payload) => updateTodo.mutate({ todoId: todo.id, payload }, { onError: showError }) : undefined}
                        onDelete={isToday ? () => deleteTodo.mutate(todo.id, { onError: showError }) : undefined}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">这一天没有记录。</p>
                )}

                {summary?.checked_in ? (
                  <div className="flex items-center gap-2 border-t pt-4 text-sm font-medium text-primary">
                    <CheckCircle2 className="h-4 w-4" />
                    {isToday ? `今日已签到，连续 ${summary.current_streak} 天` : "当日已签到"}
                  </div>
                ) : isToday ? (
                  <Button className="w-full" disabled={!canCheckIn || isPending} onClick={() => checkin.mutate(undefined, { onError: showError })}>
                    {checkin.isPending ? "正在签到..." : canCheckIn ? "完成今日签到" : total === 0 ? "请先添加待办" : `完成剩余 ${remaining} 项后签到`}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
