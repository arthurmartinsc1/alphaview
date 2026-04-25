# Portfolio Analytics Platform

**Alphaview** is a real-time B3 (Brasil, Bolsa, Balcão) portfolio analytics
platform that turns a list of trades into institutional-grade risk and
performance metrics: live P&L, Jensen's Alpha, Sortino ratio, VaR histórico,
tracking error, beta vs. IBOV, sector exposure, and daily benchmark comparison
against the **Ibovespa**.

Built as a production-shaped full-stack application with a FastAPI backend,
a Next.js dashboard, PostgreSQL via Prisma, and live market data from
[Brapi](https://brapi.dev).

---

## Features

- **Transactions** — record BUY/SELL trades for any B3 ticker.
- **Positions** — weighted-average cost, live price, unrealised P&L per asset.
- **Risk metrics** (all time-weighted, supporting 1m / 3m / 6m / 1y ranges):
  - **Jensen's Alpha** — β-adjusted annualised excess return: `α = Rp − [Rf + β(Rm − Rf)]`
  - **Beta** — portfolio sensitivity to the Ibovespa
  - **Sharpe ratio** — annualised, risk-free rate calibrated to the Selic (10.5% p.a.)
  - **Sortino ratio** — like Sharpe but penalises only downside volatility
  - **Historical VaR 95%** — 1-day loss threshold at 95% confidence
  - **Tracking error** — annualised std of excess returns vs. IBOV
  - **Max drawdown** — rolling-peak methodology
  - **Volatility** — annualised standard deviation of daily returns
- **Sector exposure** — current allocation by sector at market value.
- **Performance vs. benchmark** — daily cumulative return of the portfolio
  vs. the Ibovespa, computed via Time-Weighted Return (capital inflows excluded).

---

## Tech Stack

| Layer       | Technology                                    |
| ----------- | --------------------------------------------- |
| Backend     | **FastAPI** (Python 3.12), Uvicorn            |
| Frontend    | **Next.js 14** (App Router), React 18, Tailwind |
| Database    | **PostgreSQL 16**                             |
| ORM         | **Prisma** (prisma-client-py, async)          |
| Market data | **Brapi** REST API                            |
| Charts      | **Recharts**                                  |
| Container   | **Docker / docker-compose**                   |

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) **20+**
- [docker-compose](https://docs.docker.com/compose/install/) **v2+**

That is the entire local toolchain — Python and Node are only needed inside
the containers.

---

## Setup

```bash
# 1. Clone and enter the project
git clone <repo-url> alphaview && cd alphaview

# 2. Copy environment files (and add your BRAPI_TOKEN if you have one)
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 3. Build and start everything (postgres + backend + frontend)
docker-compose up --build

# 4. In another terminal, seed the database with sample data
docker-compose exec backend python seed.py
```

Then open:

- Frontend dashboard → <http://localhost:3000>
- API docs (Swagger UI) → <http://localhost:8000/docs>

> **Note on Brapi token.** The free tier works without a token but is
> rate-limited. For best results, register at <https://brapi.dev> and put
> your token in `backend/.env` as `BRAPI_TOKEN=...`.

---

## Endpoints

All endpoints return JSON. Range parameter accepts `1m | 3m | 6m | 1y`.

| Method | Path                              | Description                                           |
| ------ | --------------------------------- | ----------------------------------------------------- |
| GET    | `/health`                         | Liveness probe                                        |
| POST   | `/portfolio/transaction`          | Create a BUY/SELL transaction                         |
| GET    | `/portfolio/transactions`         | List all transactions (optional `?ticker=`)           |
| DELETE | `/portfolio/transaction/{id}`     | Delete a transaction                                  |
| GET    | `/portfolio/positions`            | Open positions with live price + P&L                  |
| GET    | `/portfolio/summary`              | Legacy aggregate portfolio summary                    |
| GET    | `/analytics/metrics?range=`       | Jensen's Alpha, Beta, Sharpe, Sortino, VaR 95%, Tracking Error, Max Drawdown, Volatility, Total Return |
| GET    | `/analytics/exposure`             | Sector allocation by current market value             |
| GET    | `/analytics/performance?range=`   | Daily portfolio return vs. IBOV                       |
| GET    | `/analytics/summary`              | Legacy combined dashboard payload                     |
| GET    | `/market/quote/{ticker}`          | Live quote for a single ticker                        |
| GET    | `/market/historical/{ticker}?range=` | Daily closing prices for a ticker                  |
| GET    | `/market/ibov?range=`             | Daily Ibovespa closing values                         |

---

## Project Structure

```
alphaview/
├── backend/                FastAPI service
│   ├── app/
│   │   ├── models/         Pydantic schemas
│   │   ├── routers/        portfolio, analytics, market
│   │   └── services/       brapi client, analytics computations
│   ├── main.py             FastAPI app entrypoint
│   ├── seed.py             Sample data loader
│   └── schema.prisma       Prisma datamodel
├── frontend/               Next.js 14 dashboard
│   ├── app/                App Router pages (dashboard, positions, analytics)
│   ├── components/         Reusable UI (StatCard, RangeSelector, Sidebar)
│   └── lib/                API client + utilities
└── docker-compose.yml      postgres + backend + frontend
```

---

## Screenshots

<!-- Drop UI screenshots here (or animated GIFs) once the dashboard is running. -->

| Dashboard | Positions | Analytics |
| --------- | --------- | --------- |
| _coming soon_ | _coming soon_ | _coming soon_ |

---

## License

MIT
