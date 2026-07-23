"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  addEdge,
  Background,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  EdgeToolbar,
  MarkerType,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeMarker,
  type IsValidConnection,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type OnReconnect,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { StorylineNode } from "./storyline-node";
import type { StorylineEdge, StorylineGraph, StorylineNode as StorylineNodeModel, StorylineViewport } from "@/lib/types";

type CanvasNodeData = {
  title: string;
  description: string;
  onChange: (id: string, patch: { title?: string; description?: string }) => void;
};
type CanvasEdgeData = { style: Record<string, unknown> };

const edgeStyle = { stroke: "#0f766e", strokeWidth: 1.5 };
const edgeMarker: EdgeMarker = { type: MarkerType.ArrowClosed, color: "#0f766e", width: 14, height: 14 };

const nodeTypes = { storyNode: StorylineNode };

function getHandleIds(style: Record<string, unknown>) {
  const flow = style.flow;
  if (!flow || typeof flow !== "object" || Array.isArray(flow)) return {};
  const { sourceHandle, targetHandle } = flow as Record<string, unknown>;
  return {
    sourceHandle: typeof sourceHandle === "string" ? sourceHandle : undefined,
    targetHandle: typeof targetHandle === "string" ? targetHandle : undefined,
  };
}

function withHandleIds(style: Record<string, unknown>, sourceHandle: string | null, targetHandle: string | null) {
  const flow = style.flow && typeof style.flow === "object" && !Array.isArray(style.flow) ? style.flow : {};
  return { ...style, flow: { ...flow, sourceHandle, targetHandle } };
}

function toFlowEdges(edges: StorylineEdge[]): Edge<CanvasEdgeData>[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    ...getHandleIds(edge.style),
    label: edge.label,
    type: "smoothstep",
    className: "inspiration-board-edge",
    style: edgeStyle,
    markerEnd: edgeMarker,
    data: { style: edge.style },
  }));
}

interface StorylineCanvasProps {
  graph: StorylineGraph;
  onGraphChange: (nodes: StorylineNodeModel[], edges: StorylineEdge[], viewport: StorylineViewport) => void;
}

export function StorylineCanvas({ graph, onGraphChange }: StorylineCanvasProps) {
  const [nodes, setNodes] = useState<Node<CanvasNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge<CanvasEdgeData>[]>([]);
  const flowRef = useRef<ReactFlowInstance<Node<CanvasNodeData>, Edge<CanvasEdgeData>> | null>(null);

  // 在 async / node 回调里读到最新值，避免闭包过期。
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  const emitRef = useRef<(n: Node<CanvasNodeData>[], e: Edge<CanvasEdgeData>[]) => void>(() => {});
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  // 节点内联编辑标题/简介 → 更新本地并落库。稳定引用，注入进每个节点的 data。
  const updateNodeData = useCallback((id: string, patch: { title?: string; description?: string }) => {
    const next = nodesRef.current.map((node) =>
      node.id === id ? { ...node, data: { ...node.data, ...patch } } : node,
    );
    setNodes(next);
    emitRef.current(next, edgesRef.current);
  }, []);

  const toFlowNodes = useCallback((graphNodes: StorylineNodeModel[]): Node<CanvasNodeData>[] =>
    graphNodes.map((node) => ({
      id: node.id,
      type: "storyNode",
      position: { x: node.position_x, y: node.position_y },
      width: node.width ?? undefined,
      height: node.height ?? undefined,
      zIndex: node.z_index,
      data: { title: node.title, description: node.description, onChange: updateNodeData },
    })), [updateNodeData]);

  useEffect(() => {
    setNodes(toFlowNodes(graph.nodes));
    setEdges(toFlowEdges(graph.edges));
  }, [graph, toFlowNodes]);

  const emit = useCallback((nextNodes: Node<CanvasNodeData>[], nextEdges: Edge<CanvasEdgeData>[]) => {
    const viewport = flowRef.current?.getViewport() || graph.viewport;
    const savedNodes: StorylineNodeModel[] = nextNodes.map((node) => ({
      id: node.id,
      graph_id: graph.id,
      title: node.data.title || "",
      description: node.data.description || "",
      position_x: node.position.x,
      position_y: node.position.y,
      width: node.measured?.width ?? node.width ?? null,
      height: node.measured?.height ?? node.height ?? null,
      z_index: node.zIndex ?? 0,
      created_at: "",
      updated_at: "",
    }));
    const savedEdges: StorylineEdge[] = nextEdges.map((edge) => ({
      id: edge.id,
      graph_id: graph.id,
      source_node_id: edge.source,
      target_node_id: edge.target,
      label: typeof edge.label === "string" ? edge.label : "",
      style: withHandleIds(edge.data?.style || {}, edge.sourceHandle ?? null, edge.targetHandle ?? null),
      created_at: "",
      updated_at: "",
    }));
    onGraphChange(savedNodes, savedEdges, viewport);
  }, [graph, onGraphChange]);
  useEffect(() => { emitRef.current = emit; }, [emit]);

  const onNodesChange: OnNodesChange<Node<CanvasNodeData>> = (changes) => {
    const next = applyNodeChanges<Node<CanvasNodeData>>(changes, nodes);
    setNodes(next);
    if (changes.some((change) => (change.type === "position" && !change.dragging) || change.type === "remove")) emit(next, edges);
  };

  const onEdgesChange: OnEdgesChange<Edge<CanvasEdgeData>> = (changes) => {
    const next = applyEdgeChanges(changes, edges);
    setEdges(next);
    if (changes.some((change) => change.type === "remove")) emit(nodes, next);
  };

  const isValidConnection: IsValidConnection<Edge<CanvasEdgeData>> = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return false;
    return !edges.some((edge) => (
      edge.source === connection.source
      && edge.target === connection.target
      && edge.sourceHandle === connection.sourceHandle
      && edge.targetHandle === connection.targetHandle
    ));
  }, [edges]);

  const canReconnect = useCallback((oldEdge: Edge<CanvasEdgeData>, connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return false;
    return !edges.some((edge) => edge.id !== oldEdge.id && (
      edge.source === connection.source
      && edge.target === connection.target
      && edge.sourceHandle === connection.sourceHandle
      && edge.targetHandle === connection.targetHandle
    ));
  }, [edges]);

  const onConnect: OnConnect = (connection: Connection) => {
    if (!isValidConnection(connection)) return;
    const next = addEdge({
      ...connection,
      id: `sl-edge-${crypto.randomUUID()}`,
      type: "smoothstep",
      className: "inspiration-board-edge",
      style: edgeStyle,
      markerEnd: edgeMarker,
      data: { style: withHandleIds({}, connection.sourceHandle, connection.targetHandle) },
    }, edges);
    setEdges(next);
    emit(nodes, next);
  };

  const onReconnect: OnReconnect<Edge<CanvasEdgeData>> = (oldEdge, connection) => {
    if (!canReconnect(oldEdge, connection)) return;
    const reconnectedEdge = reconnectEdge(oldEdge, connection, edges, { shouldReplaceId: false });
    const next = reconnectedEdge.map((edge) => edge.id === oldEdge.id ? {
      ...edge,
      style: edgeStyle,
      markerEnd: edgeMarker,
      data: { style: withHandleIds(oldEdge.data?.style || {}, edge.sourceHandle ?? null, edge.targetHandle ?? null) },
    } : edge);
    setEdges(next);
    emit(nodes, next);
  };

  const deleteEdge = (edgeId: string) => {
    const next = edges.filter((edge) => edge.id !== edgeId);
    setEdges(next);
    emit(nodes, next);
  };

  const selectedEdgeToolbars = useMemo(() => edges.flatMap((edge) => {
    if (!edge.selected) return [];
    const source = nodes.find((node) => node.id === edge.source);
    const target = nodes.find((node) => node.id === edge.target);
    if (!source || !target) return [];
    const sourceWidth = source.measured?.width ?? source.width ?? 0;
    const sourceHeight = source.measured?.height ?? source.height ?? 0;
    const targetWidth = target.measured?.width ?? target.width ?? 0;
    const targetHeight = target.measured?.height ?? target.height ?? 0;
    return [{
      edgeId: edge.id,
      x: (source.position.x + sourceWidth / 2 + target.position.x + targetWidth / 2) / 2,
      y: (source.position.y + sourceHeight / 2 + target.position.y + targetHeight / 2) / 2,
    }];
  }), [edges, nodes]);

  const addNode = () => {
    const position = flowRef.current
      ? flowRef.current.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 })
      : { x: 120 + nodes.length * 28, y: 100 + nodes.length * 28 };
    const next = [...nodes, {
      id: `sl-node-${crypto.randomUUID()}`,
      type: "storyNode",
      position,
      data: { title: "新情节", description: "", onChange: updateNodeData },
    }];
    setNodes(next);
    emit(next, edges);
  };

  return (
    <div className="inspiration-board relative h-full min-h-[480px] border border-zinc-200 bg-zinc-50">
      <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
        <button
          type="button"
          className="h-8 border border-teal-500 bg-teal-50 px-3 text-xs font-medium text-teal-800 hover:bg-teal-100"
          onClick={addNode}
        >
          + 新增情节
        </button>
        <span className="flex h-8 items-center px-1 text-[11px] text-zinc-400">双击节点编辑 · 拖拽连线 · Del 删除</span>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        edgesReconnectable
        reconnectRadius={16}
        isValidConnection={isValidConnection}
        connectionMode={ConnectionMode.Strict}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: "#0f766e", strokeWidth: 2.25, strokeLinecap: "round" }}
        onInit={(instance) => {
          flowRef.current = instance;
          instance.setViewport(graph.viewport);
        }}
        onMoveEnd={() => emit(nodes, edges)}
        deleteKeyCode={["Backspace", "Delete"]}
        fitView
      >
        <Background gap={18} size={1} color="#d4d4d8" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor="#0f766e" />
        {selectedEdgeToolbars.map(({ edgeId, x, y }) => (
          <EdgeToolbar key={edgeId} edgeId={edgeId} x={x} y={y} isVisible>
            <button
              type="button"
              className="flex size-9 items-center justify-center rounded-full border-2 border-rose-500 bg-white text-rose-700 shadow-md transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 active:bg-rose-100"
              aria-label="删除连线"
              title="删除连线"
              onClick={() => deleteEdge(edgeId)}
            >
              <Trash2 className="size-4" strokeWidth={2.5} />
            </button>
          </EdgeToolbar>
        ))}
      </ReactFlow>
    </div>
  );
}
