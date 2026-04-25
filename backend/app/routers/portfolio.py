from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from prisma import Prisma

from app.models.schemas import (
    PortfolioPositions,
    PortfolioSummary,
    PositionDetail,
    TransactionCreate,
    TransactionResponse,
)
from app.services.analytics import compute_portfolio
from app.services.brapi import get_quotes

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_db() -> Prisma:
    return Prisma()


def _aggregate(transactions: list) -> dict[str, dict]:
    """
    Weighted-average-cost aggregation ordered by date (caller must pre-sort ASC).
    Returns only open positions (quantity > 0).
    """
    positions: dict[str, dict] = {}

    for tx in transactions:
        t = tx.ticker
        if t not in positions:
            positions[t] = {
                "ticker": t,
                "sector": tx.sector,
                "quantity": 0,
                "total_cost": 0.0,
            }
        pos = positions[t]

        if tx.type == "BUY":
            pos["total_cost"] += tx.quantity * tx.price
            pos["quantity"] += tx.quantity

        elif tx.type == "SELL":
            if pos["quantity"] > 0:
                avg = pos["total_cost"] / pos["quantity"]
                # Guard against selling more than held (data integrity issue)
                sold = min(tx.quantity, pos["quantity"])
                pos["total_cost"] -= avg * sold
                pos["quantity"] -= sold

    return {t: p for t, p in positions.items() if p["quantity"] > 0}


# ── Transactions ──────────────────────────────────────────────────────────────

@router.post("/transaction", response_model=TransactionResponse, status_code=201)
async def create_transaction(body: TransactionCreate):
    db = _get_db()
    await db.connect()
    try:
        tx = await db.transaction.create(
            data={
                "ticker": body.ticker.upper(),
                "type": body.type,
                "quantity": body.quantity,
                "price": body.price,
                "date": body.date,
                "sector": body.sector,
            }
        )
        return tx
    finally:
        await db.disconnect()


@router.get("/transactions", response_model=list[TransactionResponse])
async def list_transactions(ticker: Optional[str] = Query(default=None)):
    db = _get_db()
    await db.connect()
    try:
        where = {"ticker": ticker.upper()} if ticker else {}
        txs = await db.transaction.find_many(where=where, order={"date": "desc"})
        return txs
    finally:
        await db.disconnect()


@router.delete("/transaction/{tx_id}", status_code=204)
async def delete_transaction(tx_id: str):
    db = _get_db()
    await db.connect()
    try:
        existing = await db.transaction.find_unique(where={"id": tx_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Transaction not found")
        await db.transaction.delete(where={"id": tx_id})
    finally:
        await db.disconnect()


# ── Positions ─────────────────────────────────────────────────────────────────

@router.get("/positions", response_model=PortfolioPositions)
async def get_positions():
    """
    Aggregates all transactions into open positions, enriches each with a live
    price from brapi, and computes unrealised P&L.
    """
    db = _get_db()
    await db.connect()
    try:
        txs = await db.transaction.find_many(order={"date": "asc"})
    finally:
        await db.disconnect()

    agg = _aggregate(txs)
    if not agg:
        return PortfolioPositions(
            positions=[],
            totalPortfolioValue=0.0,
            totalPnl=0.0,
            totalPnlPercent=0.0,
        )

    prices = await get_quotes(list(agg.keys()))

    details: list[PositionDetail] = []
    total_cost = 0.0
    total_value = 0.0

    for ticker, pos in agg.items():
        qty = pos["quantity"]
        avg_price = pos["total_cost"] / qty  # qty > 0 guaranteed by _aggregate
        cost_basis = pos["total_cost"]

        current_price = prices.get(ticker)
        if current_price is not None:
            total_val = current_price * qty
            pnl = (current_price - avg_price) * qty
            pnl_pct = (current_price - avg_price) / avg_price * 100
        else:
            total_val = None
            pnl = None
            pnl_pct = None

        total_cost += cost_basis
        total_value += total_val if total_val is not None else cost_basis

        details.append(
            PositionDetail(
                ticker=ticker,
                sector=pos["sector"],
                quantity=qty,
                avgPrice=round(avg_price, 2),
                currentPrice=round(current_price, 2) if current_price is not None else None,
                pnl=round(pnl, 2) if pnl is not None else None,
                pnlPercent=round(pnl_pct, 2) if pnl_pct is not None else None,
                totalValue=round(total_val, 2) if total_val is not None else None,
            )
        )

    total_pnl = total_value - total_cost
    total_pnl_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0.0

    return PortfolioPositions(
        positions=details,
        totalPortfolioValue=round(total_value, 2),
        totalPnl=round(total_pnl, 2),
        totalPnlPercent=round(total_pnl_pct, 2),
    )


# ── Legacy summary (used by analytics service via frontend) ───────────────────

@router.get("/summary", response_model=PortfolioSummary)
async def portfolio_summary():
    db = _get_db()
    await db.connect()
    try:
        txs = await db.transaction.find_many(order={"date": "asc"})
        return await compute_portfolio(txs)
    finally:
        await db.disconnect()
