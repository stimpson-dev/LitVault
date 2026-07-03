from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from pathlib import Path

from app.config import get_settings

BACKEND_DIR = Path(__file__).parent.parent


def resolve_db_path(db_path: str) -> Path:
    """Absolute Pfade unveraendert; relative relativ zu backend/ (nicht cwd),
    damit der Default "litvault.db" weiterhin backend/litvault.db trifft."""
    p = Path(db_path)
    return p if p.is_absolute() else BACKEND_DIR / p


# Zum Importzeitpunkt aufgeloest — eine db_path-Aenderung greift erst nach Neustart.
DB_PATH = resolve_db_path(get_settings().db_path)
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

engine = create_async_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)

async_session_factory = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

# Set WAL mode and pragmas on every connection
@event.listens_for(engine.sync_engine, "connect")
def set_sqlite_pragma(dbapi_conn, connection_record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA cache_size=-64000")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()

async def get_db():
    async with async_session_factory() as session:
        yield session
