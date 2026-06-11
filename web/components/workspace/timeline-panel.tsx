"use client";

import { Clock } from "lucide-react";

import { useTimeline } from "@/lib/queries";
import { formatDate } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

export function TimelinePanel() {
  const { projectId } = useWorkspace();
  const { data: events, isLoading } = useTimeline(projectId);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">加载中…</p>;
  }

  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
        <Clock className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          还没有时间线事件。导入设定或保存章节后会在此累积。
        </p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-5 border-l pl-5">
      {events.map((ev, i) => (
        <li key={i} className="relative animate-fade-in">
          <span className="absolute -left-[1.43rem] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{ev.label}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
              {ev.source}
            </span>
          </div>
          {ev.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{ev.description}</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            {formatDate(ev.event_time)}
          </p>
        </li>
      ))}
    </ol>
  );
}
