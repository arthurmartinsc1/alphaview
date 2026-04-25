import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPct(value: number, alwaysSign = true): string {
  const sign = alwaysSign && value >= 0 ? "+" : "";
  return `${sign}${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function fmtDecimal(value: number, decimals = 2): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Metrics from backend: volatility and maxDrawdown are fractions (0.22 = 22%)
export function fmtRate(value: number): string {
  return fmtPct(value * 100);
}

export function orDash<T>(
  value: T | null | undefined,
  format: (v: T) => string
): string {
  return value !== null && value !== undefined ? format(value) : "—";
}
