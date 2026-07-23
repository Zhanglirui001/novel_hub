"use client";

import { Expand } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DOCK_TABS } from "./dock-tabs";
import { useWorkspace } from "./workspace-context";

export function AssistantDock() {
  const { dockTab, setDockTab, setFullscreenTab } = useWorkspace();

  return (
    <Tabs
      value={dockTab}
      onValueChange={setDockTab}
      className="flex h-full flex-col"
    >
      <div className="flex items-start gap-2 border-b p-3">
        <TabsList className="grid h-auto flex-1 grid-cols-4">
          {DOCK_TABS.map(({ value, label, icon: Icon }) => (
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
