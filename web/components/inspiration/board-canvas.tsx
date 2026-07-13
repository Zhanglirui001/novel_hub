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

import { InspirationCardNode, QuickNode } from "./inspiration-card-node";
import type { InspirationBoardEdge, InspirationBoardGraph, InspirationBoardNode, InspirationCard, InspirationViewport } from "@/lib/types";

type CanvasNodeData = { card?: InspirationCard; annotation?: string; title?: string; content?: string; nodeType?: "annotation" | "event" | "character" };
type CanvasEdgeData = {
  edgeType: string;
  style: Record<string, unknown>;
};

const edgeStyle = { stroke: "#0f766e", strokeWidth: 1.5 };
const edgeMarker: EdgeMarker = { type: MarkerType.ArrowClosed, color: "#0f766e", width: 14, height: 14 };

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
  return {
    ...style,
    flow: { ...flow, sourceHandle, targetHandle },
  };
}

const nodeTypes = { inspirationCard: InspirationCardNode, quickNode: QuickNode };

function toFlowNodes(graphNodes: InspirationBoardNode[], cards: InspirationCard[]): Node<CanvasNodeData>[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return graphNodes.map((node) => ({
    id: node.id,
    type: node.node_type === "card" || node.node_type === "annotation" ? "inspirationCard" : "quickNode",
    position: { x: node.position_x, y: node.position_y },
    width: node.width ?? undefined,
    height: node.height ?? undefined,
    zIndex: node.z_index,
    data: node.card_id ? { card: cardsById.get(node.card_id) } : node.node_type === "annotation"
      ? { annotation: String(node.data.annotation || "") }
      : { title: String(node.data.title || ""), content: String(node.data.content || ""), nodeType: node.node_type as "event" | "character" },
  }));
}

function toFlowEdges(edges: InspirationBoardEdge[]): Edge<CanvasEdgeData>[] {
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
    data: { edgeType: edge.edge_type, style: edge.style },
  }));
}

interface BoardCanvasProps {
  graph: InspirationBoardGraph;
  cards: InspirationCard[];
  selectedNodeIds: string[];
  onSelectedNodeIdsChange: (ids: string[]) => void;
  onGraphChange: (nodes: InspirationBoardNode[], edges: InspirationBoardEdge[], viewport: InspirationViewport) => void;
}

export function BoardCanvas({ graph, cards, selectedNodeIds, onSelectedNodeIdsChange, onGraphChange }: BoardCanvasProps) {
  const [nodes, setNodes] = useState<Node<CanvasNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge<CanvasEdgeData>[]>([]);
  const flowRef = useRef<ReactFlowInstance<Node<CanvasNodeData>, Edge<CanvasEdgeData>> | null>(null);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  useEffect(() => {
    setNodes(toFlowNodes(graph.nodes, cards));
    setEdges(toFlowEdges(graph.edges));
  }, [graph, cards]);

  const emit = useCallback((nextNodes: Node<CanvasNodeData>[], nextEdges: Edge<CanvasEdgeData>[]) => {
    const viewport = flowRef.current?.getViewport() || graph.viewport;
    const savedNodes: InspirationBoardNode[] = nextNodes.map((node) => ({
      id: node.id,
      board_id: graph.id,
      card_id: node.data.card?.id ?? null,
      node_type: node.data.card ? "card" : node.data.nodeType ?? "annotation",
      position_x: node.position.x,
      position_y: node.position.y,
      width: node.measured?.width ?? node.width ?? null,
      height: node.measured?.height ?? node.height ?? null,
      z_index: node.zIndex ?? 0,
      data: node.data.card ? {} : node.data.nodeType ? { title: node.data.title || "", content: node.data.content || "" } : { annotation: node.data.annotation || "" },
      created_at: "",
      updated_at: "",
    }));
    const savedEdges: InspirationBoardEdge[] = nextEdges.map((edge) => ({
      id: edge.id,
      board_id: graph.id,
      source_node_id: edge.source,
      target_node_id: edge.target,
      edge_type: edge.data?.edgeType || "relation",
      label: typeof edge.label === "string" ? edge.label : "",
      style: withHandleIds(edge.data?.style || {}, edge.sourceHandle ?? null, edge.targetHandle ?? null),
      created_at: "",
      updated_at: "",
    }));
    onGraphChange(savedNodes, savedEdges, viewport);
  }, [graph, onGraphChange]);

  const onNodesChange: OnNodesChange = (changes) => {
    const next = applyNodeChanges(changes, nodes);
    setNodes(next);

    if (changes.some((change) => change.type === "select")) onSelectedNodeIdsChange(next.filter((node) => node.selected).map((node) => node.id));
    if (changes.some((change) => change.type === "position" && !change.dragging) || changes.some((change) => change.type === "remove")) emit(next, edges);
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
      id: `edge-${crypto.randomUUID()}`,
      type: "smoothstep",
      className: "inspiration-board-edge",
      style: edgeStyle,
      markerEnd: edgeMarker,
      data: { edgeType: "relation", style: withHandleIds({}, connection.sourceHandle, connection.targetHandle) },
    }, edges);
    setEdges(next);
    emit(nodes, next);
  };

  const onReconnect: OnReconnect<Edge<CanvasEdgeData>> = (oldEdge, connection) => {
    if (!canReconnect(oldEdge, connection)) return;
    const next = reconnectEdge(oldEdge, connection, edges, { shouldReplaceId: false });
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

  const addCardNode = (card: InspirationCard, position?: { x: number; y: number }) => {
    const next = [...nodes, {
      id: `card-${card.id}-${crypto.randomUUID()}`,
      type: "inspirationCard",
      position: position || { x: 100 + nodes.length * 24, y: 90 + nodes.length * 24 },
      data: { card },
    }];
    setNodes(next);
    emit(next, edges);
  };

  const addQuickNode = (nodeType: "annotation" | "event" | "character") => {
    const title = window.prompt(nodeType === "event" ? "事件名称" : nodeType === "character" ? "角色名称" : "注释内容");
    if (!title?.trim()) return;
    const next = [...nodes, {
      id: `${nodeType}-${crypto.randomUUID()}`,
      type: nodeType === "annotation" ? "inspirationCard" : "quickNode",
      position: { x: 140 + nodes.length * 24, y: 130 + nodes.length * 24 },
      data: nodeType === "annotation" ? { annotation: title.trim() } : { title: title.trim(), nodeType },
    }];
    setNodes(next);
    emit(next, edges);
  };

  return (
    <div
      className="inspiration-board relative h-full min-h-[520px] border border-zinc-200 bg-zinc-50"
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDrop={(event) => {
        event.preventDefault();
        const card = cardsById.get(Number(event.dataTransfer.getData("application/x-inspiration-card")));
        const position = flowRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        if (card && position) addCardNode(card, position);
      }}
    >
      <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
        <select
          aria-label="添加灵感卡片至画板"
          className="h-8 max-w-52 border border-zinc-300 bg-white px-2 text-xs"
          defaultValue=""
          onChange={(event) => {
            const card = cardsById.get(Number(event.target.value));
            if (card) addCardNode(card);
            event.target.value = "";
          }}
        >
          <option value="">添加卡片到画板</option>
          {cards.map((card) => <option key={card.id} value={card.id}>{card.title}</option>)}
        </select>
        <button type="button" className="h-8 border border-zinc-300 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-100" onClick={() => addQuickNode("event")}>事件</button>
        <button type="button" className="h-8 border border-zinc-300 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-100" onClick={() => addQuickNode("character")}>角色</button>
        <button type="button" className="h-8 border border-zinc-300 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-100" onClick={() => addQuickNode("annotation")}>注释</button>
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
        onMoveEnd={(_, viewport) => emit(nodes, edges)}
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
              aria-label="删除关系"
              title="删除关系"
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
