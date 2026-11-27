"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Globe, User } from "lucide-react";

import { api } from "@/lib/api";

import { useWorkspace } from "./workspace-context";

/** dock「设定」标签的入口面板：角色库 / 世界观设定库，点进各自完整页面。 */
export function LoreMenuPanel() {
  const { projectId } = useWorkspace();
  const { data } = useQuery({
    queryKey: ["lore", projectId],
    queryFn: () => api.getLore(projectId),
  });
  const chars = data?.characters?.length ?? 0;
  const world = data?.world_rules?.length ?? 0;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">选择要查看的卡片库</p>

      <Link
        href={`/projects/${projectId}/lore/characters`}
        className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600">
          <User className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">角色库</div>
          <div className="text-xs text-muted-foreground">{chars} 张角色卡</div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>

      <Link
        href={`/projects/${projectId}/lore/world`}
        className="group flex items-center gap-3 rounded-xl border bg-card p-3 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-sm"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600">
          <Globe className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">世界观设定库</div>
          <div className="text-xs text-muted-foreground">{world} 条设定</div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
      </Link>
    </div>
  );
}
