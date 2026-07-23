"use client";

import * as React from "react";
import {
  BookMarked,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Loader2,
  Lock,
  RotateCcw,
  ScrollText,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useGlobalMainline, useMainline } from "@/lib/queries";
import { useWorkspace } from "./workspace-context";

// 快捷意图 chip：label 给用户看，value 是喂给意图解析的大白话。
const INTENT_CHIPS: { label: string; value: string }[] = [
  { label: "推进剧情", value: "推进剧情" },
  { label: "加段对话", value: "加一段对话" },
  { label: "环境铺陈", value: "环境铺陈" },
  { label: "制造冲突", value: "制造冲突" },
  { label: "放慢节奏", value: "放慢节奏" },
  { label: "回收伏笔", value: "回收伏笔" },
];

const INTENT_LABEL: Record<string, string> = {
  advance: "推进剧情",
  dialogue: "对话推进",
  scenery: "环境铺陈",
  conflict: "制造冲突",
  slow: "放慢节奏",
  payoff: "回收伏笔",
  free: "自由续写",
};

function scoreTone(score: number): string {
  if (score >= 85) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-destructive";
}

// 续写主控件：意图条 → 流式幽灵预览 HUD → 就地落笔三选一。
// 幽灵文本本身由 editor-pane 在正文光标处内联渲染，这里只做控制面。
export function ContinueGhostPanel() {
  const {
    selection,
    draft,
    projectId,
    activeChapterId,
    ghostAnchor,
    ghostStreaming,
    ghostStages,
    ghostCandidates,
    activeGhostId,
    startGhost,
    runContinue,
    setActiveGhost,
    acceptGhost,
    cancelGhost,
  } = useWorkspace();

  const [instruction, setInstruction] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const { data: mainline } = useMainline(activeChapterId);
  const mainlineText = mainline?.content?.trim() ?? "";
  const [useMainlineRef, setUseMainlineRef] = React.useState(true);
  const { data: globalMainline } = useGlobalMainline(projectId);
  const globalSummary = (globalMainline?.summary || globalMainline?.content || "").trim();
  const [useGlobalRef, setUseGlobalRef] = React.useState(true);
  const isOpening = !draft.trim();

  const active = ghostAnchor === null ? null : ghostCandidates.find((c) => c.id === activeGhostId) ?? null;
  const hasCandidate = !!active;
  const mainlineArg = mainlineText && useMainlineRef ? mainlineText : undefined;

  // 进入续写时清空上一次的指令并聚焦意图条。
  React.useEffect(() => {
    if (ghostAnchor === null) {
      setInstruction("");
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [ghostAnchor]);

  // 未进入续写：显示悬浮触发按钮（选中文字时让位给内联批注浮层）。
  if (ghostAnchor === null) {
    if (selection && selection.text.trim()) return null;
    return (
      <div className="pointer-events-none sticky bottom-4 flex justify-center">
        <Button
          size="sm"
          onClick={startGhost}
          className="pointer-events-auto shadow-lg"
          title={isOpening ? "承接上一章结尾，为新章节起笔" : "在光标处续写下一段（幽灵预览）"}
        >
          <Sparkles className="h-4 w-4" />
          {isOpening ? "起笔（承接上章）" : "续写下一段"}
        </Button>
      </div>
    );
  }

  const submitFresh = () => {
    if (ghostStreaming) return;
    runContinue(instruction, { directive: null, mainline: mainlineArg, useGlobalMainline: useGlobalRef });
  };

  // 微调 / 换一版：复用当前候选的 directive，走廉价增量（意图与取材不重跑）。
  const submitRefine = () => {
    if (ghostStreaming) return;
    runContinue(instruction, { directive: active?.directive ?? null, mainline: mainlineArg, useGlobalMainline: useGlobalRef });
    setInstruction("");
  };

  const regenerate = () => {
    if (ghostStreaming) return;
    runContinue("", { directive: active?.directive ?? null, mainline: mainlineArg, useGlobalMainline: useGlobalRef });
  };

  const onChip = (value: string) => {
    if (ghostStreaming) return;
    setInstruction(value);
    runContinue(value, { directive: hasCandidate ? active?.directive ?? null : null, mainline: mainlineArg, useGlobalMainline: useGlobalRef });
  };

  const cycle = (dir: 1 | -1) => {
    if (ghostCandidates.length < 2) return;
    const idx = ghostCandidates.findIndex((c) => c.id === activeGhostId);
    const next = (idx + dir + ghostCandidates.length) % ghostCandidates.length;
    setActiveGhost(ghostCandidates[next].id);
  };

  const activeIndex = ghostCandidates.findIndex((c) => c.id === activeGhostId);

  return (
    <div className="pointer-events-none sticky bottom-4 flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-xl space-y-3 rounded-xl border bg-card/95 p-4 shadow-xl backdrop-blur">
        {/* HUD：流式思考轨迹 / 已参考设定 / 一致性 / 读者感受 */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 font-medium text-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            续写预览
          </span>
          {ghostStages.intent && (
            <span className="rounded bg-muted px-2 py-0.5">
              {INTENT_LABEL[ghostStages.intent.intent_type] ?? "自由续写"}
            </span>
          )}
          {typeof ghostStages.retrieveCount === "number" && ghostStages.retrieveCount > 0 && (
            <span>已参考设定·{ghostStages.retrieveCount}</span>
          )}
          {ghostStages.repairing && (
            <span className="flex items-center gap-1 text-warning">
              <Loader2 className="h-3 w-3 animate-spin" />
              一致性修订中
            </span>
          )}
          {typeof ghostStages.score === "number" && (
            <span className={cn("font-medium", scoreTone(ghostStages.score))}>
              一致性 {ghostStages.score}
            </span>
          )}
          {ghostStreaming && (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              生成中…
            </span>
          )}
          <button
            type="button"
            onClick={cancelGhost}
            className="ml-auto flex items-center gap-0.5 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground"
            title="放弃续写（Esc）"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* 读者视角预检 */}
        {hasCandidate && active?.readerReaction && (
          <div className="rounded-md bg-primary/5 px-3 py-2 text-xs text-foreground/80">
            <span className="font-medium text-primary">读者感受：</span>
            {active.readerReaction}
          </div>
        )}

        {/* 注入状态：一眼看清这次续写喂了哪些层，并可控制 */}
        <div className="space-y-1.5 rounded-md border bg-muted/20 px-2.5 py-2">
          <div className="flex items-center gap-1.5 text-[0.7rem] font-medium text-muted-foreground">
            <Lock className="h-3 w-3" />
            上下文注入
          </div>
          {/* 设定：常驻，不可关（只读） */}
          <div className="flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground">
            <ScrollText className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">设定（世界观 / 术语 / 禁忌）</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[0.6rem]">常驻</span>
          </div>
          {/* 全书主线摘要：常驻但可关 */}
          {globalSummary ? (
            <button
              type="button"
              onClick={() => setUseGlobalRef((v) => !v)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors",
                useGlobalRef ? "bg-primary/5 text-foreground/80" : "text-muted-foreground hover:bg-muted/50",
              )}
              title={useGlobalRef ? "生成时会注入全书主线摘要，点击关闭" : "生成时不注入全书主线，点击开启"}
            >
              <Globe className={cn("h-3.5 w-3.5 shrink-0", useGlobalRef ? "text-primary" : "")} />
              <span className="flex-1 truncate">
                <span className="font-medium">{useGlobalRef ? "全书主线摘要" : "已忽略全书主线"}</span>
                <span className="ml-1 text-muted-foreground">{globalSummary}</span>
              </span>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.6rem]">
                {useGlobalRef ? "开" : "关"}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground/60">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">全书主线（未设置，去「剧情」页填写）</span>
            </div>
          )}
          {/* 本章主线：按需引用（仅在已确认主线时可切换） */}
          {mainlineText ? (
            <button
              type="button"
              onClick={() => setUseMainlineRef((v) => !v)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors",
                useMainlineRef ? "bg-primary/5 text-foreground/80" : "text-muted-foreground hover:bg-muted/50",
              )}
              title={useMainlineRef ? "生成时会参考本章主线，点击关闭" : "生成时不参考本章主线，点击开启"}
            >
              <BookMarked className={cn("h-3.5 w-3.5 shrink-0", useMainlineRef ? "text-primary" : "")} />
              <span className="flex-1 truncate">
                <span className="font-medium">{useMainlineRef ? "本章主线" : "已忽略本章主线"}</span>
                <span className="ml-1 text-muted-foreground">{mainlineText}</span>
              </span>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[0.6rem]">
                {useMainlineRef ? "开" : "关"}
              </span>
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded px-2 py-1 text-xs text-muted-foreground/60">
              <BookMarked className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">本章主线（未确认，去「剧情」页讨论）</span>
            </div>
          )}
        </div>

        {/* 意图条：留空=顺着往下写；一句话=对下文的要求 */}
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (hasCandidate) submitRefine();
                else submitFresh();
              }
            }}
            disabled={ghostStreaming}
            placeholder={
              hasCandidate ? "再说一句改（微调）……" : "说说这段想怎么写，留空就顺着往下写"
            }
            className="h-9"
          />
          <Button
            size="sm"
            onClick={hasCandidate ? submitRefine : submitFresh}
            disabled={ghostStreaming}
            title={hasCandidate ? "按新要求微调" : "开始续写"}
          >
            {hasCandidate ? "微调" : "续写"}
          </Button>
        </div>

        {/* 快捷意图 chip */}
        <div className="flex flex-wrap gap-1.5">
          {INTENT_CHIPS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              disabled={ghostStreaming}
              onClick={() => onChip(chip.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                "hover:border-primary/50 hover:bg-accent disabled:opacity-50",
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* 落笔三选一 + 候选轮播 */}
        {hasCandidate && (
          <div className="flex items-center gap-2 border-t pt-3">
            <Button size="sm" onClick={acceptGhost} disabled={ghostStreaming}>
              <Check className="h-4 w-4" />
              采纳
              <kbd className="ml-1 rounded bg-primary-foreground/20 px-1 text-[0.65rem]">Tab</kbd>
            </Button>
            <Button size="sm" variant="outline" onClick={regenerate} disabled={ghostStreaming}>
              <RotateCcw className="h-4 w-4" />
              换一版
            </Button>

            {ghostCandidates.length > 1 && (
              <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={() => cycle(-1)}
                  className="rounded p-1 hover:bg-muted hover:text-foreground"
                  title="上一版"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="tabular-nums">
                  {activeIndex + 1} / {ghostCandidates.length}
                </span>
                <button
                  type="button"
                  onClick={() => cycle(1)}
                  className="rounded p-1 hover:bg-muted hover:text-foreground"
                  title="下一版"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
