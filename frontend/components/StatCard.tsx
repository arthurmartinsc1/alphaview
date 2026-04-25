import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  className?: string;
}

export function StatCard({ label, value, sub, trend, className }: StatCardProps) {
  return (
    <div className={cn("rounded-lg border border-border bg-card px-5 py-4", className)}>
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <p className="text-xl font-semibold tracking-tight">{value}</p>
      {sub && (
        <p
          className={cn(
            "mt-1 text-xs font-medium",
            trend === "up" && "text-emerald-400",
            trend === "down" && "text-red-400",
            trend === "neutral" && "text-muted-foreground",
            !trend && "text-muted-foreground"
          )}
        >
          {sub}
        </p>
      )}
    </div>
  );
}
