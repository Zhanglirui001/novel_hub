"use client";

import { useEffect, useMemo, useState } from "react";
import { BrainCircuit, FilePlus2, Loader2, MessageSquareText, Network, Plus, Send, Sparkles, Trash2 } from "lucide-react";

import { BoardCanvas } from "./board-canvas";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import {
  useCreateInspirationBoard,
  useCreateInspirationCard,
  useDeleteInspirationCard,
  useInspirationBoard,
  useInspirationBoards,
  useInspirationCards,
  usePatchInspirationGraph,
  useUpdateInspirationCard,
} from "@/lib/queries";
import type { InspirationBoardEdge, InspirationBoardNode, InspirationCard, InspirationCardPayload, InspirationProposal } from "@/lib/types";

const defaultCard: InspirationCardPayload = { card_type: "idea", title: "", content: "", tags: [], color: "amber" };
const cardTypes = ["idea", "character", "scene", "conflict", "question", "research", "note"];

function cardPayload(card: InspirationCard | null): InspirationCardPayload {
  if (!card) return defaultCard;
  return { card_type: card.card_type, title: card.title, content: card.content, tags: card.tags, color: card.color };
}

interface InspirationStudioProps {
  projectId: number;
  projectTitle: string;
}

export function InspirationStudio({ projectId, projectTitle }: InspirationStudioProps) {
  const [search, setSearch] = useState("");
  const [boardId, setBoardId] = useState<number | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedCard, setSelectedCard] = useState<InspirationCard | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<InspirationCardPayload>(defaultCard);
  const [discussion, setDiscussion] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [discussing, setDiscussing] = useState(false);
  const [proposal, setProposal] = useState<InspirationProposal | null>(null);
  const [notice, setNotice] = useState("");

  const cardsQuery = useInspirationCards(projectId, { search });
  const boardsQuery = useInspirationBoards(projectId);
  const boardQuery = useInspirationBoard(projectId, boardId);
  const createBoard = useCreateInspirationBoard(projectId);
  const createCard = useCreateInspirationCard(projectId);
  const updateCard = useUpdateInspirationCard(projectId);
  const deleteCard = useDeleteInspirationCard(projectId);
  const patchGraph = usePatchInspirationGraph(projectId, boardId);

  const cards = cardsQuery.data || [];
  const boards = boardsQuery.data || [];
  const graph = boardQuery.data;
  const selectedCardIds = useMemo(() => {
    if (!graph) return [];
    return graph.nodes.filter((node) => selectedNodeIds.includes(node.id) && node.card_id).map((node) => node.card_id as number);
  }, [graph, selectedNodeIds]);

  useEffect(() => {
    if (!boardId && boards.length) setBoardId(boards[0].id);
  }, [boardId, boards]);

  useEffect(() => {
    if (!selectedCardIds.length) return;
    const card = cards.find((item) => item.id === selectedCardIds[0]);
    if (card) setSelectedCard(card);
  }, [cards, selectedCardIds]);

  const openCreateCard = () => {
    setSelectedCard(null);
    setDraft(defaultCard);
    setEditorOpen(true);
  };

  const openEditCard = (card: InspirationCard) => {
    setSelectedCard(card);
    setDraft(cardPayload(card));
    setEditorOpen(true);
  };

  const saveCard = async () => {
    if (!draft.title.trim()) return;
    try {
      const payload = { ...draft, title: draft.title.trim(), tags: draft.tags.filter(Boolean) };
      if (selectedCard) await updateCard.mutateAsync({ cardId: selectedCard.id, payload });
      else await createCard.mutateAsync(payload);
      setEditorOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存卡片失败");
    }
  };

  const saveGraph = (nodes: InspirationBoardNode[], edges: InspirationBoardEdge[], viewport: { x: number; y: number; zoom: number }) => {
    if (!graph || patchGraph.isPending) return;
    patchGraph.mutate({
      expected_graph_version: graph.graph_version,
      viewport,
      nodes,
      deleted_node_ids: graph.nodes.filter((node) => !nodes.some((next) => next.id === node.id)).map((node) => node.id),
      edges,
      deleted_edge_ids: graph.edges.filter((edge) => !edges.some((next) => next.id === edge.id)).map((edge) => edge.id),
    }, {
      onError: (error) => {
        setNotice(error instanceof Error ? "画板已有更新，已保留服务端版本" : "画板保存失败");
        boardQuery.refetch();
      },
    });
  };

  const createNewBoard = async () => {
    const title = window.prompt("画板名称", "剧情主线");
    if (!title?.trim()) return;
    try {
      const board = await createBoard.mutateAsync({ title: title.trim() });
      setBoardId(board.id);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建画板失败");
    }
  };

  const sendDiscussion = async () => {
    if (!graph || !discussion.trim() || discussing) return;
    const text = discussion.trim();
    setDiscussion("");
    setDiscussing(true);
    setMessages((current) => [...current, { role: "user", content: text }, { role: "assistant", content: "" }]);
    try {
      await api.streamInspirationDiscussion(projectId, graph.id, { content: text, selected_node_ids: selectedNodeIds }, {
        onEvent: (event) => {
          if (event.type === "delta") {
            setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: message.content + event.text } : message));
          }
          if (event.type === "error") setNotice(event.message);
        },
      });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "灵感讨论失败");
    } finally {
      setDiscussing(false);
    }
  };

  const createProposal = async () => {
    if (!graph || !discussion.trim()) return;
    try {
      const created = await api.createInspirationProposal(projectId, graph.id, {
        base_graph_version: graph.graph_version,
        actions: [{
          action_type: "create_card",
          card: { ...defaultCard, title: discussion.trim(), content: "来自灵感讨论的待整理内容", tags: ["AI讨论"], color: "violet" },
        }],
      });
      setProposal(created);
      setDiscussion("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "创建提案失败");
    }
  };

  const applyProposal = async () => {
    if (!proposal) return;
    try {
      const result = await api.applyInspirationProposal(projectId, proposal.id);
      setProposal(null);
      await Promise.all([boardQuery.refetch(), cardsQuery.refetch()]);
      setNotice(`已应用提案，新增 ${result.created_cards.length} 张卡片`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "应用提案失败");
    }
  };

  return (
    <main className="flex h-screen min-h-[680px] flex-col bg-zinc-100 text-zinc-900">
      <header className="flex min-h-14 items-center justify-between border-b border-zinc-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 items-center justify-center bg-teal-700 text-white"><BrainCircuit className="size-4" /></div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{projectTitle}</p>
            <p className="text-xs text-zinc-500">灵感工作台</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select className="h-8 max-w-48 border border-zinc-300 bg-white px-2 text-xs" value={boardId ?? ""} onChange={(event) => setBoardId(Number(event.target.value))}>
            {boards.map((board) => <option key={board.id} value={board.id}>{board.title}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={createNewBoard}><Plus className="mr-1 size-3.5" />新画板</Button>
        </div>
      </header>

      {notice ? <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">{notice}<button type="button" className="ml-3 underline" onClick={() => setNotice("")}>关闭</button></div> : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_340px]">
        <aside className="flex min-h-0 flex-col border-r border-zinc-200 bg-white">
          <div className="space-y-2 border-b border-zinc-200 p-3">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">灵感卡片</p><Button size="icon" variant="ghost" aria-label="新建灵感卡片" onClick={openCreateCard}><FilePlus2 className="size-4" /></Button></div>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标题、正文或标签" className="h-8 text-xs" />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2 p-3">
              {cardsQuery.isLoading ? <p className="text-xs text-zinc-500">加载中...</p> : null}
              {cards.map((card) => (
                <button key={card.id} type="button" className="w-full border border-zinc-200 p-3 text-left hover:border-teal-500 hover:bg-teal-50" onClick={() => openEditCard(card)}>
                  <div className="mb-1 flex justify-between gap-2"><span className="text-[11px] uppercase text-teal-700">{card.card_type}</span><span className="text-[11px] text-zinc-400">{card.origin === "ai" ? "AI" : ""}</span></div>
                  <p className="line-clamp-1 text-sm font-medium">{card.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{card.content || "暂无正文"}</p>
                </button>
              ))}
              {!cards.length && !cardsQuery.isLoading ? <p className="py-8 text-center text-xs text-zinc-500">创建一张卡片开始记录。</p> : null}
            </div>
          </ScrollArea>
        </aside>

        <section className="relative min-h-[520px] min-w-0">
          {!boards.length ? <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-50"><Network className="size-8 text-zinc-400" /><p className="text-sm text-zinc-600">先创建一张画板，组织你的剧情线索。</p><Button onClick={createNewBoard}>创建第一张画板</Button></div> : null}
          {graph ? <BoardCanvas graph={graph} cards={cards} selectedNodeIds={selectedNodeIds} onSelectedNodeIdsChange={setSelectedNodeIds} onGraphChange={saveGraph} /> : boards.length ? <div className="flex h-full items-center justify-center text-sm text-zinc-500"><Loader2 className="mr-2 size-4 animate-spin" />加载画板...</div> : null}
        </section>

        <aside className="flex min-h-0 flex-col border-l border-zinc-200 bg-white">
          <div className="border-b border-zinc-200 p-3"><p className="text-sm font-semibold">检查器与讨论</p><p className="mt-1 text-xs text-zinc-500">选中卡片后，AI 会获得当前节点和关系上下文。</p></div>
          {selectedCard ? <div className="border-b border-zinc-200 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs text-teal-700">{selectedCard.card_type}</p><p className="mt-1 text-sm font-medium">{selectedCard.title}</p></div><Button size="icon" variant="ghost" aria-label="编辑卡片" onClick={() => openEditCard(selectedCard)}><FilePlus2 className="size-4" /></Button></div><p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-zinc-600">{selectedCard.content}</p></div> : null}
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-3">
              {messages.length ? messages.map((message, index) => <div key={`${message.role}-${index}`} className={`whitespace-pre-wrap border p-3 text-xs leading-5 ${message.role === "user" ? "border-teal-200 bg-teal-50 text-teal-950" : "border-zinc-200 bg-zinc-50 text-zinc-700"}`}>{message.content || <Loader2 className="size-3 animate-spin" />}</div>) : <div className="border border-dashed border-zinc-300 p-4 text-xs leading-5 text-zinc-500"><Sparkles className="mb-2 size-4 text-teal-700" />从冲突、转折、人物动机或伏笔开始讨论。选择画板节点可让讨论聚焦。</div>}
            </div>
          </ScrollArea>
          {proposal ? <div className="border-t border-violet-200 bg-violet-50 p-3"><p className="text-xs font-semibold text-violet-900">待确认提案</p><p className="mt-1 text-xs text-violet-800">将创建 1 张 AI 整理卡片。</p><div className="mt-2 flex gap-2"><Button size="sm" onClick={applyProposal}>应用</Button><Button size="sm" variant="outline" onClick={async () => { await api.dismissInspirationProposal(projectId, proposal.id); setProposal(null); }}>驳回</Button></div></div> : null}
          <div className="border-t border-zinc-200 p-3">
            <Textarea value={discussion} onChange={(event) => setDiscussion(event.target.value)} placeholder="讨论当前灵感、剧情关系或待解决的问题..." className="min-h-20 resize-none text-xs" onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); sendDiscussion(); } }} />
            <div className="mt-2 flex justify-between gap-2"><Button variant="outline" size="sm" disabled={!discussion.trim() || !graph} onClick={createProposal}><Plus className="mr-1 size-3.5" />整理为提案</Button><Button size="sm" disabled={!discussion.trim() || !graph || discussing} onClick={sendDiscussion}><Send className="mr-1 size-3.5" />讨论</Button></div>
          </div>
        </aside>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{selectedCard ? "编辑灵感卡片" : "新建灵感卡片"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="卡片标题" />
            <div className="grid grid-cols-2 gap-3"><select className="h-9 border border-zinc-300 bg-white px-2 text-sm" value={draft.card_type} onChange={(event) => setDraft((current) => ({ ...current, card_type: event.target.value }))}>{cardTypes.map((type) => <option key={type}>{type}</option>)}</select><select className="h-9 border border-zinc-300 bg-white px-2 text-sm" value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))}>{["amber", "rose", "sky", "emerald", "violet"].map((color) => <option key={color}>{color}</option>)}</select></div>
            <Textarea value={draft.content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} placeholder="记录场景、关系、设想或待验证的问题" className="min-h-44" />
            <Input value={draft.tags.join(", ")} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) }))} placeholder="标签，用逗号分隔" />
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {selectedCard ? <Button variant="ghost" className="text-rose-700 hover:text-rose-800" onClick={async () => { if (window.confirm("删除此卡片及其画板引用？")) { await deleteCard.mutateAsync(selectedCard.id); setSelectedCard(null); setEditorOpen(false); boardQuery.refetch(); } }}><Trash2 className="mr-1 size-4" />删除</Button> : <span />}
            <Button onClick={saveCard} disabled={!draft.title.trim() || createCard.isPending || updateCard.isPending}>保存卡片</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
