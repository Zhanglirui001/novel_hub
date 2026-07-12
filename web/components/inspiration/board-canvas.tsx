"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
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

import { InspirationCardNode } from "./inspiration-card-node";
import type { InspirationBoardEdge, InspirationBoardGraph, InspirationBoardNode, InspirationCard, InspirationViewport } from "@/lib/types";

type CanvasNodeData = { card?: InspirationCard; annotation?: string };

const nodeTypes = { inspirationCard: InspirationCardNode };

function toFlowNodes(graphNodes: InspirationBoardNode[], cards: InspirationCard[]): Node<CanvasNodeData>[] {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  return graphNodes.map((node) => ({
    id: node.id,
    type: "inspirationCard",
    position: { x: node.position_x, y: node.position_y },
    width: node.width ?? undefined,
    height: node.height ?? undefined,
    zIndex: node.z_index,
    data: node.card_id ? { card: cardsById.get(node.card_id) } : { annotation: String(node.data.annotation || "") },
  }));
}

function toFlowEdges(edges: InspirationBoardEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    label: edge.label,
    type: "smoothstep",
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

  const emit = (nextNodes: Node<CanvasNodeData>[], nextEdges: Edge[]) => {
    const viewport = flowRef.current?.getViewport() || graph.viewport;
    const savedNodes: InspirationBoardNode[] = nextNodes.map((node) => ({
      id: node.id,
      board_id: graph.id,
      card_id: node.data.card?.id ?? null,
      node_type: node.data.card ? "card" : "annotation",
      position_x: node.position.x,
      position_y: node.position.y,
      width: node.measured?.width ?? node.width ?? null,
      height: node.measured?.height ?? node.height ?? null,
      z_index: node.zIndex ?? 0,
      data: node.data.card ? {} : { annotation: node.data.annotation || "" },
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
  };

  const onNodesChange: OnNodesChange = (changes) => {
    const next = applyNodeChanges(changes, nodes);
    setNodes(next);

    if (changes.some((change) => change.type === "select")) {
      onSelectedNodeIdsChange(next.filter((node) => node.selected).map((node) => node.id));
    }
    if (changes.some((change) => change.type === "position" && !change.dragging) || changes.some((change) => change.type === "remove")) {
      emit(next, edges);
    }
  };

  const onEdgesChange: OnEdgesChange<Edge> = (changes) => {
    const next = applyEdgeChanges(changes, edges);
    setEdges(next);

    if (changes.some((change) => change.type === "remove")) emit(nodes, next);
  };

  const onConnect: OnConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const next = addEdge({ ...connection, id: `edge-${crypto.randomUUID()}`, type: "smoothstep" }, edges);
    setEdges(next);
    emit(nodes, next);
  };

  const addCardNode = (card: InspirationCard) => {
    const next = [...nodes, {
      id: `card-${card.id}-${crypto.randomUUID()}`,
      type: "inspirationCard",
      position: { x: 100 + nodes.length * 24, y: 90 + nodes.length * 24 },
      data: { card },
    }];
    setNodes(next);
    emit(next, edges);
  };

  const addAnnotation = () => {
    const text = window.prompt("注释内容");
    if (!text?.trim()) return;
    const next = [...nodes, {
      id: `note-${crypto.randomUUID()}`,
      type: "inspirationCard",
      position: { x: 140 + nodes.length * 24, y: 130 + nodes.length * 24 },
      data: { annotation: text.trim() },
    }];
    setNodes(next);
    emit(next, edges);
  };

  return (
    <div className="relative h-full min-h-[520px] border border-zinc-200 bg-zinc-50">
      <div className="absolute left-3 top-3 z-10 flex gap-2">
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
        <button type="button" className="h-8 border border-zinc-300 bg-white px-3 text-xs text-zinc-700 hover:bg-zinc-100" onClick={addAnnotation}>添加注释</button>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
