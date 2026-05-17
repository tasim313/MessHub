import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  tone?: "default" | "primary" | "warning" | "danger";
}) {
  const toneClasses = {
    default: "bg-secondary text-secondary-foreground",
    primary: "bg-primary/10 text-primary",
    warning: "bg-chart-3/15 text-chart-3",
    danger: "bg-destructive/10 text-destructive",
  }[tone];
  return (
    <Card className="p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
          <p className="text-2xl font-bold tabular-nums">{value}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", toneClasses)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}