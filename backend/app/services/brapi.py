import asyncio
import os
import time
from datetime import datetime, timezone
from typing import Any, Optional

import httpx

BRAPI_BASE = "https://brapi.dev/api"
CACHE_TTL = 60  # seconds

# key -> (value, monotonic_timestamp)
_cache: dict[str, tuple[Any, float]] = {}

# Maps user-facing range labels to brapi query param values
RANGE_MAP: dict[str, str] = {
    "1m": "1mo",
    "3m": "3mo",
    "6m": "6mo",
    "1y": "1y",
}

IBOV_TICKER = "%5EBVSP"  # URL-encoded ^BVSP

# Placeholder values from .env.example that must NEVER be sent as a real token.
_PLACEHOLDER_TOKENS = {"", "your_brapi_token_here", "changeme", "todo"}


def _token_params() -> dict[str, str]:
    token = os.getenv("BRAPI_TOKEN", "").strip()
    if token.lower() in _PLACEHOLDER_TOKENS:
        return {}
    return {"token": token}


def _cache_get(key: str) -> Optional[Any]:
    entry = _cache.get(key)
    if entry and time.monotonic() - entry[1] < CACHE_TTL:
        return entry[0]
    _cache.pop(key, None)
    return None


def _cache_set(key: str, value: Any) -> None:
    _cache[key] = (value, time.monotonic())


async def get_quote(ticker: str) -> Optional[dict]:
    """Return {price, change, changePercent} for a single ticker, or None on failure."""
    key = f"quote:{ticker}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{BRAPI_BASE}/quote/{ticker}",
                params=_token_params(),
            )
            r.raise_for_status()
            results = r.json().get("results", [])
            if not results:
                return None
            raw = results[0]
            data = {
                "price": raw.get("regularMarketPrice"),
                "change": raw.get("regularMarketChange"),
                "changePercent": raw.get("regularMarketChangePercent"),
            }
            _cache_set(key, data)
            return data
    except Exception:
        return None


async def get_historical(ticker: str, range: str = "1m") -> Optional[list[dict]]:
    """Return [{date, close}] for the given ticker and range, or None on failure."""
    brapi_range = RANGE_MAP.get(range, "1mo")
    key = f"historical:{ticker}:{brapi_range}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    params = {**_token_params(), "range": brapi_range, "interval": "1d", "fundamental": "false"}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{BRAPI_BASE}/quote/{ticker}", params=params)
            r.raise_for_status()
            results = r.json().get("results", [])
            if not results:
                return None
            raw_points = results[0].get("historicalDataPrice", [])
            points = []
            for p in raw_points:
                ts = p.get("date")
                close = p.get("close")
                if ts is None or close is None:
                    continue
                date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
                points.append({"date": date_str, "close": round(float(close), 2)})
            _cache_set(key, points)
            return points
    except Exception:
        return None


async def get_ibov_historical(range: str = "1m") -> Optional[list[dict]]:
    """
    Return [{date, close}] for the Ibovespa index, or None on failure.

    Brapi's free plan only allows ranges 1d/5d/1mo/3mo for ^BVSP, so when the
    user asks for 6m or 1y we try the requested range first and progressively
    fall back to a shorter one. The portfolio/IBOV alignment in
    `compute_performance_vs_benchmark` will simply use whichever common dates
    exist, so the chart degrades gracefully instead of going empty.
    """
    fallbacks = {
        "1y": ["1y", "6m", "3m"],
        "6m": ["6m", "3m"],
        "3m": ["3m"],
        "1m": ["1m"],
    }.get(range, [range, "3m", "1m"])

    for r in fallbacks:
        data = await get_historical(IBOV_TICKER, r)
        if data:
            return data
    return None


async def get_quotes(tickers: list[str]) -> dict[str, Optional[float]]:
    """
    Batch price fetch used by the analytics service. Returns {ticker: price}.

    Brapi's free tier returns 401 for multi-ticker requests when no token is
    set, so on any failure we fall back to N parallel single-ticker calls
    (which DO work without a token).
    """
    if not tickers:
        return {}

    joined = ",".join(tickers)
    key = f"quotes:{joined}"
    cached = _cache_get(key)
    if cached is not None:
        return cached

    prices: dict[str, Optional[float]] = {t: None for t in tickers}

    # Try the batch endpoint first (cheap when it works).
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(
                f"{BRAPI_BASE}/quote/{joined}",
                params=_token_params(),
            )
            r.raise_for_status()
            for result in r.json().get("results", []):
                symbol = result.get("symbol", "").replace(".SA", "")
                prices[symbol] = result.get("regularMarketPrice")
    except Exception:
        pass

    # Fill any gaps with per-ticker requests in parallel.
    missing = [t for t, p in prices.items() if p is None]
    if missing:
        results = await asyncio.gather(
            *[get_quote(t) for t in missing], return_exceptions=True
        )
        for ticker, data in zip(missing, results):
            if isinstance(data, dict) and data.get("price") is not None:
                prices[ticker] = data["price"]

    _cache_set(key, prices)
    return prices
