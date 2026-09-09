import Link from "next/link";
import { BookOpenText, Home, Library, Settings, Sparkles, Workflow } from "lucide-react";
import { RuntimeStatus } from "./runtime-status";

export function AppSidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-card/60 p-3">
      <div className="mb-5 flex items-center gap-2 px-2 py-2">
        <span className="grid size-8 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm"><BookOpenText className="size-4" /></span>
        <div><p className="text-sm font-semibold">Novel Hub</p><p className="text-[10px] text-muted-foreground">WRITING OS</p></div>
      </div>
      <nav className="space-y-1">
        <Link href="/" className="flex h-9 items-center gap-3 rounded-lg bg-primary/10 px-3 text-sm font-medium text-primary"><Home className="size-4" />概览</Link>
        <Link href="/" className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><Library className="size-4" />作品</Link>
      </nav>
      <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">工作流</p>
      <div className="space-y-1">
        <div className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground"><Sparkles className="size-4" />AI 协作</div>
        <div className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground"><Workflow className="size-4" />故事工程</div>
      </div>
      <div className="mt-auto space-y-2">
        <RuntimeStatus />
        <Link href="/settings" className="flex h-9 items-center gap-3 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><Settings className="size-4" />设置</Link>
      </div>
    </aside>
  );
}
