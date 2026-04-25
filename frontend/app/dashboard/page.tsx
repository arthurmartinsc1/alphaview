"use client";

import { useEffect, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { api, PortfolioPositions, MetricsResponse, PerformanceComparison, Range } from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { RangeSelector } from "@/components/RangeSelector";
import { fmtCurrency, fmtPct, orDash } from "@/lib/utils";

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(222 47% 8%)",
  border: "1px solid hsl(222 47% 14%)",
  borderRadius: "6px",
  fontSize: "12px",
};

export default function DashboardPage() {
  const [positions, setPositions] = useState<PortfolioPositions | null>(null);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [performance, setPerformance] = useState<PerformanceComparison[]>([]);
  const [range, setRange] = useState<Range>("1m");
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    Promise.all([
      api.getPositions(),
      api.getMetrics("1m"),
      api.getPerformance("1m"),
    ])
      .then(([pos, met, perf]) => {
        setPositions(pos);
        setMetrics(met);
        setPerformance(perf);
      })
      .catch(console.error)
      .finally(() => {
        setLoading(false);
        initialized.current = true;
      });
  }, []);

  const handleRange = (r: Range) => {
    setRange(r);
    if (!initialized.current) return;
    setChartLoading(true);
    Promise.all([api.getMetrics(r), api.getPerformance(r)])
      .then(([met, perf]) => {
        setMetrics(met);
        setPerformance(perf);
      })
      .catch(console.error)
      .finally(() => setChartLoading(false));
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  const pnl = positions?.totalPnl ?? 0;
  const pnlPct = positions?.totalPnlPercent ?? 0;
  const alpha = metrics?.alpha ?? null;

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Valor total"
          value={fmtCurrency(positions?.totalPortfolioValue ?? 0)}
        />
        <StatCard
          label="P&L total"
          value={fmtCurrency(pnl)}
          sub={fmtPct(pnlPct)}
          trend={pnl >= 0 ? "up" : "down"}
        />
        <StatCard
          label="P&L %"
          value={fmtPct(pnlPct)}
          trend={pnlPct >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Alpha vs IBOV"
          value={orDash(alpha, (v) => fmtPct(v))}
          sub={range.toUpperCase()}
          trend={alpha === null ? "neutral" : alpha >= 0 ? "up" : "down"}
        />
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-sm font-medium">Retorno acumulado</p>
            <p className="text-xs text-muted-foreground mt-0.5">Carteira vs IBOV</p>
          </div>
          <RangeSelector value={range} onChange={handleRange} disabled={chartLoading} />
        </div>

        <div className="px-5 py-4">
          {performance.length === 0 ? (
            <div className="flex h-52 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {chartLoading ? "Carregando..." : "Sem dados para o período"}
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={performance} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(222 47% 14%)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "hsl(215 20% 52%)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => v.slice(5)}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(215 20% 52%)" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
                  }
                  width={52}
                />
                <ReferenceLine
                  y={0}
                  stroke="hsl(222 47% 20%)"
                  strokeDasharray="4 4"
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "hsl(213 31% 91%)", marginBottom: 4 }}
                  formatter={(value: number, name: string) => [
                    `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`,
                    name === "portfolioReturn" ? "Carteira" : "IBOV",
                  ]}
                />
                <Legend
                  formatter={(v) => (v === "portfolioReturn" ? "Carteira" : "IBOV")}
                  wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                />
                <Line
                  type="monotone"
                  dataKey="portfolioReturn"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="ibovReturn"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  dot={false}
                  strokeDasharray="5 3"
                  activeDot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {positions && positions.positions.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-sm font-medium">Posições</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 text-left text-xs text-muted-foreground font-medium">
                  Ticker
                </th>
                <th className="px-5 py-2.5 text-right text-xs text-muted-foreground font-medium">
                  Qtd
                </th>
                <th className="px-5 py-2.5 text-right text-xs text-muted-foreground font-medium">
                  Preço médio
                </th>
                <th className="px-5 py-2.5 text-right text-xs text-muted-foreground font-medium">
                  Atual
                </th>
                <th className="px-5 py-2.5 text-right text-xs text-muted-foreground font-medium">
                  P&L %
                </th>
              </tr>
            </thead>
            <tbody>
              {positions.positions.slice(0, 6).map((pos) => (
                <tr
                  key={pos.ticker}
                  className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors"
                >
                  <td className="px-5 py-2.5 font-medium text-xs">{pos.ticker}</td>
                  <td className="px-5 py-2.5 text-right text-xs text-muted-foreground">
                    {pos.quantity}
                  </td>
                  <td className="px-5 py-2.5 text-right text-xs">
                    {fmtCurrency(pos.avgPrice)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-xs">
                    {pos.currentPrice ? fmtCurrency(pos.currentPrice) : "—"}
                  </td>
                  <td
                    className={`px-5 py-2.5 text-right text-xs font-medium ${
                      (pos.pnlPercent ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {pos.pnlPercent !== null ? fmtPct(pos.pnlPercent) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
