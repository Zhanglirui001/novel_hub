"use client";

import { useState } from "react";
import { Expand, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { DOCK_TABS, type DockTab } from "./dock-tabs";
import { useWorkspace } from "./workspace-context";

export function AssistantDock() {
  const { dockTab, setDockTab, setFullscreenTab } = useWorkspace();
  const core = DOCK_TABS.filter((t) => t.group !== "more");
  const more = DOCK_TABS.filter((t) => t.group === "more");

  return (
    <Tabs value={dockTab} onValueChange={setDockTab} className="flex h-full flex-col">
      <div className="flex items-start gap-1.5 border-b p-3">
        <TabsList className="grid h-auto flex-1 grid-cols-4">
          {core.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex-col gap-0.5 px-1 py-1.5 text-[0.7rem]"
            >
              <Icon className="h-4 w-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <MoreMenu items={more} current={dockTab} onPick={setDockTab} />
        <Button
          variant="ghost"
          size="icon"
          className="mt-0.5 h-8 w-8 shrink-0"
          onClick={() => setFullscreenTab(dockTab)}
          aria-label="全屏展开当前面板"
          title="全屏展开当前面板"
        >
          <Expand className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 soft-scroll">
        <div className="p-4">
          {DOCK_TABS.map(({ value, Panel }) => (
            <TabsContent key={value} value={value} className="mt-0">
              <Panel />
            </TabsContent>
          ))}
        </div>
      </ScrollArea>
    </Tabs>
  );
}

function MoreMenu({
  items,
  current,
  onPick,
}: {
  items: DockTab[];
  current: string;
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  const active = items.some((t) => t.value === current);

  return (
    <div className="relative mt-0.5 shrink-0">
      <Button
        variant={active ? "secondary" : "ghost"}
        size="sm"
        className="h-8 gap-1 px-2 text-[0.7rem]"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal className="h-4 w-4" />
        更多
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-28 rounded-lg border bg-popover p-1 shadow-md">
            {items.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  onPick(value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs transition hover:bg-muted",
                  current === value && "bg-muted font-medium",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
