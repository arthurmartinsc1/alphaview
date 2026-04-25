from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import HistoricalPoint, HistoricalResponse, QuoteResponse, RangeParam
from app.services.brapi import get_historical, get_ibov_historical, get_quote

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/quote/{ticker}", response_model=QuoteResponse)
async def quote(ticker: str):
    """Live quote: price, absolute change, and percent change."""
    data = await get_quote(ticker.upper())
    if data is None:
        raise HTTPException(status_code=404, detail=f"Quote not found for {ticker.upper()}")
    if data["price"] is None:
        raise HTTPException(status_code=502, detail="Incomplete data returned by upstream")
    return QuoteResponse(
        ticker=ticker.upper(),
        price=data["price"],
        change=data["change"] or 0.0,
        changePercent=data["changePercent"] or 0.0,
    )


@router.get("/historical/{ticker}", response_model=HistoricalResponse)
async def historical(
    ticker: str,
    range: RangeParam = Query(default="1m", description="1m | 3m | 6m | 1y"),
):
    """Daily closing prices for a ticker over the requested range."""
    points = await get_historical(ticker.upper(), range)
    if points is None:
        raise HTTPException(
            status_code=404,
            detail=f"Historical data not found for {ticker.upper()}",
        )
    return HistoricalResponse(
        ticker=ticker.upper(),
        range=range,
        data=[HistoricalPoint(**p) for p in points],
    )


@router.get("/ibov", response_model=HistoricalResponse)
async def ibov(
    range: RangeParam = Query(default="1m", description="1m | 3m | 6m | 1y"),
):
    """Daily Ibovespa (^BVSP) closing values over the requested range."""
    points = await get_ibov_historical(range)
    if points is None:
        raise HTTPException(status_code=502, detail="Could not fetch Ibovespa data")
    return HistoricalResponse(
        ticker="IBOV",
        range=range,
        data=[HistoricalPoint(**p) for p in points],
    )
