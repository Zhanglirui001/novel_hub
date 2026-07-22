"use client";

import { BookOpen, Clock, FileEdit, Sparkles, type LucideIcon } from "lucide-react";

import { useTimeline } from "@/lib/queries";
import { cn, formatDate } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

// 时间线事件按 source 归类：中文标签 + 图标 + 圆点/徽章配色，
// 让「续写落笔 / 章节更新 / 设定导入」在同一条时间轴上一眼可辨。
type SourceStyle = {
  label: string;
  icon: LucideIcon;
  dot: string;
  badge: string;
};

const SOURCE_STYLES: Record<string, SourceStyle> = {
  continue_accept: {
    label: "续写落笔",
    icon: Sparkles,
    dot: "bg-primary",
    badge: "bg-primary/10 text-primary",
  },
  patch_apply: {
    label: "章节更新",
    icon: FileEdit,
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  lore_import: {
    label: "设定导入",
    icon: BookOpen,
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
};

const DEFAULT_STYLE: SourceStyle = {
  label: "事件",
  icon: Clock,
  dot: "bg-muted-foreground/60",
  badge: "bg-muted text-muted-foreground",
};

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
          还没有时间线事件。续写落笔、采纳补丁或导入设定后会在此累积。
        </p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-5 border-l pl-6">
      {events.map((ev, i) => {
        const style = SOURCE_STYLES[ev.source] ?? DEFAULT_STYLE;
        const Icon = style.icon;
        return (
          <li key={i} className="relative animate-fade-in">
            <span
              className={cn(
                "absolute -left-[1.72rem] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background",
                style.dot,
              )}
            >
              <Icon className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{ev.label}</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[0.65rem] font-medium",
                  style.badge,
                )}
              >
                {style.label}
              </span>
            </div>
            {ev.description && (
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                {ev.description}
              </p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground/70">{formatDate(ev.event_time)}</p>
          </li>
        );
      })}
    </ol>
  );
}
