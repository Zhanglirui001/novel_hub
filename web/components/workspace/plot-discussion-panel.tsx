"use client";

import * as React from "react";
import { BookMarked, Loader2, PenLine, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useMainline, useSaveMainline } from "@/lib/queries";
import type { MainlineDiscussionTurn } from "@/lib/types";
import { useWorkspace } from "./workspace-context";

type Message = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "帮我梳理本章要发生什么",
  "本章的核心冲突是什么？",
  "这一章该埋或回收哪些伏笔？",
  "给我两三个本章的走向选项",
];

// 剧情讨论：先和 AI 讨论并确认「本章故事主线」，确认后可「据此起笔/续写」（仅按需引用）。
export function PlotDiscussionPanel() {
  const { projectId, activeChapterId, chapterTitle, setDockTab, startGhost, runContinue } = useWorkspace();

  const { data: savedMainline } = useMainline(activeChapterId);
  const saveMainline = useSaveMainline(activeChapterId);

  const [messages, setMessages] = React.useState<Message[]>([]);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [streamText, setStreamText] = React.useState("");
  const [mainlineDraft, setMainlineDraft] = React.useState("");
  const abortRef = React.useRef<AbortController | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  // 切换章节时重置会话，并载入该章已确认主线。
  React.useEffect(() => {
    abortRef.current?.abort();
    setMessages([]);
    setStreamText("");
    setStreaming(false);
  }, [activeChapterId]);

  React.useEffect(() => {
    setMainlineDraft(savedMainline?.content ?? "");
  }, [savedMainline?.content, activeChapterId]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streamText]);

  const noChapter = activeChapterId == null;

  const send = (text: string) => {
    const content = text.trim();
    if (!content || streaming || noChapter) return;

    const history: MainlineDiscussionTurn[] = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
    setStreaming(true);
    setStreamText("");

    const controller = new AbortController();
    abortRef.current = controller;

    let assembled = "";
    let streamError: string | null = null;

    api
      .streamMainlineDiscussion(
        projectId,
        activeChapterId,
        { project_id: projectId, content, history },
        {
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "delta") {
              assembled += event.text;
              setStreamText(assembled);
            } else if (event.type === "done") {
              assembled = event.reply;
            } else if (event.type === "error") {
              streamError = event.message;
            }
          },
        },
      )
      .then(() => {
        if (streamError) {
          toast.error(streamError);
          setMessages((prev) => prev.slice(0, -1)); // 失败回滚用户气泡，便于重试
        } else if (assembled.trim()) {
          setMessages((prev) => [...prev, { role: "assistant", content: assembled.trim() }]);
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        toast.error(error instanceof Error ? error.message : "讨论失败");
        setMessages((prev) => prev.slice(0, -1));
      })
      .finally(() => {
        setStreaming(false);
        setStreamText("");
        abortRef.current = null;
      });
  };

  // 「整理为主线」：请模型把讨论收敛成一段主线，落入草案框供编辑。
  const summarize = () => {
    if (streaming || noChapter) return;
    send("请把以上讨论整理成一段 120 字以内的本章故事主线，只输出这段主线本身。");
  };

  const confirmMainline = () => {
    const content = mainlineDraft.trim();
    if (!content || noChapter) return;
    saveMainline.mutate(
      { project_id: projectId, content },
      {
        onSuccess: () => toast.success("本章主线已确认"),
        onError: (error) => toast.error(error instanceof Error ? error.message : "保存失败"),
      },
    );
  };

  // 讨论完成时，模型的最新回复常常就是主线，一键填入草案。
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const fillFromLast = () => {
    if (lastAssistant) setMainlineDraft(lastAssistant.content);
  };

  const generateFromMainline = () => {
    const content = mainlineDraft.trim() || savedMainline?.content?.trim();
    if (!content) {
      toast.error("请先确认本章主线");
      return;
    }
    setDockTab("create");
    startGhost();
    runContinue("", { mainline: content });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-primary" />
        剧情讨论
        <span className="ml-auto truncate text-xs font-normal text-muted-foreground">
          {chapterTitle || "未命名章节"}
        </span>
      </div>

      {noChapter ? (
        <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
          请先打开或新建一个章节，再讨论本章主线。
        </p>
      ) : (
        <>
          {/* 对话区 */}
          <div
            ref={scrollRef}
            className="max-h-[46vh] space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3 soft-scroll"
          >
            {messages.length === 0 && !streamText && (
              <div className="space-y-2 py-2">
                <p className="text-xs text-muted-foreground">先聊聊这一章要写什么，理清主线后再动笔。</p>
                <div className="flex flex-wrap gap-1.5">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send(s)}
                      className="rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-primary/50 hover:bg-accent"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-xs leading-relaxed",
                  m.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "bg-card text-foreground/90",
                )}
              >
                {m.content}
              </div>
            ))}
            {streaming && (
              <div className="max-w-[92%] whitespace-pre-wrap rounded-lg bg-card px-3 py-2 text-xs leading-relaxed text-foreground/90">
                {streamText || (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    思考中…
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 输入区 */}
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              disabled={streaming}
              placeholder="和 AI 讨论本章剧情，Enter 发送，Shift+Enter 换行"
              className="min-h-[2.5rem] flex-1 resize-none text-xs"
              rows={2}
            />
            <Button size="sm" onClick={() => send(input)} disabled={streaming || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="outline" onClick={summarize} disabled={streaming || messages.length === 0}>
              整理为主线
            </Button>
            {lastAssistant && (
              <Button size="sm" variant="ghost" onClick={fillFromLast} disabled={streaming}>
                用最新回复填入
              </Button>
            )}
          </div>

          {/* 主线草案 → 确认 */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2 text-xs font-medium">
              <BookMarked className="h-3.5 w-3.5 text-primary" />
              本章故事主线
              {savedMainline?.content && (
                <span className="ml-auto text-[0.65rem] font-normal text-success">已确认</span>
              )}
            </div>
            <Textarea
              value={mainlineDraft}
              onChange={(e) => setMainlineDraft(e.target.value)}
              placeholder="确认后的主线将在续写/起笔时按需引用（勾选「参考本章主线」）。"
              className="min-h-[4rem] resize-none text-xs"
              rows={3}
            />
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" onClick={confirmMainline} disabled={!mainlineDraft.trim() || saveMainline.isPending}>
                {saveMainline.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookMarked className="h-4 w-4" />}
                确认主线
              </Button>
              <Button size="sm" variant="outline" onClick={generateFromMainline} disabled={!mainlineDraft.trim() && !savedMainline?.content}>
                <PenLine className="h-4 w-4" />
                据此起笔/续写
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
