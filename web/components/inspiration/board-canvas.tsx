import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type OnConnect,
  type OnEdgesChange,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { InspirationCardNode, QuickNode } from "./inspiration-card-node";
import type { InspirationBoardEdge, InspirationBoardGraph, InspirationBoardNode, InspirationCard, InspirationViewport } from "@/lib/types";

type CanvasNodeData = { card?: InspirationCard; annotation?: string; title?: string; content?: string; nodeType?: "annotation" | "event" | "character" };

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

function toFlowEdges(edges: InspirationBoardEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    label: edge.label,
    type: "smoothstep",
    style: { stroke: "#0f766e", strokeWidth: 1.5 },
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
  const [edges, setEdges] = useState<Edge[]>([]);
  const flowRef = useRef<ReactFlowInstance<Node<CanvasNodeData>, Edge> | null>(null);
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  useEffect(() => {
    setNodes(toFlowNodes(graph.nodes, cards));
    setEdges(toFlowEdges(graph.edges));
  }, [graph, cards]);

  const emit = useCallback((nextNodes: Node<CanvasNodeData>[], nextEdges: Edge[]) => {
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
      edge_type: "relation",
      label: typeof edge.label === "string" ? edge.label : "",
      style: {},
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

  const onEdgesChange: OnEdgesChange<Edge> = (changes) => {
    const next = applyEdgeChanges(changes, edges);
    setEdges(next);
    if (changes.some((change) => change.type === "remove")) emit(nodes, next);
  };

  const onConnect: OnConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const next = addEdge({ ...connection, id: `edge-${crypto.randomUUID()}`, type: "smoothstep", style: { stroke: "#0f766e", strokeWidth: 1.5 } }, edges);
    setEdges(next);
    emit(nodes, next);
  };

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
      className="relative h-full min-h-[520px] border border-zinc-200 bg-zinc-50"
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
        isValidConnection={(connection) => connection.source !== connection.target}
        connectionMode={ConnectionMode.Loose}
        connectionLineType={ConnectionLineType.SmoothStep}
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
      </ReactFlow>
    </div>
  );
}
