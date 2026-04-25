"""
Seed script for the Alphaview database.

Populates the Transaction table with realistic BUY transactions distributed
over the past 6 months for a diversified B3 portfolio:

    - PETR4 (Energia)        — 3 BUYs
    - VALE3 (Mineração)      — 2 BUYs
    - ITUB4 (Financeiro)     — 3 BUYs
    - WEGE3 (Industrial)     — 2 BUYs
    - BBAS3 (Financeiro)     — 2 BUYs

Run with:
    python seed.py
"""

import asyncio
from datetime import datetime, timedelta, timezone

from prisma import Prisma


# Today's reference: end of the 6-month window. Using UTC to match Prisma DateTime.
TODAY = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)


def _days_ago(days: int) -> datetime:
    return TODAY - timedelta(days=days)


# Realistic prices (BRL) close to recent B3 market values.
SEED_TRANSACTIONS: list[dict] = [
    # ── PETR4 — Energia ──────────────────────────────────────────────
    {"ticker": "PETR4", "type": "BUY", "quantity": 100, "price": 36.50,
     "date": _days_ago(170), "sector": "Energia"},
    {"ticker": "PETR4", "type": "BUY", "quantity": 50,  "price": 38.20,
     "date": _days_ago(95),  "sector": "Energia"},
    {"ticker": "PETR4", "type": "BUY", "quantity": 80,  "price": 39.75,
     "date": _days_ago(30),  "sector": "Energia"},

    # ── VALE3 — Mineração ────────────────────────────────────────────
    {"ticker": "VALE3", "type": "BUY", "quantity": 60,  "price": 62.40,
     "date": _days_ago(150), "sector": "Mineração"},
    {"ticker": "VALE3", "type": "BUY", "quantity": 40,  "price": 65.10,
     "date": _days_ago(60),  "sector": "Mineração"},

    # ── ITUB4 — Financeiro ───────────────────────────────────────────
    {"ticker": "ITUB4", "type": "BUY", "quantity": 120, "price": 29.80,
     "date": _days_ago(160), "sector": "Financeiro"},
    {"ticker": "ITUB4", "type": "BUY", "quantity": 80,  "price": 31.45,
     "date": _days_ago(110), "sector": "Financeiro"},
    {"ticker": "ITUB4", "type": "BUY", "quantity": 50,  "price": 33.20,
     "date": _days_ago(45),  "sector": "Financeiro"},

    # ── WEGE3 — Industrial ───────────────────────────────────────────
    {"ticker": "WEGE3", "type": "BUY", "quantity": 70,  "price": 41.90,
     "date": _days_ago(140), "sector": "Industrial"},
    {"ticker": "WEGE3", "type": "BUY", "quantity": 50,  "price": 45.30,
     "date": _days_ago(50),  "sector": "Industrial"},

    # ── BBAS3 — Financeiro ───────────────────────────────────────────
    {"ticker": "BBAS3", "type": "BUY", "quantity": 100, "price": 26.40,
     "date": _days_ago(130), "sector": "Financeiro"},
    {"ticker": "BBAS3", "type": "BUY", "quantity": 80,  "price": 28.10,
     "date": _days_ago(40),  "sector": "Financeiro"},
]


async def seed() -> None:
    db = Prisma()
    await db.connect()
    try:
        existing = await db.transaction.count()
        if existing > 0:
            print(f"⚠️  Database already has {existing} transactions. "
                  "Wiping before reseeding...")
            await db.transaction.delete_many()

        for tx in SEED_TRANSACTIONS:
            await db.transaction.create(data=tx)

        total = await db.transaction.count()
        print(f"✅ Seed complete: {total} transactions inserted.")
        print("   Tickers: PETR4, VALE3, ITUB4, WEGE3, BBAS3")
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(seed())
