import axios from "axios";

// In production / behind ngrok we route every API call through the Next.js
// rewrite at `/api/*` so that the browser only needs to reach the frontend
// origin. Set NEXT_PUBLIC_API_URL only when you want to bypass the proxy
// (e.g. local dev hitting the backend on a different host).
const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "/api",
  headers: { "Content-Type": "application/json" },
});

export type Range = "1m" | "3m" | "6m" | "1y";

// ── Transactions & positions ──────────────────────────────────────────────────

export interface Transaction {
  id: string;
  ticker: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  date: string;
  sector: string;
}

export interface TransactionCreate {
  ticker: string;
  type: "BUY" | "SELL";
  quantity: number;
  price: number;
  date: string;
  sector: string;
}

export interface PositionDetail {
  ticker: string;
  sector: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number | null;
  pnl: number | null;
  pnlPercent: number | null;
  totalValue: number | null;
}

export interface PortfolioPositions {
  positions: PositionDetail[];
  totalPortfolioValue: number;
  totalPnl: number;
  totalPnlPercent: number;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface MetricsResponse {
  sharpe: number | null;
  sortino: number | null;
  maxDrawdown: number | null;
  volatility: number | null;
  totalReturn: number | null;
  alpha: number | null;
  beta: number | null;
  var95: number | null;
  trackingError: number | null;
}

export interface ExposureItem {
  sector: string;
  percentage: number;
  totalValue: number;
}

export interface PerformanceComparison {
  date: string;
  portfolioReturn: number;
  ibovReturn: number;
  alpha: number;
}

// ── Market ────────────────────────────────────────────────────────────────────

export interface QuoteResponse {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
}

// ── API client ────────────────────────────────────────────────────────────────

export const api = {
  // Transactions
  getTransactions: (ticker?: string) =>
    client
      .get<Transaction[]>("/portfolio/transactions", {
        params: ticker ? { ticker } : undefined,
      })
      .then((r) => r.data),

  createTransaction: (data: TransactionCreate) =>
    client.post<Transaction>("/portfolio/transaction", data).then((r) => r.data),

  deleteTransaction: (id: string) =>
    client.delete(`/portfolio/transaction/${id}`),

  // Positions
  getPositions: () =>
    client.get<PortfolioPositions>("/portfolio/positions").then((r) => r.data),

  // Analytics
  getMetrics: (range: Range = "1m") =>
    client
      .get<MetricsResponse>("/analytics/metrics", { params: { range } })
      .then((r) => r.data),

  getExposure: () =>
    client.get<ExposureItem[]>("/analytics/exposure").then((r) => r.data),

  getPerformance: (range: Range = "1m") =>
    client
      .get<PerformanceComparison[]>("/analytics/performance", { params: { range } })
      .then((r) => r.data),

  // Market
  getQuote: (ticker: string) =>
    client.get<QuoteResponse>(`/market/quote/${ticker}`).then((r) => r.data),
};
