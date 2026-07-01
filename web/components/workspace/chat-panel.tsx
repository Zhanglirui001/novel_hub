"use client";

import * as React from "react";
import { Check, Copy, Expand, MessageSquare, Plus, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useWorkspace } from "./workspace-context";

const QUICK_ACTIONS = [
  { label: "续写下一段", prompt: "请根据当前章节内容，续写下一段，保持原有文风。" },
  { label: "润色选中", prompt: "请润色我选中的文字，保留原意但提升节奏和画面感。", requiresSelection: true },
  { label: "分析冲突", prompt: "请分析当前章节的戏剧冲突、人物目标和阻力是否清晰。" },
  { label: "检查设定", prompt: "请检查当前章节可能存在的设定、时间线或人物一致性问题。" },
  { label: "改写方案", prompt: "请给出三种改写方向，并说明每种方向适合强化什么效果。" },
];

export function ChatPanel({ fullscreen = false }: { fullscreen?: boolean }) {
  const {
    draft,
    setDraft,
    chapterTitle,
    chapterGroupTitle,
    selection,
    replaceRange,
    chatMessages,
    chatDraft,
    setChatDraft,
    setChatFullscreenOpen,
    chatSessions,
    activeChatSessionId,
    createChatSession,
    selectChatSession,
    sendChatMessage,
    chatStreaming,
    streamingContent,
    clearChat,
  } = useWorkspace();

  const messagesEndRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [chatMessages.length, activeChatSessionId, streamingContent]);

  function submitMessage(content = chatDraft) {
    const text = content.trim();
    if (!text || chatStreaming) return;
    sendChatMessage(text);
    if (content === chatDraft) setChatDraft("");
  }

  function runQuickAction(action: (typeof QUICK_ACTIONS)[number]) {
    if (chatStreaming) return;
    if (action.requiresSelection && !selection?.text) {
      toast.error("请先在正文中选中一段文字");
      return;
    }
    submitMessage(action.prompt);
  }

  function insertAtEnd(content: string) {
    setDraft(draft.trimEnd() ? `${draft.trimEnd()}\n\n${content}` : content);
    toast.success("已插入到正文末尾");
  }

  function replaceSelection(content: string) {
    if (!selection) return;
    replaceRange(selection.start, selection.end, content);
    toast.success("已替换选中文字");
  }

  const sessionColumn = (
    <div className={cn("border-r", fullscreen ? "w-72 shrink-0" : "w-full border-r-0 border-b")}>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">会话</div>
          <div className="text-sm text-muted-foreground">历史记录与新对话</div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          onClick={() => {
            const sessionId = createChatSession();
            selectChatSession(sessionId);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          新建
        </Button>
      </div>

      <ScrollArea className={cn("soft-scroll", fullscreen ? "h-[calc(100vh-11rem)]" : "h-52")}>
        <div className="space-y-1 p-2">
          {chatSessions.length === 0 ? (
            <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              还没有会话，点击“新建”开始。
            </div>
          ) : null}
          {chatSessions.map((session) => (
            <button
              key={session.id}
              className={cn(
                "w-full rounded-md border px-3 py-2 text-left transition-colors",
                session.id === activeChatSessionId ? "border-primary bg-primary/5" : "hover:bg-muted/50",
              )}
              onClick={() => selectChatSession(session.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-sm font-medium">{session.title}</div>
                <div className="shrink-0 text-[0.7rem] text-muted-foreground">{session.messageCount}</div>
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {session.lastMessagePreview || "暂无消息"}
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );

  const chatColumn = (
    <div className={cn("flex min-h-0 flex-col", fullscreen ? "flex-1" : "gap-4")}>
      <div className={cn("space-y-3", fullscreen ? "border-b px-6 py-4" : undefined)}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <h2 className="font-medium">AI 聊天</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              {fullscreen ? "右侧展开的大对话区，适合长对话、历史会话和连续改稿。" : "围绕当前章节提问、改写或构思。"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {chatMessages.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={clearChat}>
                <RotateCcw className="h-3.5 w-3.5" />
                清空当前会话
              </Button>
            ) : null}
            {!fullscreen ? (
              <Button variant="outline" size="sm" onClick={() => setChatFullscreenOpen(true)}>
                <Expand className="h-3.5 w-3.5" />
                全屏
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">章节：{chapterTitle || "未命名章节"}</Badge>
          <Badge variant="outline">卷：{chapterGroupTitle || "默认卷"}</Badge>
          <Badge variant="outline">正文 {draft.length} 字</Badge>
          {selection?.text ? <Badge>选中 {selection.text.length} 字</Badge> : null}
        </div>

        {selection?.text ? (
          <div className="rounded-lg border bg-card/50 p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">当前选区</div>
            <p className="line-clamp-4 whitespace-pre-wrap">{selection.text}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((action) => (
            <Button
              key={action.label}
              variant="secondary"
              size="sm"
              className="h-8"
              disabled={chatStreaming}
              onClick={() => runQuickAction(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      <div className={cn("min-h-0", fullscreen ? "flex flex-1 flex-col px-6" : "space-y-4")}>
        <ScrollArea className={cn("soft-scroll", fullscreen ? "min-h-0 flex-1 py-4" : "h-[26rem]")}>
          <div className="space-y-3 pr-3">
            {chatMessages.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-card/30 p-4 text-sm text-muted-foreground">
                <div className="mb-2 font-medium text-foreground">和 AI 讨论这一章</div>
                <p>可以选中文字后询问改写、动机、节奏或设定问题，也可以直接让 AI 续写或梳理剧情。</p>
              </div>
            ) : null}
            {chatMessages.map((message, index) => {
              const isLive = chatStreaming && index === chatMessages.length - 1 && message.role === "assistant";
              return (
                <MessageBubble
                  key={message.id === -1 ? "streaming" : message.id === -2 ? "pending-user" : message.id}
                  role={message.role}
                  content={message.content}
                  createdAt={message.createdAt}
                  streaming={isLive}
                  canReplace={Boolean(selection) && message.role === "assistant" && !isLive}
                  onInsert={() => insertAtEnd(message.content)}
                  onReplace={() => replaceSelection(message.content)}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <Separator className={fullscreen ? "mb-4" : undefined} />

        <div className={cn("space-y-2", fullscreen ? "pb-6" : undefined)}>
          <Textarea
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submitMessage();
              }
            }}
            placeholder="询问 AI，或输入 / 调用指令"
            className="min-h-24 resize-none"
            disabled={chatStreaming}
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {chatStreaming ? "AI 正在生成…" : "Enter 发送，Shift + Enter 换行"}
            </p>
            <Button size="sm" onClick={() => submitMessage()} disabled={!chatDraft.trim() || chatStreaming}>
              <Send className="h-3.5 w-3.5" />
              发送
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={cn("flex min-h-0", fullscreen ? "h-full" : "gap-4 flex-col")}>
      {fullscreen ? (
        <div className="flex min-h-0 flex-1">
          {sessionColumn}
          {chatColumn}
        </div>
      ) : (
        chatColumn
      )}
    </div>
  );
}

function MessageBubble({
  role,
  content,
  createdAt,
  streaming = false,
  canReplace,
  onInsert,
  onReplace,
}: {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  streaming?: boolean;
  canReplace: boolean;
  onInsert: () => void;
  onReplace: () => void;
}) {
  const isUser = role === "user";

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("已复制");
    } catch {
      toast.error("复制失败");
    }
  }

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[92%] rounded-lg px-3 py-2 text-sm",
          isUser ? "bg-primary text-primary-foreground" : "border bg-card/50 text-foreground",
        )}
      >
        <div className="mb-1 flex items-center gap-1.5 text-[0.7rem] opacity-75">
          {isUser ? "你" : "AI"}
          <span>· {new Date(createdAt).toLocaleString()}</span>
        </div>
        {streaming && !content ? (
          <div className="flex items-center gap-1 py-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {content}
            {streaming ? <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-current align-middle" /> : null}
          </div>
        )}
        {!isUser && !streaming ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={copyMessage}>
              <Copy className="h-3.5 w-3.5" />
              复制
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onInsert}>
              <Plus className="h-3.5 w-3.5" />
              插入末尾
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={onReplace}
              disabled={!canReplace}
            >
              <Check className="h-3.5 w-3.5" />
              替换选中
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
