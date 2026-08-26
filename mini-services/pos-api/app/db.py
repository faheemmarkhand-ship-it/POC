"""SQLAlchemy engine, session, and Base."""
from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import declarative_base, sessionmaker

from . import config

# SQLite needs check_same_thread=False for FastAPI threading.
connect_args = {}
if config.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(
    config.DATABASE_URL,
    connect_args=connect_args,
    future=True,
    echo=False,
)

# Enable SQLite foreign keys (so soft delete cascade / future FK works).
@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _record):
    if config.DATABASE_URL.startswith("sqlite"):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON;")
        cur.execute("PRAGMA journal_mode=WAL;")
        cur.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a session, ensures close."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
