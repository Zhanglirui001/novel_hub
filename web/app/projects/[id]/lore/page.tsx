"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Globe, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function LoreHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const projectId = Number(id);

  const { data } = useQuery({
    queryKey: ["lore", projectId],
    queryFn: () => api.getLore(projectId),
  });

  const chars = data?.characters?.length ?? 0;
  const world = data?.world_rules?.length ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/projects/${projectId}`}>← 返回</Link>
        </Button>
        <h1 className="text-xl font-semibold">设定</h1>
      </div>

      <p className="mb-8 text-sm text-muted-foreground">选择要查看的卡片库。</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href={`/projects/${projectId}/lore/characters`}
          className="group rounded-2xl border bg-card p-6 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600">
              <User className="h-6 w-6" />
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
          <div className="mt-4 text-base font-semibold">角色库</div>
          <div className="mt-1 text-xs text-muted-foreground">{chars} 张角色卡</div>
        </Link>

        <Link
          href={`/projects/${projectId}/lore/world`}
          className="group rounded-2xl border bg-card p-6 transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-600">
              <Globe className="h-6 w-6" />
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
          </div>
          <div className="mt-4 text-base font-semibold">世界观设定库</div>
          <div className="mt-1 text-xs text-muted-foreground">{world} 条设定</div>
        </Link>
      </div>
    </div>
  );
}
