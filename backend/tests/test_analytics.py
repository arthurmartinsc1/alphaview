import math
from dataclasses import dataclass
from datetime import datetime, timezone

import pytest

from app.routers.portfolio import _aggregate
from app.services.analytics import (
    align_returns_with_ibov,
    build_portfolio_value_series,
    compute_beta,
    compute_jensens_alpha,
    compute_max_drawdown,
    compute_sharpe,
    compute_sortino,
    compute_tracking_error,
    compute_var_historical,
    cumulative_return_from_daily,
    time_weighted_daily_returns,
)
from app.services.brapi import _token_params


@dataclass
class FakeTx:
    ticker: str
    type: str
    quantity: int
    price: float
    date: datetime
    sector: str = "Test"


def _utc(year: int, month: int, day: int) -> datetime:
    return datetime(year, month, day, 12, 0, tzinfo=timezone.utc)


def test_compute_sharpe_zero_volatility_returns_zero():
    assert compute_sharpe([0.001, 0.001, 0.001, 0.001]) == 0.0


def test_compute_sharpe_known_values():
    returns = [0.001, 0.0012, 0.0009, 0.0011, 0.0010]
    assert compute_sharpe(returns, risk_free_annual=0.05) > 5.0


def test_time_weighted_return_isolates_cashflow():
    """
    Capital injected via BUY must not count as performance.
    Day +10% then flat + 1100 injection → TWR = +10%, not +120%.
    """
    series = [
        {"date": "2026-01-01", "value": 1000.0, "cashflow": 1000.0},
        {"date": "2026-01-02", "value": 1100.0, "cashflow": 0.0},
        {"date": "2026-01-03", "value": 2200.0, "cashflow": 1100.0},
    ]
    daily = time_weighted_daily_returns(series)
    assert daily == pytest.approx([0.10, 0.0])
    assert cumulative_return_from_daily(daily) == pytest.approx(10.0)


def test_compute_max_drawdown_basic():
    values = [100, 110, 120, 100, 90, 95, 130]
    assert compute_max_drawdown(values) == pytest.approx(-0.25, abs=1e-4)


def test_compute_max_drawdown_no_loss():
    assert compute_max_drawdown([100, 105, 110, 120, 130]) == 0.0


def test_aggregate_handles_buys_and_partial_sell():
    txs = [
        FakeTx("PETR4", "BUY", 100, 10.0, _utc(2026, 1, 1)),
        FakeTx("PETR4", "BUY", 100, 20.0, _utc(2026, 1, 15)),
        FakeTx("PETR4", "SELL", 50, 25.0, _utc(2026, 2, 1)),
    ]
    result = _aggregate(txs)
    assert result["PETR4"]["quantity"] == 150
    assert result["PETR4"]["total_cost"] / result["PETR4"]["quantity"] == pytest.approx(15.0)


def test_aggregate_drops_fully_sold_position():
    txs = [
        FakeTx("WEGE3", "BUY", 100, 40.0, _utc(2026, 1, 1)),
        FakeTx("WEGE3", "SELL", 100, 50.0, _utc(2026, 2, 1)),
    ]
    assert _aggregate(txs) == {}


def test_build_portfolio_value_series_records_cashflow():
    txs = [FakeTx("PETR4", "BUY", 10, 30.0, _utc(2026, 1, 5))]
    price_history = {
        "PETR4": [
            {"date": "2026-01-05", "close": 30.0},
            {"date": "2026-01-06", "close": 33.0},
        ]
    }
    series = build_portfolio_value_series(txs, price_history)
    assert len(series) == 2
    assert series[0]["cashflow"] == pytest.approx(300.0)
    assert series[1]["value"] == pytest.approx(330.0)
    assert series[1]["cashflow"] == pytest.approx(0.0)


def test_compute_beta_market_neutral():
    returns = [0.01, -0.005, 0.008, -0.003, 0.012]
    assert compute_beta(returns, returns) == pytest.approx(1.0)


def test_compute_beta_defensive():
    market = [0.02, -0.02, 0.04, -0.04]
    assert compute_beta([r * 0.5 for r in market], market) == pytest.approx(0.5, abs=1e-4)


def test_compute_beta_zero_benchmark_variance():
    assert compute_beta([0.01, 0.02], [0.01, 0.01]) == 0.0


def test_compute_sortino_no_downside():
    assert compute_sortino([0.05, 0.06, 0.07, 0.08]) == 0.0


def test_compute_sortino_positive():
    returns = [0.01, -0.005, 0.02, -0.01, 0.015, 0.008, -0.003]
    assert compute_sortino(returns, risk_free_annual=0.0) > 0.0


def test_compute_sortino_worse_than_sharpe_when_downside_heavy():
    """With mostly negative returns, downside std > total std, so |sortino| < |sharpe|."""
    returns = [-0.03, -0.04, -0.02, -0.035, 0.001]
    assert compute_sortino(returns, risk_free_annual=0.0) > compute_sharpe(returns, risk_free_annual=0.0)


def test_compute_var_historical_known_value():
    """95 returns at +1%, 5 at -5% → VaR 95% = 5%."""
    returns = [0.01] * 95 + [-0.05] * 5
    assert compute_var_historical(returns, confidence=0.95) == pytest.approx(0.05, abs=1e-4)


def test_compute_var_historical_insufficient_data():
    assert compute_var_historical([0.01, -0.02, 0.015] * 5) == 0.0


def test_compute_tracking_error_identical_returns_zero():
    returns = [0.01, -0.005, 0.02, -0.01, 0.008]
    assert compute_tracking_error(returns, returns) == pytest.approx(0.0, abs=1e-9)


def test_compute_tracking_error_positive():
    assert compute_tracking_error([0.01, -0.005, 0.02], [0.005, 0.003, 0.015]) > 0.0


def test_compute_jensens_alpha_beta_one_same_return():
    mean_daily = 0.0004
    assert compute_jensens_alpha(mean_daily, mean_daily, beta=1.0, risk_free_annual=0.0) == pytest.approx(0.0, abs=1e-4)


def test_compute_jensens_alpha_positive_skill():
    """Portfolio doubles the market return with β=1 → alpha ≈ +10%."""
    alpha = compute_jensens_alpha(
        mean_portfolio_daily=0.0008,
        mean_benchmark_daily=0.0004,
        beta=1.0,
        risk_free_annual=0.0,
    )
    assert alpha == pytest.approx(10.08, abs=0.1)


def test_compute_jensens_alpha_low_beta_reduces_expected():
    mean_market = 0.0008
    assert compute_jensens_alpha(mean_market, mean_market, beta=0.5, risk_free_annual=0.0) > 0.0


def test_align_returns_with_ibov_common_dates():
    portfolio_series = [
        {"date": "2026-01-02", "value": 1000.0, "cashflow": 1000.0},
        {"date": "2026-01-03", "value": 1010.0, "cashflow": 0.0},
        {"date": "2026-01-04", "value": 1020.0, "cashflow": 0.0},
        {"date": "2026-01-05", "value": 1030.0, "cashflow": 0.0},
    ]
    ibov_history = [
        {"date": "2026-01-02", "close": 130000.0},
        {"date": "2026-01-03", "close": 131300.0},
        {"date": "2026-01-04", "close": 132613.0},
    ]
    port_ret, ibov_ret = align_returns_with_ibov(portfolio_series, ibov_history)
    assert len(port_ret) == 2
    assert ibov_ret[0] == pytest.approx(0.01, abs=1e-4)


def test_token_params_ignores_placeholder(monkeypatch):
    for placeholder in ("", "your_brapi_token_here", "YOUR_BRAPI_TOKEN_HERE", "changeme"):
        monkeypatch.setenv("BRAPI_TOKEN", placeholder)
        assert _token_params() == {}, f"placeholder leaked: {placeholder!r}"


def test_token_params_passes_real_token(monkeypatch):
    monkeypatch.setenv("BRAPI_TOKEN", "abc123XYZ")
    assert _token_params() == {"token": "abc123XYZ"}
