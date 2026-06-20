"use client";

import * as React from "react";
import { Sparkles, Wand2, Check, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAnalyzeSelection, useReviseSelection } from "@/lib/queries";
import type { InlineAnalyzeResult, InlineReviseResult } from "@/lib/types";
import { useWorkspace } from "./workspace-context";

const CONTEXT_WINDOW = 300;

export function InlineRevisePanel() {
  const {
    projectId,
    draft,
    chapterTitle,
    selection,
    replaceRange,
  } = useWorkspace();

  // 把面板要操作的选区「锁定」一份快照,避免用户在编辑器里再点一下导致选区丢失。
  const [snapshot, setSnapshot] = React.useState<{
    start: number;
    end: number;
    text: string;
    prefix: string;
    suffix: string;
  } | null>(null);
  const [annotation, setAnnotation] = React.useState("");
  const [analysis, setAnalysis] = React.useState<InlineAnalyzeResult | null>(null);
  const [revision, setRevision] = React.useState<InlineReviseResult | null>(null);

  const analyzeMutation = useAnalyzeSelection();
  const reviseMutation = useReviseSelection();

  // 选区变化时锁定一份新快照,并清空旧的分析/批注/结果。
  React.useEffect(() => {
    if (!selection || !selection.text.trim()) return;
    const prefix = draft.slice(Math.max(0, selection.start - CONTEXT_WINDOW), selection.start);
    const suffix = draft.slice(selection.end, selection.end + CONTEXT_WINDOW);
    setSnapshot({
      start: selection.start,
      end: selection.end,
      text: selection.text,
      prefix,
      suffix,
    });
    setAnnotation("");
    setAnalysis(null);
    setRevision(null);
    // 选区改变时,丢弃任何 in-flight 结果(下一次 mutateAsync 会覆盖,这里只清 UI)。
  }, [selection, draft]);

  const runAnalyze = React.useCallback(async () => {
    if (!snapshot) return;
    try {
      const res = await analyzeMutation.mutateAsync({
        project_id: projectId,
        selection: snapshot.text,
        prefix: snapshot.prefix,
        suffix: snapshot.suffix,
        chapter_title: chapterTitle,
      });
      setAnalysis(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "分析失败");
    }
  }, [snapshot, analyzeMutation, projectId, chapterTitle]);

  const runRevise = React.useCallback(async () => {
    if (!snapshot) return;
    try {
      const res = await reviseMutation.mutateAsync({
        project_id: projectId,
        selection: snapshot.text,
        prefix: snapshot.prefix,
        suffix: snapshot.suffix,
        annotation,
        analysis: analysis?.analysis ?? "",
        chapter_title: chapterTitle,
        budget: "medium",
        target_latency_ms: 6000,
      });
      setRevision(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成修改失败");
    }
  }, [snapshot, reviseMutation, projectId, annotation, analysis, chapterTitle]);

  const adoptRevision = React.useCallback(() => {
    if (!snapshot || !revision) return;
    replaceRange(snapshot.start, snapshot.end, revision.result_text);
    toast.success("已采纳并替换选段");
    setSnapshot(null);
    setAnalysis(null);
    setRevision(null);
    setAnnotation("");
  }, [snapshot, revision, replaceRange]);

  if (!snapshot) {
    return (
      <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">在编辑器中选中一段文字</p>
        <p>选中后点击浮出的「AI 分析选段」按钮,这里会自动带入选段与上下文,
          支持 AI 分析 + 人工批注 + 给出有针对性的修改。</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 选段快照 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            当前选段（{snapshot.text.length} 字）
          </Label>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => {
              setSnapshot(null);
              setAnalysis(null);
              setRevision(null);
              setAnnotation("");
            }}
            title="清空当前选段快照"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            清空
          </Button>
        </div>
        <div className="prose-editor max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-card/50 p-3 text-sm leading-relaxed soft-scroll">
          {snapshot.text}
        </div>
      </div>

      {/* AI 分析 */}
      <div className="space-y-2 rounded-lg border bg-card/50 p-4">
        <div className="flex items-center justify-between">
          <Label className="font-medium">AI 分析</Label>
          <Button
            size="sm"
            variant="outline"
            onClick={runAnalyze}
            disabled={analyzeMutation.isPending}
          >
            <Sparkles className="h-4 w-4" />
            {analyzeMutation.isPending
              ? "分析中…"
              : analysis
                ? "重新分析"
                : "开始分析"}
          </Button>
        </div>
        {analysis ? (
          <div className="space-y-2">
            <div className="whitespace-pre-wrap rounded-md bg-background p-3 text-sm leading-relaxed">
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
        ) : (
          <p className="text-xs text-muted-foreground">
            先看 AI 怎么读这段——一致性、人设、节奏、用词。
          </p>
        )}
      </div>

      {/* 人工批注 */}
      <div className="space-y-2">
        <Label htmlFor="inline-annotation" className="font-medium">
          我的批注（可选）
        </Label>
        <Textarea
          id="inline-annotation"
          value={annotation}
          onChange={(e) => setAnnotation(e.target.value)}
          placeholder="例如:语气更冷一点;补一句心理描写;改成第一人称……"
          rows={3}
          className="resize-none"
        />
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={runRevise}
        disabled={reviseMutation.isPending}
      >
        <Wand2 className="h-4 w-4" />
        {reviseMutation.isPending ? "生成修改中…" : "按分析与批注生成修改"}
      </Button>

      {/* 修改结果 */}
      {revision && (
        <div className="space-y-3 animate-fade-in border-t pt-5">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              AI 修改后的选段
            </Label>
            <span className="text-xs text-muted-foreground">
              一致性 {revision.consistency_score}
            </span>
          </div>
          <div className="prose-editor max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-background p-4 text-sm leading-relaxed soft-scroll">
            {revision.result_text}
          </div>
          <Button className="w-full" onClick={adoptRevision}>
            <Check className="h-4 w-4" />
            采纳并替换选段
          </Button>
        </div>
      )}
    </div>
  );
}
