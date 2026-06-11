"use client";

import { use } from "react";

import { WorkspaceProvider } from "@/components/workspace/workspace-context";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = Number(id);

  if (!Number.isFinite(projectId) || projectId <= 0) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        无效的项目 ID
      </div>
    );
  }

  return (
    <WorkspaceProvider projectId={projectId}>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
}
