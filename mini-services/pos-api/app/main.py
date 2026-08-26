"""FastAPI app entrypoint. CORS allow all, includes API router, seeds on startup."""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config
from .api.routes import router as api_router
from .db import Base, engine
from .services.seed import seed

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pos_api")

app = FastAPI(
    title="POS API",
    description="FastAPI backend for the Naseeb Biryani POS migration.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ALLOW_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables + seed on startup.
@app.on_event("startup")
def _on_startup():
    log.info("Creating tables (if missing)...")
    Base.metadata.create_all(bind=engine)
    if config.SEED_ON_STARTUP:
        log.info("Running seed (idempotent)...")
        try:
            result = seed()
            log.info("Seed result: %s", result)
        except Exception:
            log.exception("Seed failed; continuing startup anyway.")


app.include_router(api_router)


@app.get("/")
def root():
    return {"service": "pos-api", "status": "running", "docs": "/docs"}
