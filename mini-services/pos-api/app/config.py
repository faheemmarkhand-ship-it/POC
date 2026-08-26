"""Application configuration."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# SQLite by default. To switch to PostgreSQL, set POS_API_DATABASE_URL=postgresql://user:pass@host:5432/pos
# Examples:
#   sqlite:///pos_server.db  (default, auto-resolved to abs path)
#   postgresql+psycopg://user:pass@localhost:5432/pos
# We deliberately use a POS-specific env var name to avoid clobbering the
# frontend's global `DATABASE_URL` (set elsewhere in the sandbox).
DATABASE_URL = os.environ.get(
    "POS_API_DATABASE_URL",
    f"sqlite:///{BASE_DIR / 'pos_server.db'}",
)

# Path to seed data json (mounted at service root).
SEED_DATA_PATH = Path(os.environ.get("SEED_DATA_PATH", "/home/z/my-project/upload/seed_data.json"))

# Whether to seed on first run (when DB empty).
SEED_ON_STARTUP = os.environ.get("SEED_ON_STARTUP", "1") == "1"

# CORS - allow all (frontend served via gateway on different port).
CORS_ALLOW_ORIGINS = ["*"]
