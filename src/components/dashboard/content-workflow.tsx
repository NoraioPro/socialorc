import { CalendarDays, CheckCircle2, FileEdit, Send, Sparkles } from "lucide-react";

const steps = [
  { name: "Draft", detail: "Shape your message", Icon: FileEdit },
  { name: "Generate", detail: "Adapt for each channel", Icon: Sparkles },
  { name: "Approve", detail: "Give the final sign-off", Icon: CheckCircle2 },
  { name: "Schedule", detail: "Choose your moment", Icon: CalendarDays },
  { name: "Publish", detail: "Reach your audience", Icon: Send },
];
export function ContentWorkflow({ active }: { active: "Generate" | "Approve" }) {
  return <ol className="content-workflow" aria-label="Content workflow">{steps.map(({name, detail, Icon}) => <li key={name} aria-current={name === active ? "step" : undefined}><span className="workflow-step-icon"><Icon size={17} /></span><span><strong>{name}</strong><small>{detail}</small></span><span className="workflow-arrow" aria-hidden="true">→</span></li>)}</ol>;
}
