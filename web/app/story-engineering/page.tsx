import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { WorkflowHub } from "@/components/dashboard/workflow-hub";

export default function StoryEngineeringPage() {
  return <div className="flex min-h-full bg-background"><AppSidebar /><WorkflowHub mode="story" /></div>;
}
