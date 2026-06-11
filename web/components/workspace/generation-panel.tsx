"use client";

import * as React from "react";
import { Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useDraft } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { Budget, TaskType } from "@/lib/types";
import { ConsistencyRing } from "./consistency-ring";
import { useWorkspace } from "./workspace-context";

export function GenerationPanel() {
  const { projectId, draft, chapterTitle, lastResult, setLastResult, setDockTab } =
    useWorkspace();
  const draftMutation = useDraft();

  const [taskType, setTaskType] = React.useState<TaskType>("continue");
  const [budget, setBudget] = React.useState<Budget>("medium");
  const [latency, setLatency] = React.useState(6000);

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
          budget,
          target_latency_ms: latency,
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

      {/* 参数 */}
      <div className="space-y-4 rounded-lg border bg-card/50 p-4">
        <div className="grid gap-2">
          <Label>预算策略</Label>
          <Select value={budget} onValueChange={(v) => setBudget(v as Budget)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">经济 · 快速</SelectItem>
              <SelectItem value="medium">均衡</SelectItem>
              <SelectItem value="high">高质量</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>目标延迟</Label>
            <span className="text-xs text-muted-foreground">{latency} ms</span>
          </div>
          <Slider
            value={[latency]}
            onValueChange={(v) => setLatency(v[0])}
            min={1000}
            max={10000}
            step={500}
          />
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
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setDockTab("patch")}
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
          : "hover:border-primary/40 hover:bg-accent/40"
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
