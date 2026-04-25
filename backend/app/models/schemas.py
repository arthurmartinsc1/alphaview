from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Literal, Optional


TransactionType = Literal["BUY", "SELL"]


class TransactionCreate(BaseModel):
    ticker: str
    type: TransactionType
    quantity: int
    price: float
    date: datetime
    sector: str

    @field_validator("quantity")
    @classmethod
    def quantity_positive(cls, v: int) -> int:
        if v <= 0:
            raise ValueError("quantity must be greater than 0")
        return v

    @field_validator("price")
    @classmethod
    def price_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("price must be greater than 0")
        return v


class TransactionResponse(BaseModel):
    id: str
    ticker: str
    type: str
    quantity: int
    price: float
    date: datetime
    sector: str

    class Config:
        from_attributes = True


class PositionSummary(BaseModel):
    ticker: str
    sector: str
    quantity: int
    avg_price: float
    current_price: Optional[float]
    total_invested: float
    current_value: Optional[float]
    pnl: Optional[float]
    pnl_pct: Optional[float]


class PortfolioSummary(BaseModel):
    total_invested: float
    current_value: float
    total_pnl: float
    total_pnl_pct: float
    positions: list[PositionSummary]


class PositionDetail(BaseModel):
    ticker: str
    sector: str
    quantity: int
    avgPrice: float
    currentPrice: Optional[float]
    pnl: Optional[float]
    pnlPercent: Optional[float]
    totalValue: Optional[float]


class PortfolioPositions(BaseModel):
    positions: list[PositionDetail]
    totalPortfolioValue: float
    totalPnl: float
    totalPnlPercent: float


class SectorAllocation(BaseModel):
    sector: str
    value: float
    percentage: float


class PerformancePoint(BaseModel):
    date: str
    value: float


class AnalyticsSummary(BaseModel):
    sector_allocation: list[SectorAllocation]
    performance_history: list[PerformancePoint]
    top_gainers: list[PositionSummary]
    top_losers: list[PositionSummary]


class MetricsResponse(BaseModel):
    sharpe: Optional[float]
    sortino: Optional[float]
    maxDrawdown: Optional[float]
    volatility: Optional[float]
    totalReturn: Optional[float]
    alpha: Optional[float]
    beta: Optional[float]
    var95: Optional[float]
    trackingError: Optional[float]


class ExposureItem(BaseModel):
    sector: str
    percentage: float
    totalValue: float


class PerformanceComparison(BaseModel):
    date: str
    portfolioReturn: float
    ibovReturn: float
    alpha: float


RangeParam = Literal["1m", "3m", "6m", "1y"]


class QuoteResponse(BaseModel):
    ticker: str
    price: float
    change: float
    changePercent: float


class HistoricalPoint(BaseModel):
    date: str
    close: float


class HistoricalResponse(BaseModel):
    ticker: str
    range: str
    data: list[HistoricalPoint]
