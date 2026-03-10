from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event, text as sa_text
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "litvault.db"
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

async def ensure_fts5():
    """Create FTS5 virtual table and triggers if they don't exist.

    Columns: title, authors, full_text, summary, file_path
    If the existing table is missing file_path, it is rebuilt.
    """
    async with engine.begin() as conn:
        # Check if existing FTS table has file_path column
        needs_rebuild = False
        result = await conn.execute(sa_text(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='documents_fts'"
        ))
        row = result.scalar_one_or_none()
        if row is not None and "file_path" not in row:
            needs_rebuild = True

        if needs_rebuild:
            # Drop old table and triggers, then recreate with file_path
            await conn.execute(sa_text("DROP TRIGGER IF EXISTS documents_ai"))
            await conn.execute(sa_text("DROP TRIGGER IF EXISTS documents_ad"))
            await conn.execute(sa_text("DROP TRIGGER IF EXISTS documents_au"))
            await conn.execute(sa_text("DROP TABLE IF EXISTS documents_fts"))

        await conn.execute(
            sa_text(
                "CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5("
                "title, authors, full_text, summary, file_path, "
                "content=documents, content_rowid=id, "
                "tokenize='porter unicode61 remove_diacritics 1'"
                ")"
            )
        )
        for trigger_sql in [
            """CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
                INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path)
                VALUES (new.id, new.title, new.authors, new.full_text, new.summary, new.file_path);
            END""",
            """CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
                INSERT INTO documents_fts(documents_fts, rowid, title, authors, full_text, summary, file_path)
                VALUES ('delete', old.id, old.title, old.authors, old.full_text, old.summary, old.file_path);
            END""",
            """CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
                INSERT INTO documents_fts(documents_fts, rowid, title, authors, full_text, summary, file_path)
                VALUES ('delete', old.id, old.title, old.authors, old.full_text, old.summary, old.file_path);
                INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path)
                VALUES (new.id, new.title, new.authors, new.full_text, new.summary, new.file_path);
            END""",
        ]:
            await conn.execute(sa_text(trigger_sql))

        if needs_rebuild:
            # Repopulate FTS index from existing documents
            await conn.execute(sa_text(
                "INSERT INTO documents_fts(rowid, title, authors, full_text, summary, file_path) "
                "SELECT id, title, authors, full_text, summary, file_path FROM documents"
            ))


async def get_db():
    async with async_session_factory() as session:
        yield session
