"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { InspirationStudio } from "@/components/inspiration/inspiration-studio";
import { useProject } from "@/lib/queries";

function InspirationRoute() {
  const projectId = Number(useSearchParams().get("project"));
  const project = useProject(projectId);
  if (!Number.isFinite(projectId) || projectId <= 0) return <div className="grid h-full place-items-center text-sm text-muted-foreground">请选择一个有效作品</div>;
  if (project.isLoading) return <div className="grid h-full place-items-center text-sm text-muted-foreground">正在打开灵感空间…</div>;
  if (!project.data) return <div className="grid h-full place-items-center text-sm text-destructive">作品加载失败</div>;
  return <InspirationStudio projectId={projectId} projectTitle={project.data.name} />;
}

export default function InspirationPage() {
  return <Suspense fallback={null}><InspirationRoute /></Suspense>;
}
