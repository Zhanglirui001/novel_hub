import { ArrowRight, Clock3, Command, Feather, Sparkles } from "lucide-react";

import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";
import { ProjectGallery } from "@/components/dashboard/project-gallery";
import { ThemePicker } from "@/components/theme-picker";
import { LibraryRecovery } from "@/components/dashboard/library-recovery";

export default function DashboardPage() {
  return (
    <div className="flex min-h-full bg-background">
      <AppSidebar />
      <main className="min-w-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-7 py-7 lg:px-10">
          <header className="mb-7 flex items-center justify-between gap-6">
            <div><p className="text-xs text-muted-foreground">创作空间 / 概览</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">下午好，继续把故事写下去</h1></div>
            <div className="flex items-center gap-2"><ThemePicker /><LibraryRecovery /><CreateProjectDialog /></div>
          </header>
          <section className="relative mb-8 overflow-hidden rounded-2xl border bg-[radial-gradient(circle_at_80%_20%,hsl(var(--primary)/0.15),transparent_38%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--muted)/0.6))] p-7">
            <div className="relative z-10 max-w-2xl">
              <span className="mb-4 inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground"><Sparkles className="size-3 text-primary" />AI 创作工作台</span>
              <h2 className="display-title text-3xl leading-tight">从一句灵感，到完整的故事世界</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">把写作、角色设定、故事线、灵感画板和 AI 协作放进同一个本地工作空间。你掌控作品，助手负责推进。</p>
              <div className="mt-5 flex flex-wrap gap-5 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Feather className="size-3.5" />沉浸写作</span><span className="flex items-center gap-1.5"><Command className="size-3.5" />上下文协作</span><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />本地自动保存</span></div>
            </div>
          </section>
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-base font-semibold">最近作品</h2><p className="text-xs text-muted-foreground">从上次停下的位置继续</p></div><span className="flex items-center gap-1 text-xs text-muted-foreground">全部作品 <ArrowRight className="size-3" /></span></div>
          <ProjectGallery />
        </div>
      </main>
    </div>
  );
}
