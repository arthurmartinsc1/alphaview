"use client";

import { useEffect, useRef, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Legend,
} from "recharts";
import {
  api,
  MetricsResponse,
  ExposureItem,
  PerformanceComparison,
  Range,
} from "@/lib/api";
import { StatCard } from "@/components/StatCard";
import { RangeSelector } from "@/components/RangeSelector";
import { fmtPct, fmtCurrency, fmtDecimal, fmtRate, orDash } from "@/lib/utils";

const PIE_COLORS = [
  "#6366f1",
  "#22d3ee",
  "#f59e0b",
  "#10b981",
  "#f43f5e",
  "#a78bfa",
  "#fb923c",
  "#34d399",
  "#e879f9",
  "#38bdf8",
];

const TOOLTIP_STYLE = {
  backgroundColor: "hsl(222 47% 8%)",
  border: "1px solid hsl(222 47% 14%)",
  borderRadius: "6px",
  fontSize: "12px",
};

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [exposure, setExposure] = useState<ExposureItem[]>([]);
  const [performance, setPerformance] = useState<PerformanceComparison[]>([]);
  const [range, setRange] = useState<Range>("1m");
  const [loading, setLoading] = useState(true);
  const [rangeLoading, setRangeLoading] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    Promise.all([
      api.getMetrics("1m"),
      api.getExposure(),
      api.getPerformance("1m"),
    ])
      .then(([met, exp, perf]) => {
        setMetrics(met);
        setExposure(exp);
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
    setRangeLoading(true);
    Promise.all([api.getMetrics(r), api.getPerformance(r)])
      .then(([met, perf]) => {
        setMetrics(met);
        setPerformance(perf);
      })
      .catch(console.error)
      .finally(() => setRangeLoading(false));
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Análise</h1>
        <RangeSelector value={range} onChange={handleRange} disabled={rangeLoading} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Retorno total"
          value={orDash(metrics?.totalReturn ?? null, (v) => fmtPct(v))}
          sub={range.toUpperCase()}
          trend={
            metrics?.totalReturn === null
              ? "neutral"
              : (metrics!.totalReturn ?? 0) >= 0
              ? "up"
              : "down"
          }
        />
        <StatCard
          label="Max Drawdown"
          value={orDash(metrics?.maxDrawdown ?? null, (v) => fmtRate(v))}
          sub={range.toUpperCase()}
          trend={
            metrics?.maxDrawdown === null
              ? "neutral"
              : metrics!.maxDrawdown < -0.1
              ? "down"
              : "neutral"
          }
        />
        <StatCard
          label="Volatilidade a.a."
          value={orDash(metrics?.volatility ?? null, (v) => fmtRate(v))}
          sub={range.toUpperCase()}
          trend="neutral"
        />
        <StatCard
          label="VaR 1 dia (95%)"
          value={orDash(metrics?.var95 ?? null, (v) => fmtRate(v))}
          sub={range.toUpperCase()}
          trend={
            metrics?.var95 === null
              ? "neutral"
              : metrics!.var95! > 0.03
              ? "down"
              : "neutral"
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Alpha de Jensen"
          value={orDash(metrics?.alpha ?? null, (v) => fmtPct(v))}
          sub="α = Rp − [Rf + β(Rm−Rf)]"
          trend={
            metrics?.alpha === null
              ? "neutral"
              : (metrics!.alpha ?? 0) >= 0
              ? "up"
              : "down"
          }
        />
        <StatCard
          label="Beta vs IBOV"
          value={orDash(metrics?.beta ?? null, (v) => fmtDecimal(v, 2))}
          sub={range.toUpperCase()}
          trend="neutral"
        />
        <StatCard
          label="Índice Sharpe"
          value={orDash(metrics?.sharpe ?? null, (v) => fmtDecimal(v, 2))}
          sub={range.toUpperCase()}
          trend="neutral"
        />
        <StatCard
          label="Índice Sortino"
          value={orDash(metrics?.sortino ?? null, (v) => fmtDecimal(v, 2))}
          sub="Penaliza só downside"
          trend="neutral"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Tracking Error a.a."
          value={orDash(metrics?.trackingError ?? null, (v) => fmtRate(v))}
          sub="vs IBOV"
          trend="neutral"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-medium">Exposição por setor</p>
          </div>
          <div className="px-5 py-4">
            {exposure.length === 0 ? (
              <div className="flex h-52 items-center justify-center">
                <p className="text-sm text-muted-foreground">Sem dados</p>
              </div>
            ) : (
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width={200} height={200}>
                  <PieChart>
                    <Pie
                      data={exposure}
                      dataKey="totalValue"
                      nameKey="sector"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {exposure.map((_, i) => (
                        <Cell
                          key={i}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number) => [fmtCurrency(v), "Valor"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2 min-w-0">
                  {exposure.map((item, i) => (
                    <div key={item.sector} className="flex items-center gap-2">
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="text-xs text-muted-foreground truncate flex-1">
                        {item.sector}
                      </span>
                      <span className="text-xs font-medium tabular-nums">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="px-5 py-4 border-b border-border">
            <p className="text-sm font-medium">Retorno acumulado</p>
            <p className="text-xs text-muted-foreground mt-0.5">Carteira vs IBOV</p>
          </div>
          <div className="px-5 py-4">
            {performance.length === 0 ? (
              <div className="flex h-52 items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  {rangeLoading ? "Carregando..." : "Sem dados para o período"}
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={performance}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(222 47% 14%)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(215 20% 52%)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => v.slice(5)}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(215 20% 52%)" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`
                    }
                    width={50}
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
                    formatter={(v) =>
                      v === "portfolioReturn" ? "Carteira" : "IBOV"
                    }
                    wrapperStyle={{ fontSize: 10, paddingTop: 10 }}
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
      </div>

      {exposure.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-sm font-medium">Detalhamento por setor</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 py-2.5 text-left text-xs text-muted-foreground font-medium">
                  Setor
                </th>
                <th className="px-5 py-2.5 text-right text-xs text-muted-foreground font-medium">
                  Valor
                </th>
                <th className="px-5 py-2.5 text-right text-xs text-muted-foreground font-medium">
                  Participação
                </th>
              </tr>
            </thead>
            <tbody>
              {[...exposure]
                .sort((a, b) => b.totalValue - a.totalValue)
                .map((item, i) => (
                  <tr
                    key={item.sector}
                    className="border-b border-border last:border-0 hover:bg-accent/20 transition-colors"
                  >
                    <td className="px-5 py-2.5 text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{
                            background: PIE_COLORS[i % PIE_COLORS.length],
                          }}
                        />
                        {item.sector}
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-right text-xs">
                      {fmtCurrency(item.totalValue)}
                    </td>
                    <td className="px-5 py-2.5 text-right text-xs font-medium">
                      {item.percentage.toFixed(1)}%
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
