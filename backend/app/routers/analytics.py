import asyncio
from collections import defaultdict

from fastapi import APIRouter, Query
from prisma import Prisma

from app.models.schemas import (
    AnalyticsSummary,
    ExposureItem,
    MetricsResponse,
    PerformanceComparison,
    RangeParam,
)
from app.services.analytics import (
    _build_positions,
    align_returns_with_ibov,
    build_portfolio_value_series,
    compute_analytics,
    compute_beta,
    compute_exposure_by_sector,
    compute_jensens_alpha,
    compute_max_drawdown,
    compute_performance_vs_benchmark,
    compute_sharpe,
    compute_sortino,
    compute_tracking_error,
    compute_var_historical,
    compute_volatility,
    cumulative_return_from_daily,
    time_weighted_daily_returns,
)
from app.services.brapi import get_historical, get_ibov_historical, get_quotes

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _get_db() -> Prisma:
    return Prisma()


async def _fetch_price_histories(tickers: list[str], range: str) -> dict[str, list[dict]]:
    if not tickers:
        return {}
    results = await asyncio.gather(
        *[get_historical(t, range) for t in tickers], return_exceptions=True
    )
    return {t: h for t, h in zip(tickers, results) if isinstance(h, list) and h}


@router.get("/metrics", response_model=MetricsResponse)
async def get_metrics(range: RangeParam = Query(default="1m")):
    db = _get_db()
    await db.connect()
    try:
        txs = await db.transaction.find_many(order={"date": "asc"})
    finally:
        await db.disconnect()

    empty = MetricsResponse(
        sharpe=None, sortino=None, maxDrawdown=None, volatility=None,
        totalReturn=None, alpha=None, beta=None, var95=None, trackingError=None,
    )
    if not txs:
        return empty

    tickers = list({tx.ticker for tx in txs})

    price_history, ibov_history = await asyncio.gather(
        _fetch_price_histories(tickers, range),
        get_ibov_historical(range),
    )

    portfolio_series = build_portfolio_value_series(txs, price_history)
    if len(portfolio_series) < 2:
        return empty

    daily_returns = time_weighted_daily_returns(portfolio_series)
    if len(daily_returns) < 2:
        return empty

    indexed_values: list[float] = [100.0]
    for r in daily_returns:
        indexed_values.append(indexed_values[-1] * (1.0 + r))

    sharpe = compute_sharpe(daily_returns)
    sortino = compute_sortino(daily_returns)
    max_dd = compute_max_drawdown(indexed_values)
    volatility = compute_volatility(daily_returns)
    total_return = cumulative_return_from_daily(daily_returns)
    var95 = compute_var_historical(daily_returns) if len(daily_returns) >= 20 else None

    alpha: float | None = None
    beta: float | None = None
    tracking_error: float | None = None

    if ibov_history and len(ibov_history) >= 3:
        aligned_port, aligned_ibov = align_returns_with_ibov(portfolio_series, ibov_history)

        if len(aligned_port) >= 2:
            beta_val = compute_beta(aligned_port, aligned_ibov)
            beta = beta_val
            tracking_error = compute_tracking_error(aligned_port, aligned_ibov)
            mean_port = sum(aligned_port) / len(aligned_port)
            mean_ibov = sum(aligned_ibov) / len(aligned_ibov)
            alpha = compute_jensens_alpha(mean_port, mean_ibov, beta_val)

    return MetricsResponse(
        sharpe=sharpe,
        sortino=sortino,
        maxDrawdown=max_dd,
        volatility=volatility,
        totalReturn=total_return,
        alpha=alpha,
        beta=beta,
        var95=var95,
        trackingError=tracking_error,
    )


@router.get("/exposure", response_model=list[ExposureItem])
async def get_exposure():
    db = _get_db()
    await db.connect()
    try:
        txs = await db.transaction.find_many(order={"date": "asc"})
    finally:
        await db.disconnect()

    if not txs:
        return []

    positions = _build_positions(txs)
    if not positions:
        return []

    prices = await get_quotes(list(positions.keys()))

    enriched: list[dict] = []
    sector_totals: dict[str, float] = defaultdict(float)

    for ticker, pos in positions.items():
        price = prices.get(ticker)
        total_val = (price * pos["quantity"]) if price is not None else pos["cost"]
        enriched.append({"sector": pos["sector"], "totalValue": total_val})
        sector_totals[pos["sector"]] += total_val

    percentages = compute_exposure_by_sector(enriched)

    return [
        ExposureItem(
            sector=sector,
            percentage=percentages[sector],
            totalValue=round(total_val, 2),
        )
        for sector, total_val in sector_totals.items()
    ]


@router.get("/performance", response_model=list[PerformanceComparison])
async def get_performance(range: RangeParam = Query(default="1m")):
    db = _get_db()
    await db.connect()
    try:
        txs = await db.transaction.find_many(order={"date": "asc"})
    finally:
        await db.disconnect()

    if not txs:
        return []

    tickers = list({tx.ticker for tx in txs})

    price_history, ibov_history = await asyncio.gather(
        _fetch_price_histories(tickers, range),
        get_ibov_historical(range),
    )

    if not price_history or not ibov_history:
        return []

    portfolio_series = build_portfolio_value_series(txs, price_history)
    if len(portfolio_series) < 2:
        return []

    rows = compute_performance_vs_benchmark(portfolio_series, ibov_history)
    return [PerformanceComparison(**row) for row in rows]


@router.get("/summary", response_model=AnalyticsSummary)
async def analytics_summary():
    db = _get_db()
    await db.connect()
    try:
        txs = await db.transaction.find_many(order={"date": "asc"})
        return await compute_analytics(txs)
    finally:
        await db.disconnect()
