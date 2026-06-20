"use client";

import { FileText, Layers, PenLine, ScrollText, ShieldCheck, Clock, MessageSquare } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConsistencyPanel } from "./consistency-panel";
import { GenerationPanel } from "./generation-panel";
import { InlineRevisePanel } from "./inline-revise-panel";
import { LorePanel } from "./lore-panel";
import { PatchReview } from "./patch-review";
import { StylePanel } from "./style-panel";
import { TimelinePanel } from "./timeline-panel";
import { useWorkspace } from "./workspace-context";

const tabs = [
  { value: "create", label: "创作", icon: PenLine, Panel: GenerationPanel },
  { value: "revise", label: "批注", icon: MessageSquare, Panel: InlineRevisePanel },
  { value: "consistency", label: "一致性", icon: ShieldCheck, Panel: ConsistencyPanel },
  { value: "patch", label: "修改", icon: Layers, Panel: PatchReview },
  { value: "lore", label: "设定", icon: ScrollText, Panel: LorePanel },
  { value: "style", label: "文风", icon: FileText, Panel: StylePanel },
  { value: "timeline", label: "时间线", icon: Clock, Panel: TimelinePanel },
];

export function AssistantDock() {
  const { dockTab, setDockTab } = useWorkspace();

  return (
    <Tabs
      value={dockTab}
      onValueChange={setDockTab}
      className="flex h-full flex-col"
    >
      <div className="border-b p-3">
        <TabsList className="grid w-full grid-cols-7">
          {tabs.map(({ value, label, icon: Icon }) => (
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
      </div>

      <ScrollArea className="flex-1 soft-scroll">
        <div className="p-4">
          {tabs.map(({ value, Panel }) => (
            <TabsContent key={value} value={value} className="mt-0">
              <Panel />
            </TabsContent>
          ))}
        </div>
      </ScrollArea>
    </Tabs>
  );
}
