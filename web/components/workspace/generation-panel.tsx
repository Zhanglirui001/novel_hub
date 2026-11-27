"use client";

import * as React from "react";
import { Gauge, Gem, Sparkles, Wand2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useDraft } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { Budget, TaskType } from "@/lib/types";
import { ConsistencyRing } from "./consistency-ring";
import { useWorkspace } from "./workspace-context";

const MODES = [
  { value: "fast" as const, label: "快速", desc: "经济 · 3s", icon: Zap, budget: "low" as Budget, latency: 3000 },
  { value: "balanced" as const, label: "均衡", desc: "均衡 · 6s", icon: Gauge, budget: "medium" as Budget, latency: 6000 },
  { value: "refine" as const, label: "精修", desc: "高质量 · 10s", icon: Gem, budget: "high" as Budget, latency: 10000 },
];

type Mode = (typeof MODES)[number]["value"];

export function GenerationPanel({ fullscreen }: { fullscreen?: boolean }) {
  const { projectId, draft, setDraft, chapterTitle, lastResult, setLastResult, setDockTab, setCreateMode } =
    useWorkspace();
  const draftMutation = useDraft();

  const [taskType, setTaskType] = React.useState<TaskType>("continue");
  const [mode, setMode] = React.useState<Mode>("balanced");

  const cfg = MODES.find((m) => m.value === mode) ?? MODES[1];

  async function handleGenerate() {
    if (!draft.trim()) {
      toast.error("请先在编辑器中输入正文");
      return;
    }
    try {
      const result = await draftMutation.mutateAsync({
        taskType,
        payload: {
          project_id: projectId,
          chapter_title: chapterTitle,
          input_text: draft,
          budget: cfg.budget,
          target_latency_ms: cfg.latency,
        },
      });
      setLastResult(result);
      toast.success(taskType === "continue" ? "续写已生成" : "润色已生成");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    }
  }

  return (
    <div className="space-y-5">
      {/* 任务切换 */}
      <div className="grid grid-cols-2 gap-2">
        <TaskButton
          active={taskType === "continue"}
          onClick={() => setTaskType("continue")}
          icon={<Sparkles className="h-4 w-4" />}
          label="续写"
          desc="顺着剧情往下写"
        />
        <TaskButton
          active={taskType === "polish"}
          onClick={() => setTaskType("polish")}
          icon={<Wand2 className="h-4 w-4" />}
          label="润色"
          desc="打磨现有文字"
        />
      </div>

      {/* 生成模式 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">生成模式</Label>
          <span className="max-w-[60%] truncate text-[11px] text-muted-foreground">
            当前章节：{chapterTitle || "未命名"}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-lg border p-2 text-xs transition",
                  active ? "border-primary bg-accent" : "hover:border-primary/40 hover:bg-accent/30",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="font-medium">{m.label}</span>
                <span className="text-[10px] text-muted-foreground">{m.desc}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={handleGenerate}
        disabled={draftMutation.isPending}
      >
        <Sparkles className="h-4 w-4" />
        {draftMutation.isPending ? "生成中…" : "生成建议"}
      </Button>

      {/* 结果 */}
      {lastResult && (
        <div className="space-y-4 animate-fade-in border-t pt-5">
          <ConsistencyRing score={lastResult.consistency_score} />
          <div className="flex flex-wrap justify-center gap-1.5 text-xs text-muted-foreground">
            <span className="rounded bg-muted px-2 py-0.5">
              写手 {lastResult.model_route.writer}
            </span>
            {lastResult.repaired && (
              <span className="rounded bg-warning/15 px-2 py-0.5 text-warning-foreground">
                已自动修复
              </span>
            )}
          </div>
          <div>
            <Label className="mb-1.5 block text-xs uppercase tracking-wide text-muted-foreground">
              AI 建议文本
            </Label>
            <div className="prose-editor max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-background p-4 text-sm leading-relaxed soft-scroll">
              {lastResult.result_text}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const body = lastResult.result_text;
                setDraft(draft.trimEnd() ? `${draft.trimEnd()}\n\n${body}` : body);
                toast.success("已插入正文末尾");
              }}
            >
              插入正文
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  .writeText(lastResult.result_text)
                  .then(() => toast.success("已复制"))
                  .catch(() => toast.error("复制失败"));
              }}
            >
              复制
            </Button>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setCreateMode("patch");
              setDockTab("create");
            }}
          >
            查看 {lastResult.patch_items.length} 条修改并应用 →
          </Button>
        </div>
      )}
    </div>
  );
}

function TaskButton({
  active,
  onClick,
  icon,
  label,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all",
        active
          ? "border-primary bg-accent ring-1 ring-primary/30"
          : "hover:border-primary/40 hover:bg-accent/40",
      )}
    >
      <span className="flex items-center gap-1.5 font-medium">
        {icon}
        {label}
      </span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </button>
  );
}
