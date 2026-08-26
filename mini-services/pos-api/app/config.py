"""Application configuration.

DATABASE SETUP
==============
By default the backend uses a local SQLite file (`pos_server.db`).
To use a real PostgreSQL database (recommended for production), set the
`POS_API_DATABASE_URL` environment variable.

### Using Supabase (recommended online database)
---------------------------------------------
1. Create a project at https://supabase.com
2. Go to Project Settings → Database → Connection string → URI
   You'll get something like:
     postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
3. Set the environment variable (in mini-services/pos-api/.env):

     POS_API_DATABASE_URL=postgresql+psycopg://postgres.[ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres

   Note: use `postgresql+psycopg://` (not just `postgresql://`) so SQLAlchemy
   uses the psycopg driver. The `psycopg2-binary` package must be installed
   (`pip install psycopg2-binary`).
4. Restart the backend — tables are auto-created and seed data is imported.

### Other PostgreSQL providers (Neon, Railway, RDS, etc.)
--------------------------------------------------------
Set the same env var with your provider's connection string.

### SQLite (default, offline/dev only)
--------------------------------------
Leave the env var unset; the backend uses `pos_server.db` in the service folder.
"""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Database connection URL.
# Default: SQLite file in the service folder.
# Set POS_API_DATABASE_URL to use PostgreSQL (Supabase, Neon, Railway, RDS, etc.).
# Examples:
#   sqlite:///pos_server.db                                   (default)
#   postgresql+psycopg://user:pass@localhost:5432/pos         (self-hosted PG)
#   postgresql+psycopg://postgres.abc:pass@aws-0-us-east.pooler.supabase.com:6543/postgres  (Supabase)
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
