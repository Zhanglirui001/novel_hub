"use client";

import { useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";

type StoryNodeChange = (id: string, patch: { title?: string; description?: string }) => void;

const sideLabel: Record<string, string> = { left: "左", right: "右", top: "上", bottom: "下" };

function NodeHandles() {
  const handles = [
    { side: "left", position: Position.Left },
    { side: "right", position: Position.Right },
    { side: "top", position: Position.Top },
    { side: "bottom", position: Position.Bottom },
  ];

  return (
    <>
      {handles.map(({ side, position }) => (
        <Handle key={`target-${side}`} id={`target-${side}`} type="target" position={position} className="inspiration-handle inspiration-handle-target" aria-label={`从${sideLabel[side]}侧接收连线`} />
      ))}
      {handles.map(({ side, position }) => (
        <Handle key={`source-${side}`} id={`source-${side}`} type="source" position={position} className="inspiration-handle inspiration-handle-source" aria-label={`从${sideLabel[side]}侧发起连线`} />
      ))}
    </>
  );
}

export function StorylineNode({ id, data, selected }: NodeProps) {
  const title = typeof data.title === "string" ? data.title : "";
  const description = typeof data.description === "string" ? data.description : "";
  const onChange = data.onChange as StoryNodeChange | undefined;

  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftDesc, setDraftDesc] = useState(description);
  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraftTitle(title);
      setDraftDesc(description);
    }
  }, [title, description, editing]);

  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const nextTitle = draftTitle.trim();
    const nextDesc = draftDesc.trim();
    if (nextTitle !== title || nextDesc !== description) {
      onChange?.(id, { title: nextTitle, description: nextDesc });
    }
  };

  return (
    <div
      className={`w-56 border bg-white p-3 shadow-sm transition-colors ${selected ? "border-teal-600 ring-2 ring-teal-200" : "border-zinc-300"}`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (onChange) setEditing(true);
      }}
    >
      <NodeHandles />
      {editing ? (
        <div className="nodrag flex flex-col gap-2">
          <input
            ref={titleRef}
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") setEditing(false);
            }}
            placeholder="情节标题"
            maxLength={255}
            className="w-full border border-zinc-300 px-2 py-1 text-sm font-semibold text-zinc-900 focus:border-teal-500 focus:outline-none"
          />
          <textarea
            value={draftDesc}
            onChange={(event) => setDraftDesc(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setEditing(false);
            }}
            placeholder="简介（这里发生了什么…）"
            rows={3}
            className="w-full resize-none border border-zinc-300 px-2 py-1 text-xs leading-5 text-zinc-600 focus:border-teal-500 focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100" onClick={() => setEditing(false)}>取消</button>
            <button type="button" className="border border-teal-500 bg-teal-50 px-2 py-0.5 text-xs text-teal-800 hover:bg-teal-100" onClick={commit}>完成</button>
          </div>
        </div>
      ) : (
        <>
          <p className="break-words text-sm font-semibold text-zinc-900">{title || "新情节"}</p>
          {description ? (
            <p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-zinc-600">{description}</p>
          ) : (
            <p className="mt-1.5 text-xs italic text-zinc-400">双击编辑简介</p>
          )}
        </>
      )}
    </div>
  );
}
