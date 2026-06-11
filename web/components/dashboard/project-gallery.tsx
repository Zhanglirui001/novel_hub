"use client";

import { BookOpen, AlertCircle } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/lib/queries";
import { ProjectCard } from "./project-card";

export function ProjectGallery() {
  const { data: projects, isLoading, isError, error } = useProjects();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-20 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="font-medium">无法加载项目</p>
        <p className="max-w-md text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "请确认后端服务已启动"}
        </p>
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-20 text-center">
        <BookOpen className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium">还没有作品</p>
        <p className="text-sm text-muted-foreground">
          点击右上角「新建作品」，开启你的第一部小说。
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 animate-fade-in sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} />
      ))}
    </div>
  );
}
