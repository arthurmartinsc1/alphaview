"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  api,
  PortfolioPositions,
  QuoteResponse,
  Transaction,
  TransactionCreate,
} from "@/lib/api";
import { fmtCurrency, fmtPct, cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

const SECTORS = [
  "Energia",
  "Financeiro",
  "Mineração",
  "Industrial",
  "Varejo",
  "Tecnologia",
  "Saúde",
  "Utilities",
  "Outro",
];

const EMPTY: TransactionCreate = {
  ticker: "",
  type: "BUY",
  quantity: 1,
  price: 0,
  date: new Date().toISOString().slice(0, 10),
  sector: "Tecnologia",
};

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; quote: QuoteResponse }
  | { status: "not_found" };

export default function PositionsPage() {
  const [data, setData] = useState<PortfolioPositions | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TransactionCreate>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });

  const [expanded, setExpanded] = useState<string | null>(null);
  const [txCache, setTxCache] = useState<Record<string, Transaction[]>>({});
  const [txLoading, setTxLoading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = () =>
    api
      .getPositions()
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  // Live ticker lookup (debounced) ────────────────────────────────────────────
  useEffect(() => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    const ticker = form.ticker.trim().toUpperCase();
    if (ticker.length < 4) {
      setLookup({ status: "idle" });
      return;
    }
    setLookup({ status: "loading" });
    lookupTimer.current = setTimeout(async () => {
      try {
        const quote = await api.getQuote(ticker);
        setLookup({ status: "found", quote });
        // Auto-fill price if user hasn't typed one yet.
        setForm((prev) =>
          prev.ticker.toUpperCase() === ticker && !prev.price
            ? { ...prev, price: quote.price }
            : prev
        );
      } catch {
        setLookup({ status: "not_found" });
      }
    }, 500);
    return () => {
      if (lookupTimer.current) clearTimeout(lookupTimer.current);
    };
  }, [form.ticker]);

  const openModal = () => {
    setForm(EMPTY);
    setError("");
    setLookup({ status: "idle" });
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.createTransaction({
        ...form,
        ticker: form.ticker.toUpperCase(),
        date: new Date(form.date + "T12:00:00").toISOString(),
      });
      setOpen(false);
      setLoading(true);
      setTxCache({});
      setExpanded(null);
      load();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Erro ao salvar transação";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const toggleExpand = async (ticker: string) => {
    if (expanded === ticker) {
      setExpanded(null);
      return;
    }
    setExpanded(ticker);
    if (!txCache[ticker]) {
      setTxLoading(ticker);
      try {
        const txs = await api.getTransactions(ticker);
        setTxCache((prev) => ({ ...prev, [ticker]: txs }));
      } catch (err) {
        console.error(err);
      } finally {
        setTxLoading(null);
      }
    }
  };

  const handleDelete = async (tx: Transaction) => {
    const label = `${tx.type === "BUY" ? "compra" : "venda"} de ${tx.quantity} ${
      tx.ticker
    } a ${fmtCurrency(tx.price)}`;
    if (!confirm(`Excluir esta ${label}?`)) return;
    setDeleting(tx.id);
    try {
      await api.deleteTransaction(tx.id);
      setTxCache((prev) => ({
        ...prev,
        [tx.ticker]: (prev[tx.ticker] ?? []).filter((t) => t.id !== tx.id),
      }));
      load();
    } catch (err) {
      console.error(err);
      alert("Falha ao excluir transação.");
    } finally {
      setDeleting(null);
    }
  };

  const positions = data?.positions ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Posições</h1>
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova Transação
        </button>
      </div>

      {data && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-border bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground mb-2">Valor total</p>
            <p className="text-lg font-semibold">
              {fmtCurrency(data.totalPortfolioValue)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground mb-2">P&L total</p>
            <p
              className={cn(
                "text-lg font-semibold",
                data.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              {fmtCurrency(data.totalPnl)}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground mb-2">P&L %</p>
            <p
              className={cn(
                "text-lg font-semibold",
                data.totalPnlPercent >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              {fmtPct(data.totalPnlPercent)}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Carregando...
          </p>
        ) : positions.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Sem posições abertas. Adicione uma transação para começar.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-8" />
                {[
                  ["Ticker", "left"],
                  ["Setor", "left"],
                  ["Qtd", "right"],
                  ["Preço médio", "right"],
                  ["Preço atual", "right"],
                  ["P&L (R$)", "right"],
                  ["P&L (%)", "right"],
                  ["Valor total", "right"],
                ].map(([col, align]) => (
                  <th
                    key={col}
                    className={`px-4 py-3 text-xs text-muted-foreground font-medium text-${align}`}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => {
                const pnlPositive = (pos.pnl ?? 0) >= 0;
                const isExpanded = expanded === pos.ticker;
                const txs = txCache[pos.ticker] ?? [];
                return (
                  <Fragment key={pos.ticker}>
                    <tr
                      onClick={() => toggleExpand(pos.ticker)}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors cursor-pointer",
                        isExpanded ? "bg-accent/30" : "hover:bg-accent/20"
                      )}
                    >
                      <td className="px-2 py-3 text-muted-foreground">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </td>
                      <td className="px-4 py-3 font-semibold text-xs">
                        {pos.ticker}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {pos.sector}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {pos.quantity}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {fmtCurrency(pos.avgPrice)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {pos.currentPrice ? fmtCurrency(pos.currentPrice) : "—"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right text-xs font-medium ${
                          pnlPositive ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {pos.pnl !== null ? fmtCurrency(pos.pnl) : "—"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right text-xs font-medium ${
                          pnlPositive ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {pos.pnlPercent !== null ? fmtPct(pos.pnlPercent) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-xs">
                        {pos.totalValue ? fmtCurrency(pos.totalValue) : "—"}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-background/40">
                        <td />
                        <td colSpan={8} className="px-4 py-3">
                          {txLoading === pos.ticker ? (
                            <p className="text-xs text-muted-foreground">
                              Carregando transações...
                            </p>
                          ) : txs.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Nenhuma transação encontrada.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                                Histórico de transações
                              </p>
                              {txs.map((tx) => (
                                <div
                                  key={tx.id}
                                  className="flex items-center gap-3 rounded border border-border/60 bg-card px-3 py-2 text-xs"
                                >
                                  <span
                                    className={cn(
                                      "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                      tx.type === "BUY"
                                        ? "bg-emerald-500/20 text-emerald-400"
                                        : "bg-red-500/20 text-red-400"
                                    )}
                                  >
                                    {tx.type === "BUY" ? "COMPRA" : "VENDA"}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {new Date(tx.date).toLocaleDateString("pt-BR")}
                                  </span>
                                  <span className="tabular-nums">
                                    {tx.quantity} × {fmtCurrency(tx.price)}
                                  </span>
                                  <span className="ml-auto tabular-nums text-muted-foreground">
                                    {fmtCurrency(tx.quantity * tx.price)}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDelete(tx);
                                    }}
                                    disabled={deleting === tx.id}
                                    className="rounded p-1 text-muted-foreground hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-40"
                                    title="Excluir transação"
                                  >
                                    {deleting === tx.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-lg border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <p className="text-sm font-semibold">Nova Transação</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Registre uma compra ou venda de ações
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 rounded px-3 py-2">
                  {error}
                </p>
              )}

              {/* 1. Operação ─────────────────────────────────────── */}
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                  1. Operação
                </label>
                <div className="grid grid-cols-2 gap-0 rounded border border-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, type: "BUY" })}
                    className={cn(
                      "py-2.5 text-xs font-medium transition-colors",
                      form.type === "BUY"
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    Compra
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, type: "SELL" })}
                    className={cn(
                      "py-2.5 text-xs font-medium border-l border-border transition-colors",
                      form.type === "SELL"
                        ? "bg-red-500/20 text-red-400"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    Venda
                  </button>
                </div>
              </div>

              {/* 2. Ticker ───────────────────────────────────────── */}
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                  2. Qual ação?
                </label>
                <input
                  required
                  value={form.ticker}
                  onChange={(e) =>
                    setForm({ ...form, ticker: e.target.value.toUpperCase() })
                  }
                  placeholder="Ex: PETR4"
                  className="w-full rounded border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="mt-1.5 min-h-[18px] text-[11px]">
                  {lookup.status === "idle" && form.ticker.length === 0 && (
                    <span className="text-muted-foreground">
                      Digite o código da ação na B3
                    </span>
                  )}
                  {lookup.status === "loading" && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Verificando cotação...
                    </span>
                  )}
                  {lookup.status === "found" && (
                    <span className="flex items-center gap-1 text-emerald-400">
                      <Check className="h-3 w-3" />
                      Cotação atual: {fmtCurrency(lookup.quote.price)}
                      <span className="text-muted-foreground">
                        ({fmtPct(lookup.quote.changePercent)} hoje)
                      </span>
                    </span>
                  )}
                  {lookup.status === "not_found" && (
                    <span className="flex items-center gap-1 text-red-400">
                      <X className="h-3 w-3" />
                      Ticker não encontrado na B3
                    </span>
                  )}
                </div>
              </div>

              {/* 3. Quantidade × Preço unitário ──────────────────── */}
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                  3. Quanto e por qual preço?
                </label>
                <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">
                      Quantidade
                    </p>
                    <input
                      required
                      type="number"
                      min={1}
                      value={form.quantity}
                      onChange={(e) =>
                        setForm({ ...form, quantity: Number(e.target.value) })
                      }
                      className="w-full rounded border border-border bg-background px-3 py-2.5 text-sm text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1 text-center">
                      ações
                    </p>
                  </div>
                  <span className="pb-[34px] text-muted-foreground">×</span>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">
                      Preço por ação
                    </p>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={form.price || ""}
                      onChange={(e) =>
                        setForm({ ...form, price: Number(e.target.value) })
                      }
                      placeholder="0,00"
                      className="w-full rounded border border-border bg-background px-3 py-2.5 text-sm text-center tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <div className="mt-1 text-[10px] text-center min-h-[14px]">
                      {lookup.status === "found" &&
                      form.price !== lookup.quote.price ? (
                        <button
                          type="button"
                          onClick={() =>
                            setForm({ ...form, price: lookup.quote.price })
                          }
                          className="text-emerald-400 hover:underline"
                        >
                          usar cotação atual ({fmtCurrency(lookup.quote.price)})
                        </button>
                      ) : (
                        <span className="text-muted-foreground">
                          R$ por unidade
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Total derivado ─────────────────────────────────── */}
              <div
                className={cn(
                  "flex items-center justify-between rounded-md border px-4 py-3 transition-colors",
                  form.type === "BUY"
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-red-500/30 bg-red-500/5"
                )}
              >
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {form.type === "BUY" ? "Você vai pagar" : "Você vai receber"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {form.quantity} × {fmtCurrency(form.price || 0)}
                  </p>
                </div>
                <span
                  className={cn(
                    "text-base font-semibold tabular-nums",
                    form.type === "BUY" ? "text-emerald-400" : "text-red-400"
                  )}
                >
                  {fmtCurrency(form.quantity * form.price)}
                </span>
              </div>

              {/* 4. Metadados ───────────────────────────────────── */}
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                  4. Detalhes
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">
                      Data da operação
                    </p>
                    <input
                      required
                      type="date"
                      value={form.date}
                      onChange={(e) =>
                        setForm({ ...form, date: e.target.value })
                      }
                      className="w-full rounded border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">
                      Setor
                    </p>
                    <select
                      value={form.sector}
                      onChange={(e) =>
                        setForm({ ...form, sector: e.target.value })
                      }
                      className="w-full rounded border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      {SECTORS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="flex-1 rounded border border-border py-2.5 text-xs hover:bg-accent transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || lookup.status === "loading"}
                  className={cn(
                    "flex-1 rounded py-2.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity",
                    form.type === "BUY" ? "bg-emerald-500" : "bg-red-500"
                  )}
                >
                  {saving
                    ? "Salvando..."
                    : form.type === "BUY"
                    ? "Confirmar compra"
                    : "Confirmar venda"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
