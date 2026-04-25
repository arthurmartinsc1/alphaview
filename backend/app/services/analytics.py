import asyncio
import math
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Optional

from app.models.schemas import (
    AnalyticsSummary,
    PerformancePoint,
    PortfolioSummary,
    PositionSummary,
    SectorAllocation,
)
from app.services.brapi import get_historical, get_quotes


def compute_sharpe(daily_returns: list[float], risk_free_annual: float = 0.1475) -> float:
    n = len(daily_returns)
    if n < 2:
        return 0.0
    mean = sum(daily_returns) / n
    variance = sum((r - mean) ** 2 for r in daily_returns) / (n - 1)
    std = math.sqrt(variance)
    if std == 0.0:
        return 0.0
    return round((mean * 252 - risk_free_annual) / (std * math.sqrt(252)), 4)


def compute_sortino(daily_returns: list[float], risk_free_annual: float = 0.1475) -> float:
    n = len(daily_returns)
    if n < 2:
        return 0.0
    mean = sum(daily_returns) / n
    mar_daily = risk_free_annual / 252
    downside_sq = [min(r - mar_daily, 0.0) ** 2 for r in daily_returns]
    downside_std = math.sqrt(sum(downside_sq) / n)
    if downside_std == 0.0:
        return 0.0
    return round((mean * 252 - risk_free_annual) / (downside_std * math.sqrt(252)), 4)


def compute_max_drawdown(portfolio_values: list[float]) -> float:
    if len(portfolio_values) < 2:
        return 0.0
    peak = portfolio_values[0]
    max_dd = 0.0
    for v in portfolio_values:
        if v > peak:
            peak = v
        if peak > 0:
            dd = (v - peak) / peak
            if dd < max_dd:
                max_dd = dd
    return round(max_dd, 4)


def compute_volatility(daily_returns: list[float]) -> float:
    n = len(daily_returns)
    if n < 2:
        return 0.0
    mean = sum(daily_returns) / n
    variance = sum((r - mean) ** 2 for r in daily_returns) / (n - 1)
    return round(math.sqrt(variance) * math.sqrt(252), 4)


def compute_beta(portfolio_returns: list[float], benchmark_returns: list[float]) -> float:
    n = len(portfolio_returns)
    if n < 2 or len(benchmark_returns) != n:
        return 0.0
    mean_p = sum(portfolio_returns) / n
    mean_b = sum(benchmark_returns) / n
    cov = sum((p - mean_p) * (b - mean_b) for p, b in zip(portfolio_returns, benchmark_returns)) / (n - 1)
    var_b = sum((b - mean_b) ** 2 for b in benchmark_returns) / (n - 1)
    if var_b == 0.0:
        return 0.0
    return round(cov / var_b, 4)


def compute_var_historical(daily_returns: list[float], confidence: float = 0.95) -> float:
    """1-day historical VaR. Returns a positive fraction, e.g. 0.025 = 2.5% loss."""
    n = len(daily_returns)
    if n < 20:
        return 0.0
    sorted_ret = sorted(daily_returns)
    # floor avoids the floating-point overshoot that ceil produces (e.g. 5.000...4 → 6)
    idx = max(0, int(math.floor((1 - confidence) * n)) - 1)
    return round(-sorted_ret[idx], 4)


def compute_tracking_error(portfolio_returns: list[float], benchmark_returns: list[float]) -> float:
    n = len(portfolio_returns)
    if n < 2 or len(benchmark_returns) != n:
        return 0.0
    excess = [p - b for p, b in zip(portfolio_returns, benchmark_returns)]
    mean_ex = sum(excess) / n
    variance = sum((e - mean_ex) ** 2 for e in excess) / (n - 1)
    return round(math.sqrt(variance) * math.sqrt(252), 4)


def compute_jensens_alpha(
    mean_portfolio_daily: float,
    mean_benchmark_daily: float,
    beta: float,
    risk_free_annual: float = 0.1475,
) -> float:
    """α = Rp − [Rf + β(Rm − Rf)], annualised and expressed as a percentage."""
    rp = mean_portfolio_daily * 252
    rm = mean_benchmark_daily * 252
    return round((rp - (risk_free_annual + beta * (rm - risk_free_annual))) * 100, 4)


def compute_exposure_by_sector(positions: list[dict]) -> dict[str, float]:
    sector_totals: dict[str, float] = defaultdict(float)
    for p in positions:
        sector_totals[p["sector"]] += p.get("totalValue", 0.0)
    grand_total = sum(sector_totals.values()) or 1.0
    return {s: round(v / grand_total * 100, 2) for s, v in sector_totals.items()}


def compute_performance_vs_benchmark(
    portfolio_history: list[dict],
    ibov_history: list[dict],
) -> list[dict]:
    if not portfolio_history or not ibov_history:
        return []

    p_by_date = {p["date"]: p for p in portfolio_history}
    i_map = {p["date"]: p["close"] for p in ibov_history}

    common_dates = sorted(set(p_by_date) & set(i_map))
    if len(common_dates) < 2:
        return []

    i0 = i_map[common_dates[0]]
    if i0 == 0.0:
        return []

    portfolio_index: list[float] = [1.0]
    for prev, curr in zip(common_dates, common_dates[1:]):
        prev_v = p_by_date[prev]["value"]
        curr_v = p_by_date[curr]["value"]
        cf = p_by_date[curr].get("cashflow", 0.0)
        if prev_v <= 0:
            portfolio_index.append(portfolio_index[-1])
            continue
        r = (curr_v - cf - prev_v) / prev_v
        portfolio_index.append(portfolio_index[-1] * (1.0 + r))

    result = []
    for date, idx in zip(common_dates, portfolio_index):
        p_ret = (idx - 1.0) * 100
        i_ret = (i_map[date] / i0 - 1) * 100
        result.append({
            "date": date,
            "portfolioReturn": round(p_ret, 4),
            "ibovReturn": round(i_ret, 4),
            "alpha": round(p_ret - i_ret, 4),
        })
    return result


def build_portfolio_value_series(
    transactions: list[Any],
    price_history: dict[str, list[dict]],
) -> list[dict]:
    """
    Rebuilds daily portfolio market value from transactions + price history.
    Returns [{date, value, cashflow}] where cashflow is net capital moved that day
    (used downstream by TWR to strip out injection bias).
    """
    if not price_history:
        return []

    price_lookup: dict[str, dict[str, float]] = {
        ticker: {p["date"]: p["close"] for p in history}
        for ticker, history in price_history.items()
    }

    all_dates = sorted({p["date"] for history in price_history.values() for p in history})

    tx_idx = 0
    n_txs = len(transactions)
    holdings: dict[str, dict] = {}
    result: list[dict] = []

    for date in all_dates:
        cashflow_today = 0.0
        while tx_idx < n_txs:
            tx = transactions[tx_idx]
            tx_date = (
                tx.date.date().isoformat()
                if hasattr(tx.date, "date")
                else str(tx.date)[:10]
            )
            if tx_date > date:
                break
            t = tx.ticker
            if t not in holdings:
                holdings[t] = {"quantity": 0, "total_cost": 0.0}
            h = holdings[t]
            if tx.type == "BUY":
                h["total_cost"] += tx.quantity * tx.price
                h["quantity"] += tx.quantity
                cashflow_today += tx.quantity * tx.price
            elif tx.type == "SELL" and h["quantity"] > 0:
                avg = h["total_cost"] / h["quantity"]
                sold = min(tx.quantity, h["quantity"])
                h["total_cost"] -= avg * sold
                h["quantity"] -= sold
                cashflow_today -= sold * tx.price
            tx_idx += 1

        total_value = 0.0
        for ticker, h in holdings.items():
            if h["quantity"] <= 0:
                continue
            price = price_lookup.get(ticker, {}).get(date)
            total_value += h["quantity"] * price if price is not None else h["total_cost"]

        if total_value > 0:
            result.append({
                "date": date,
                "value": round(total_value, 2),
                "cashflow": round(cashflow_today, 2),
            })

    return result


def time_weighted_daily_returns(series: list[dict]) -> list[float]:
    """r_i = (V_i - cashflow_i - V_{i-1}) / V_{i-1} — strips capital injection bias."""
    returns: list[float] = []
    for i in range(1, len(series)):
        prev_v = series[i - 1]["value"]
        if prev_v <= 0:
            continue
        curr_v = series[i]["value"]
        cf = series[i].get("cashflow", 0.0)
        returns.append((curr_v - cf - prev_v) / prev_v)
    return returns


def time_weighted_daily_returns_dated(series: list[dict]) -> list[tuple[str, float]]:
    result: list[tuple[str, float]] = []
    for i in range(1, len(series)):
        prev_v = series[i - 1]["value"]
        if prev_v <= 0:
            continue
        curr_v = series[i]["value"]
        cf = series[i].get("cashflow", 0.0)
        result.append((series[i]["date"], (curr_v - cf - prev_v) / prev_v))
    return result


def align_returns_with_ibov(
    portfolio_series: list[dict],
    ibov_history: list[dict],
) -> tuple[list[float], list[float]]:
    port_by_date = dict(time_weighted_daily_returns_dated(portfolio_series))

    sorted_ibov = sorted(ibov_history, key=lambda x: x["date"])
    ibov_by_date: dict[str, float] = {}
    for prev, curr in zip(sorted_ibov, sorted_ibov[1:]):
        if prev["close"] > 0:
            ibov_by_date[curr["date"]] = (curr["close"] - prev["close"]) / prev["close"]

    common = sorted(set(port_by_date) & set(ibov_by_date))
    return [port_by_date[d] for d in common], [ibov_by_date[d] for d in common]


def cumulative_return_from_daily(daily_returns: list[float]) -> float:
    cum = 1.0
    for r in daily_returns:
        cum *= 1.0 + r
    return round((cum - 1.0) * 100, 4)


def _daily_returns_from_values(values: list[float]) -> list[float]:
    return [
        (values[i] - values[i - 1]) / values[i - 1]
        for i in range(1, len(values))
        if values[i - 1] > 0
    ]


def _build_positions(transactions: list[Any]) -> dict[str, dict]:
    positions: dict[str, dict] = {}
    for tx in transactions:
        t = tx.ticker
        if t not in positions:
            positions[t] = {"ticker": t, "sector": tx.sector, "quantity": 0, "cost": 0.0}
        if tx.type == "BUY":
            positions[t]["cost"] += tx.quantity * tx.price
            positions[t]["quantity"] += tx.quantity
        elif tx.type == "SELL":
            avg = positions[t]["cost"] / positions[t]["quantity"] if positions[t]["quantity"] else 0
            positions[t]["cost"] -= avg * tx.quantity
            positions[t]["quantity"] -= tx.quantity
    return {k: v for k, v in positions.items() if v["quantity"] > 0}


async def compute_portfolio(transactions: list[Any]) -> PortfolioSummary:
    positions = _build_positions(transactions)
    if not positions:
        return PortfolioSummary(
            total_invested=0, current_value=0, total_pnl=0, total_pnl_pct=0, positions=[]
        )

    prices = await get_quotes(list(positions.keys()))
    summaries: list[PositionSummary] = []
    total_invested = 0.0
    current_value = 0.0

    for ticker, pos in positions.items():
        avg_price = pos["cost"] / pos["quantity"]
        total_inv = pos["cost"]
        curr_price = prices.get(ticker)
        curr_val = curr_price * pos["quantity"] if curr_price is not None else None
        pnl = (curr_val - total_inv) if curr_val is not None else None
        pnl_pct = (pnl / total_inv * 100) if (pnl is not None and total_inv > 0) else None

        total_invested += total_inv
        current_value += curr_val if curr_val is not None else total_inv

        summaries.append(PositionSummary(
            ticker=ticker,
            sector=pos["sector"],
            quantity=pos["quantity"],
            avg_price=round(avg_price, 2),
            current_price=curr_price,
            total_invested=round(total_inv, 2),
            current_value=round(curr_val, 2) if curr_val is not None else None,
            pnl=round(pnl, 2) if pnl is not None else None,
            pnl_pct=round(pnl_pct, 2) if pnl_pct is not None else None,
        ))

    total_pnl = current_value - total_invested
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0

    return PortfolioSummary(
        total_invested=round(total_invested, 2),
        current_value=round(current_value, 2),
        total_pnl=round(total_pnl, 2),
        total_pnl_pct=round(total_pnl_pct, 2),
        positions=summaries,
    )


async def compute_analytics(transactions: list[Any]) -> AnalyticsSummary:
    portfolio = await compute_portfolio(transactions)
    positions = portfolio.positions

    sector_map: dict[str, float] = defaultdict(float)
    for p in positions:
        val = p.current_value if p.current_value is not None else p.total_invested
        sector_map[p.sector] += val

    total_val = sum(sector_map.values()) or 1
    sector_allocation = [
        SectorAllocation(sector=s, value=round(v, 2), percentage=round(v / total_val * 100, 2))
        for s, v in sector_map.items()
    ]

    tickers = [p.ticker for p in positions]
    if tickers:
        raw_histories = await asyncio.gather(
            *[get_historical(t, "1m") for t in tickers], return_exceptions=True
        )
        price_history = {
            t: h for t, h in zip(tickers, raw_histories)
            if isinstance(h, list) and h
        }
        value_series = build_portfolio_value_series(transactions, price_history)
    else:
        value_series = []

    if value_series:
        perf_history = [PerformancePoint(date=p["date"], value=p["value"]) for p in value_series]
    else:
        perf_history = _fallback_performance(portfolio.total_invested, portfolio.current_value)

    sorted_by_pnl = sorted(
        [p for p in positions if p.pnl_pct is not None],
        key=lambda x: x.pnl_pct or 0,
        reverse=True,
    )

    return AnalyticsSummary(
        sector_allocation=sector_allocation,
        performance_history=perf_history,
        top_gainers=sorted_by_pnl[:3],
        top_losers=sorted_by_pnl[-3:][::-1],
    )


def _fallback_performance(total_invested: float, current_value: float) -> list[PerformancePoint]:
    today = datetime.utcnow()
    points = []
    for i in range(30, -1, -1):
        day = today - timedelta(days=i)
        progress = (30 - i) / 30
        value = total_invested + (current_value - total_invested) * progress
        points.append(PerformancePoint(date=day.strftime("%Y-%m-%d"), value=round(value, 2)))
    return points
