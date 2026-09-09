"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

function WorkspaceRoute() {
  const projectId = Number(useSearchParams().get("project"));
  if (!Number.isFinite(projectId) || projectId <= 0) return <div className="grid h-full place-items-center text-sm text-muted-foreground">请选择一个有效作品</div>;
  return <WorkspaceProvider projectId={projectId}><WorkspaceShell /></WorkspaceProvider>;
}

export default function WorkspacePage() {
  return <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">正在打开工作区…</div>}><WorkspaceRoute /></Suspense>;
}
