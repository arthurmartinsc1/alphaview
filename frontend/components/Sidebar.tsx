"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Briefcase, BarChart2 } from "lucide-react";
import { cn, fmtCurrency } from "@/lib/utils";
import { api } from "@/lib/api";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/positions", label: "Posições", icon: Briefcase },
  { href: "/analytics", label: "Análise", icon: BarChart2 },
];

export function Sidebar() {
  const pathname = usePathname();
  const [totalValue, setTotalValue] = useState<number | null>(null);

  useEffect(() => {
    api
      .getPositions()
      .then((d) => setTotalValue(d.totalPortfolioValue))
      .catch(() => setTotalValue(null));
  }, [pathname]);

  return (
    <aside className="w-52 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-2 mb-5">
          <div className="h-6 w-6 rounded bg-primary/15 flex items-center justify-center">
            <BarChart2 className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="font-semibold text-sm">Alphaview</span>
        </div>
        <p className="text-[11px] text-muted-foreground mb-1">Patrimônio</p>
        <p className="text-sm font-semibold">
          {totalValue === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            fmtCurrency(totalValue)
          )}
        </p>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded px-3 py-2 text-sm transition-colors",
              pathname === href || pathname.startsWith(href + "/")
                ? "bg-accent text-foreground font-medium"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
