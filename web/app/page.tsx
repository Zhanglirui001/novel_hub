import Link from "next/link";
import { Settings } from "lucide-react";

import { CreateProjectDialog } from "@/components/dashboard/create-project-dialog";
import { ProjectGallery } from "@/components/dashboard/project-gallery";
import { ThemePicker } from "@/components/theme-picker";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-6 py-12 lg:py-16">
        <header className="mb-12 flex items-end justify-between gap-6">
          <div className="space-y-3">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
              Novel Hub
            </p>
            <h1 className="display-title text-4xl leading-tight sm:text-5xl">
              你的创作书架
            </h1>
            <p className="max-w-xl text-muted-foreground">
              在沉浸的工作台里写作，让 AI 守护设定一致性，逐句续写与润色，记录每一次修订。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" aria-label="模型配置">
              <Link href="/settings">
                <Settings className="h-4 w-4" />
              </Link>
            </Button>
            <ThemePicker />
            <CreateProjectDialog />
          </div>
        </header>

        <ProjectGallery />
      </div>
    </div>
  );
}
