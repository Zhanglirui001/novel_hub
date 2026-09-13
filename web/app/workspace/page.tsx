"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

function WorkspaceRoute() {
  const searchParams = useSearchParams();
  const projectId = Number(searchParams.get("project"));
  const panel = searchParams.get("panel") || undefined;
  if (!Number.isFinite(projectId) || projectId <= 0) return <div className="grid h-full place-items-center text-sm text-muted-foreground">请选择一个有效作品</div>;
  return <WorkspaceProvider projectId={projectId} initialDockTab={panel}><WorkspaceShell /></WorkspaceProvider>;
}

export default function WorkspacePage() {
  return <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">正在打开工作区…</div>}><WorkspaceRoute /></Suspense>;
}
