"use client";

import * as React from "react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "./workspace-context";
import { useStoryline, usePatchStorylineGraph } from "@/lib/queries";
import type { StorylineEdge, StorylineGraph, StorylineNode, StorylineViewport } from "@/lib/types";
import { StorylineCanvas } from "./storyline-canvas";

const SAVE_DEBOUNCE_MS = 600;

export function StorylinePanel({ fullscreen }: { fullscreen?: boolean }) {
  const { projectId } = useWorkspace();
  const { data: graph, isLoading, isError } = useStoryline(projectId);
  const patchGraph = usePatchStorylineGraph(projectId);

  // 后端最新快照与版本号，用于计算删除项与乐观锁。
  const graphRef = React.useRef<StorylineGraph | undefined>(graph);
  React.useEffect(() => { graphRef.current = graph; }, [graph]);

  const pendingRef = React.useRef<{ nodes: StorylineNode[]; edges: StorylineEdge[]; viewport: StorylineViewport } | null>(null);
  const timerRef = React.useRef<number | null>(null);

  const flush = React.useCallback(() => {
    const snapshot = graphRef.current;
    const pending = pendingRef.current;
    if (!snapshot || !pending || patchGraph.isPending) return;

    const nextNodeIds = new Set(pending.nodes.map((node) => node.id));
    const nextEdgeIds = new Set(pending.edges.map((edge) => edge.id));
    const deletedNodeIds = snapshot.nodes.filter((node) => !nextNodeIds.has(node.id)).map((node) => node.id);
    const deletedEdgeIds = snapshot.edges.filter((edge) => !nextEdgeIds.has(edge.id)).map((edge) => edge.id);

    pendingRef.current = null;
    patchGraph.mutate(
      {
        expected_graph_version: snapshot.version,
        viewport: pending.viewport,
        nodes: pending.nodes,
        deleted_node_ids: deletedNodeIds,
        edges: pending.edges,
        deleted_edge_ids: deletedEdgeIds,
      },
      {
        onError: (error) => {
          const message = error instanceof Error ? error.message : "保存故事线失败";
          // 版本冲突（并发编辑）：丢弃本地待存改动，重新拉取服务端最新图。
          if (message.includes("409") || message.includes("重新加载")) {
            toast.error("故事线已在别处更新，已重新加载");
          } else {
            toast.error(message);
          }
        },
      },
    );
  }, [patchGraph]);

  const scheduleSave = React.useCallback((nodes: StorylineNode[], edges: StorylineEdge[], viewport: StorylineViewport) => {
    pendingRef.current = { nodes, edges, viewport };
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  React.useEffect(() => () => { if (timerRef.current) window.clearTimeout(timerRef.current); }, []);

  const containerClass = fullscreen ? "h-full" : "h-[520px]";

  if (isLoading) {
    return (
      <div className={containerClass}>
        <Skeleton className="h-full w-full" />
      </div>
    );
  }

  if (isError || !graph) {
    return (
      <div className={`${containerClass} flex items-center justify-center border border-dashed border-zinc-300 text-sm text-zinc-500`}>
        故事线加载失败，请稍后重试。
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <StorylineCanvas graph={graph} onGraphChange={scheduleSave} />
    </div>
  );
}
