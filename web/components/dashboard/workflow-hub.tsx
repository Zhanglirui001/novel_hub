"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Clock3, Drama, FileText, MessageSquare, PenLine, Sparkles, Waypoints } from "lucide-react";

import { CreateProjectDialog } from "./create-project-dialog";
import { useProjects } from "@/lib/queries";
import type { Project } from "@/lib/types";

const AI_ACTIONS = [
  { panel: "chat", label: "和助手讨论", description: "带着当前作品上下文，拆解问题、寻找方向", icon: MessageSquare },
  { panel: "create", label: "继续创作", description: "从意图出发续写、润色或推进下一段", icon: PenLine },
  { panel: "plot", label: "推演剧情", description: "检查冲突、节奏与下一步可能性", icon: Drama },
];

const STORY_ACTIONS = [
  { panel: "storyline", label: "整理故事线", description: "把情节节点、转折和因果关系放进画布", icon: Waypoints },
  { panel: "lore", label: "维护设定", description: "集中管理角色、世界规则和叙事约束", icon: FileText },
  { panel: "timeline", label: "校准时间线", description: "确认事件顺序，减少故事里的时间矛盾", icon: Clock3 },
];

type WorkflowMode = "ai" | "story";

function projectHref(project: Project, panel: string) {
  return `/workspace/?project=${project.id}&panel=${panel}`;
}

export function WorkflowHub({ mode }: { mode: WorkflowMode }) {
  const { data: projects = [], isLoading, isError } = useProjects();
  const actions = mode === "ai" ? AI_ACTIONS : STORY_ACTIONS;
  const title = mode === "ai" ? "AI 协作" : "故事工程";
  const eyebrow = mode === "ai" ? "WORK WITH CONTEXT" : "BUILD THE STORY";
  const description = mode === "ai"
    ? "让 AI 参与思考、推演和落笔，但每一步都留在你的作品上下文里。"
    : "把灵感变成可追踪的结构，让情节、设定和时间线互相对得上。";
  const accent = mode === "ai" ? "text-violet-700" : "text-teal-700";
  const accentBg = mode === "ai" ? "bg-violet-50" : "bg-teal-50";

  return (
    <main className="min-w-0 flex-1 overflow-auto">
      <div className="mx-auto max-w-6xl px-7 py-8 lg:px-10">
        <header className="mb-8 flex items-start justify-between gap-6">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${accent}`}>{eyebrow}</p>
            <h1 className="display-title mt-2 text-4xl leading-tight">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <CreateProjectDialog />
        </header>

        <section className={`mb-8 rounded-2xl border p-5 ${accentBg}`}>
          <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className={`size-4 ${accent}`} />先选一部作品</div>
          <p className="mt-1 text-xs text-muted-foreground">每次协作都绑定具体作品，AI 才能读到正确的章节、设定和故事线。</p>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {actions.map(({ panel, label, description: actionDescription, icon: Icon }) => (
              <div key={panel} className="border bg-background/80 p-4">
                <Icon className={`size-4 ${accent}`} />
                <p className="mt-3 text-sm font-semibold">{label}</p>
                <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{actionDescription}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mb-3 flex items-end justify-between">
          <div><h2 className="text-base font-semibold">选择作品开始</h2><p className="mt-1 text-xs text-muted-foreground">从最近使用的作品继续，不会创建新的孤立上下文。</p></div>
          <Link href="/" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">查看全部作品 <ArrowRight className="size-3" /></Link>
        </div>

        {isLoading ? <div className="border border-dashed p-8 text-sm text-muted-foreground">正在读取作品…</div> : null}
        {isError ? <div className="border border-dashed border-destructive/40 p-8 text-sm text-destructive">作品列表暂时无法读取，请确认本地服务已连接。</div> : null}
        {!isLoading && !isError && projects.length === 0 ? (
          <div className="border border-dashed p-10 text-center"><BookOpen className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 text-sm font-medium">还没有作品</p><p className="mt-1 text-xs text-muted-foreground">先创建一部作品，工作流会从这里开始。</p><div className="mt-4"><CreateProjectDialog /></div></div>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {projects.slice(0, 6).map((project) => (
            <div key={project.id} className="group border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/20">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0"><p className="truncate text-base font-semibold">{project.name}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{project.description || "还没有简介，从一个场景开始吧。"}</p></div>
                <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {actions.map(({ panel, label, icon: Icon }) => <Link key={panel} href={projectHref(project, panel)} className="inline-flex items-center gap-1.5 border bg-background px-2.5 py-1.5 text-xs font-medium hover:border-primary hover:text-primary"><Icon className="size-3.5" />{label}</Link>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
