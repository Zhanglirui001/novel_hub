"use client";

import * as React from "react";
import { ChevronDown, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countChars } from "@/lib/utils";
import { useAnalyzeSelection, useReviseSelection } from "@/lib/queries";
import type { InlineAnalyzeResult } from "@/lib/types";
import { useWorkspace } from "./workspace-context";

const CONTEXT_WINDOW = 300;

// 选中文字后浮在编辑器底部的内联浮层：AI 分析 + 写批注 + 生成修改。
// 生成成功即进入「原地 diff 预览」模式（由 reviseTarget/candidates 驱动）。
export function InlineReviseOverlay() {
  const {
    projectId,
    draft,
    chapterTitle,
    selection,
    startReviseTarget,
    addCandidate,
  } = useWorkspace();

  const [expanded, setExpanded] = React.useState(false);
  const [annotation, setAnnotation] = React.useState("");
  const [analysis, setAnalysis] = React.useState<InlineAnalyzeResult | null>(null);

  const analyzeMutation = useAnalyzeSelection();
  const reviseMutation = useReviseSelection();

  // 选区变化时复位浮层（新选段重新开始）。
  const selStart = selection?.start;
  const selEnd = selection?.end;
  React.useEffect(() => {
    setExpanded(false);
    setAnnotation("");
    setAnalysis(null);
  }, [selStart, selEnd]);

  if (!selection || !selection.text.trim()) return null;

  const ctx = () => ({
    prefix: draft.slice(Math.max(0, selection.start - CONTEXT_WINDOW), selection.start),
    suffix: draft.slice(selection.end, selection.end + CONTEXT_WINDOW),
  });

  const runAnalyze = async () => {
    const { prefix, suffix } = ctx();
    try {
      const res = await analyzeMutation.mutateAsync({
        project_id: projectId,
        selection: selection.text,
        prefix,
        suffix,
        chapter_title: chapterTitle,
      });
      setAnalysis(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "分析失败");
    }
  };

  const runRevise = async () => {
    const { prefix, suffix } = ctx();
    try {
      const res = await reviseMutation.mutateAsync({
        project_id: projectId,
        selection: selection.text,
        prefix,
        suffix,
        annotation,
        analysis: analysis?.analysis ?? "",
        chapter_title: chapterTitle,
        budget: "medium",
        target_latency_ms: 6000,
      });
      // 锁定目标 + 写入首个候选 → 编辑器自动切到 diff 预览。
      startReviseTarget({
        start: selection.start,
        end: selection.end,
        originalText: selection.text,
        prefix,
        suffix,
      });
      addCandidate({
        resultText: res.result_text,
        editedText: res.result_text,
        annotation,
        analysis: analysis?.analysis ?? "",
        consistencyScore: res.consistency_score,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成修改失败");
    }
  };

  if (!expanded) {
    return (
      <div className="pointer-events-none sticky bottom-4 flex justify-center">
        <Button
          size="sm"
          onClick={() => setExpanded(true)}
          className="pointer-events-auto shadow-lg"
          title="对选中文字进行 AI 分析与批注修改"
        >
          <Sparkles className="h-4 w-4" />
          AI 分析选段（{countChars(selection.text)} 字）
        </Button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none sticky bottom-4 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-xl space-y-3 rounded-xl border bg-card/95 p-4 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            选段（{countChars(selection.text)} 字）
          </Label>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setExpanded(false)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
            收起
          </Button>
        </div>

        {/* AI 分析 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">AI 分析</Label>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void runAnalyze()}
              disabled={analyzeMutation.isPending}
            >
              <Sparkles className="h-4 w-4" />
              {analyzeMutation.isPending ? "分析中…" : analysis ? "重新分析" : "开始分析"}
            </Button>
          </div>
          {analysis && (
            <div className="space-y-1.5">
              <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-md bg-background p-3 text-sm leading-relaxed soft-scroll">
                {analysis.analysis}
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                <span className="rounded bg-muted px-2 py-0.5">
                  一致性 {analysis.consistency_score}
                </span>
                {analysis.issues.length > 0 && (
                  <span className="rounded bg-warning/15 px-2 py-0.5 text-warning-foreground">
                    {analysis.issues.length} 处冲突
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 人工批注 */}
        <div className="space-y-1.5">
          <Label htmlFor="overlay-annotation" className="text-sm font-medium">
            我的批注（可选）
          </Label>
          <Textarea
            id="overlay-annotation"
            value={annotation}
            onChange={(e) => setAnnotation(e.target.value)}
            placeholder="例如：语气更冷一点；补一句心理描写；改成第一人称……"
            rows={2}
            className="resize-none"
          />
        </div>

        <Button
          className="w-full"
          onClick={() => void runRevise()}
          disabled={reviseMutation.isPending}
        >
          <Wand2 className="h-4 w-4" />
          {reviseMutation.isPending ? "生成修改中…" : "生成修改并就地预览"}
        </Button>
      </div>
    </div>
  );
}
