from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.routers import portfolio, analytics, market

app = FastAPI(title="Alphaview API", version="1.0.0")

import os

# When the app sits behind the Next.js rewrite, the browser only ever
# talks to the frontend origin and CORS is moot for those calls. CORS
# matters when you hit the backend directly (curl, /docs, integration
# tests). Default keeps it permissive enough for ngrok/Vercel demos
# without leaking secrets — set CORS_ALLOW_ORIGINS=https://foo.com,...
# in production to lock it down.
_origins = os.getenv("CORS_ALLOW_ORIGINS", "http://localhost:3000,*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins if o.strip()],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(portfolio.router)
app.include_router(analytics.router)
app.include_router(market.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
